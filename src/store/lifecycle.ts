import { createHeartbeat } from '../liveness.js'
import { createMeter } from '../metrics/index.js'
import type { Workspace } from '../types.js'
import { watchWorkspaces } from '../watcher.js'
import { sortByDeps, sortByName } from '../workspaces.js'
import { escalateKill, isRunning, killTree } from './children.js'
import { discoverFiltered } from './discovery.js'
import { clearTimers, newEntry, note } from './entry.js'
import { changed } from './snapshot.js'
import { spawnWorkspace } from './spawn.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'
import { rediscover } from './watch.js'

export async function start(ctx: StoreContext): Promise<boolean> {
	const workspaces = discoverFiltered(ctx)

	if (workspaces.length === 0) return false

	const startOrder = sortByDeps(workspaces)

	// In run order `sortForDisplay` is `sortByDeps`; reuse startOrder instead of sorting twice.
	const sorted = ctx.sortOrder === 'run' ? startOrder : sortByName(workspaces)

	ctx.order = sorted.map((w) => w.name)

	for (const workspace of workspaces) {
		ctx.entries.set(workspace.name, newEntry(workspace))
	}

	changed(ctx)

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
		const failedDeps = workspace.deps.filter((d) => failedPackages.has(d))

		if (failedDeps.length > 0) {
			const entry = ctx.entries.get(workspace.name)

			if (entry) {
				note(entry, `warning: dependency ${failedDeps.join(', ')} failed — starting anyway`)

				changed(ctx)
			}
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
			onChange: () => changed(ctx),
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

				if (
					status === 'watching' ||
					status === 'ready' ||
					status === 'error' ||
					status === 'stopped' ||
					status === 'timeout'
				) {
					remaining.delete(name)
				}
			}

			if (remaining.size === 0) {
				ctx.listeners.delete(check)

				resolve()
			}
		}

		ctx.listeners.add(check)

		check()
	})
}

export async function shutdown(ctx: StoreContext): Promise<void> {
	ctx.stopping = true

	ctx.watcher?.close()

	ctx.heartbeat?.stop()
	ctx.meter?.stop()

	for (const entry of ctx.entries.values()) clearTimers(entry)

	for (const child of ctx.pendingRebuilds) child.kill('SIGTERM')

	const waiting: Promise<void>[] = []
	for (const entry of ctx.entries.values()) {
		const { child } = entry

		if (!isRunning(child)) continue

		waiting.push(
			new Promise((resolve) => {
				const escalate = escalateKill(child)

				child.on('close', () => {
					clearTimeout(escalate)

					resolve()
				})

				killTree(child, 'SIGTERM')
			}),
		)
	}
	await Promise.all(waiting)
}
