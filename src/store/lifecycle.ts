import type { ChildProcess } from 'node:child_process'
import { createHeartbeat } from '../health/index.js'
import { createMeter } from '../metrics/index.js'
import type { Workspace } from '../types.js'
import { watchWorkspaces } from '../watcher.js'
import { sortByDeps, sortByName } from '../workspaces.js'
import { escalateKill, isRunning, killTree } from './children.js'
import { discoverFiltered } from './discovery.js'
import { clearTimers, createEntry, note } from './entry.js'
import { rediscover } from './reconcile.js'
import { markChanged } from './snapshot.js'
import { spawnWorkspace } from './spawn.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'

export async function start(ctx: StoreContext): Promise<boolean> {
	const workspaces = discoverFiltered(ctx)

	if (workspaces.length === 0) return false

	const startOrder = sortByDeps(workspaces)

	// In run order `sortForDisplay` is `sortByDeps`; reuse startOrder instead of sorting twice.
	const sorted = ctx.sortOrder === 'run' ? startOrder : sortByName(workspaces)

	ctx.order = sorted.map((w) => w.name)

	for (const workspace of workspaces) {
		ctx.entries.set(workspace.name, createEntry(workspace))
	}

	markChanged(ctx)

	if (ctx.watchEnabled) {
		ctx.watcher = watchWorkspaces(ctx.root, () => rediscover(ctx))
	}

	// Spawn in the background; the dashboard already renders the pending list.
	void spawnAll(ctx, startOrder)

	return true
}

async function spawnAll(ctx: StoreContext, workspaces: Workspace[]): Promise<void> {
	ctx.allWorkspaces = workspaces

	const packages = workspaces.filter((w) => w.kind === 'package')
	const apps = workspaces.filter((w) => w.kind !== 'package')

	for (const workspace of packages) spawnWorkspace(ctx, workspace)

	if (packages.length > 0) {
		await waitForPackages(
			ctx,
			packages.map((p) => p.name),
		)
	}

	// Shutdown may have begun while we awaited the package gate. Bail before spawning apps
	// or arming the heartbeat/meter — those would spawn children the completed teardown has
	// already passed, leaking them, and start timers on a torn-down store.
	if (ctx.stopping) return

	const failedPackages = new Set<string>()

	for (const pkg of packages) {
		const status = ctx.entries.get(pkg.name)?.process.status

		if (status === 'error' || status === 'stopped' || status === 'timeout') {
			failedPackages.add(pkg.name)
		}
	}

	for (const workspace of apps) {
		const entry = ctx.entries.get(workspace.name)

		// The gate was open long enough for the app to be claimed elsewhere: removed by a
		// rediscovery (no entry), re-added and already spawned, or stopped by hand. Only a
		// still-pending app is this loop's to start.
		if (entry?.process.status !== 'pending') continue

		const failedDeps = workspace.deps.filter((d) => failedPackages.has(d))

		if (failedDeps.length > 0) {
			note(entry, `warning: dependency ${failedDeps.join(', ')} failed — starting anyway`)

			markChanged(ctx)
		}

		spawnWorkspace(ctx, workspace)
	}

	ctx.heartbeat = createHeartbeat({
		entries: () => ctx.entries,
		setStatus: (name, status) => setStatus(ctx, name, status),
	})

	if (ctx.metricsEnabled) {
		ctx.meter = createMeter({
			roots: () => runningRoots(ctx),
			setMetrics: (name, metrics) => {
				const entry = ctx.entries.get(name)

				if (!entry) return false

				entry.process.metrics = metrics

				return true
			},
			onChange: () => markChanged(ctx),
		})
	}
}

/** Running root PIDs mapped to their workspace name, for the meter to sample. */
function runningRoots(ctx: StoreContext): Map<number, string> {
	const roots = new Map<number, string>()

	for (const [name, entry] of ctx.entries) {
		if (isRunning(entry.child) && entry.child.pid !== undefined) {
			roots.set(entry.child.pid, name)
		}
	}

	return roots
}

function waitForPackages(ctx: StoreContext, names: string[]): Promise<void> {
	const remaining = new Set(names)

	return new Promise((resolve) => {
		const check = () => {
			for (const name of [...remaining]) {
				const status = ctx.entries.get(name)?.process.status

				// Wait only while a package is still starting (pending/building). Any other
				// state releases the gate: it settled (ready/watching/error/stopped/timeout),
				// was paused (which also clears its startup timer, so it can never time out),
				// or was removed by a rediscovery (status undefined). Gating on a positive
				// "settled" set instead would wedge the app tier — and the meter/heartbeat
				// armed after this gate — on a package that will never reach it.
				if (status !== 'pending' && status !== 'building') remaining.delete(name)
			}

			// Shutdown kills the packages without settling their status, so release on it too
			// rather than leave this listener (and spawnAll) pending forever.
			if (remaining.size === 0 || ctx.stopping) {
				ctx.listeners.delete(check)

				resolve()
			}
		}

		ctx.listeners.add(check)

		check()
	})
}

/**
 * Best-effort synchronous SIGKILL of every child group. {@link shutdown} is the graceful
 * path; this is the last-resort backstop for exit routes that bypass it — a fatal signal, an
 * uncaught throw, a forced quit — so a detached dev-server group is never left orphaned
 * holding its port. Safe to run inside a `process.on('exit')` handler, where only synchronous
 * work is possible.
 *
 * Walks the owned groups rather than the entries, so a removed workspace still draining and a
 * group whose leader already exited (a wrapper whose server still holds the pipes) are both
 * reached. Signalling `-pid` for such a group is safe: the kernel keeps a process-group id
 * reserved while any member lives, and a group whose stdio has closed has left the set.
 */
export function killAllSync(ctx: StoreContext): void {
	ctx.stopping = true

	for (const child of ctx.groups) killTree(child, 'SIGKILL')

	for (const child of ctx.pendingRebuilds) {
		try {
			child.kill('SIGKILL')
		} catch {
			// Already gone.
		}
	}
}

export async function shutdown(ctx: StoreContext): Promise<void> {
	ctx.stopping = true

	ctx.watcher?.close()

	ctx.heartbeat?.stop()
	ctx.meter?.stop()

	for (const entry of ctx.entries.values()) clearTimers(entry)

	for (const child of ctx.pendingRebuilds) child.kill('SIGTERM')

	// Wake waiters (the package gate) so they observe `stopping` and release.
	markChanged(ctx)

	const paused = new Set<ChildProcess>()

	for (const entry of ctx.entries.values()) {
		if (entry.child && entry.pausedFrom !== null) paused.add(entry.child)
	}

	// Every owned group, not just entries with a running leader: see killAllSync.
	const waiting = [...ctx.groups].map(
		(child) =>
			new Promise<void>((resolve) => {
				const escalate = escalateKill(child)

				child.on('close', () => {
					clearTimeout(escalate)

					resolve()
				})

				// A SIGSTOP'd child ignores SIGTERM until continued, so wake it first; otherwise
				// the terminate only lands after the SIGKILL grace period elapses — matching the
				// per-process teardown in beginTeardown.
				if (paused.has(child)) killTree(child, 'SIGCONT')

				killTree(child, 'SIGTERM')
			}),
	)

	await Promise.all(waiting)
}
