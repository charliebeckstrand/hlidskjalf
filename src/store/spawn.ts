import { type ChildProcess, spawn } from 'node:child_process'
import { appendLog } from '../logs.js'
import { safeEnv } from '../metrics/index.js'
import { parseLine, sanitizeForDisplay, stripAnsi } from '../parser.js'
import type { Workspace } from '../types.js'
import { createUnrefTimer, truncate } from '../util.js'
import {
	MAX_BUFFER_SIZE,
	MAX_LINE_LENGTH,
	MAX_RESTART_RETRIES,
	RESTART_DELAY_MS,
	STARTUP_TIMEOUT_MS,
} from './constants.js'
import { note } from './entry.js'
import { createLineBuffer } from './lines.js'
import { clearErrorTimer, scheduleErrorRecovery } from './recovery.js'
import { markChanged } from './snapshot.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'

export function spawnWorkspace(ctx: StoreContext, workspace: Workspace): void {
	const child = spawn('pnpm', ['--filter', workspace.name, 'run', 'dev'], {
		cwd: ctx.root,
		stdio: 'pipe',
		env: safeEnv(),
		// Own process group per dev process. Sharing ours means a toolchain that tears
		// itself down via `kill -- -<pgid>` also signals hlidskjalf, whose SIGTERM handler
		// then exits the UI. A dedicated group also reaps the real server under `pnpm`
		// instead of orphaning it.
		detached: true,
	})

	const entry = ctx.entries.get(workspace.name)

	if (entry) {
		entry.child = child

		entry.intentionalExit = false

		entry.pausedFrom = null
	}

	setStatus(ctx, workspace.name, 'building')

	const startupTimer = createUnrefTimer(STARTUP_TIMEOUT_MS, () => {
		const liveEntry = ctx.entries.get(workspace.name)

		if (liveEntry) {
			liveEntry.startupTimer = null

			if (liveEntry.process.status !== 'watching' && liveEntry.process.status !== 'ready') {
				note(liveEntry, `startup timeout after ${STARTUP_TIMEOUT_MS / 1000}s`)

				setStatus(ctx, workspace.name, 'timeout')
			}
		}
	})

	if (entry) entry.startupTimer = startupTimer

	const lineBuffer = createLineBuffer(MAX_BUFFER_SIZE)

	const onData = (data: Buffer) => {
		// Ignore a stale child's output. If the workspace was removed and re-added under the
		// same name, the live entry now holds a different child; this one's teardown noise
		// must not land in the new instance's log or drive its status.
		if (ctx.entries.get(workspace.name)?.child !== child) return

		for (const line of lineBuffer.push(data.toString())) handleLine(ctx, workspace.name, line)
	}

	child.stdout?.on('data', onData)
	child.stderr?.on('data', onData)

	child.on('close', (code, signal) => {
		const rest = lineBuffer.flush()

		const entry = ctx.entries.get(workspace.name)

		// A stale child from a prior instance — the workspace was removed and re-added under
		// the same name while this child's SIGTERM was still draining — must not mutate the
		// live entry that replaced it, or its delayed exit flips a healthy new instance into
		// a false crash and schedules a spurious restart.
		if (entry?.child !== child) return

		if (rest !== null) handleLine(ctx, workspace.name, rest)

		if (ctx.stopping) return

		// A deliberate stop/restart handles its own teardown; don't treat it as a crash.
		if (entry.intentionalExit) return

		handleUnexpectedExit(ctx, workspace, code, signal)
	})

	child.on('error', () => {
		const liveEntry = ctx.entries.get(workspace.name)

		// Ignore an error surfacing from a stale child the live entry has already replaced.
		if (liveEntry?.child !== child) return

		if (liveEntry.startupTimer) {
			clearTimeout(liveEntry.startupTimer)

			liveEntry.startupTimer = null
		}

		setStatus(ctx, workspace.name, 'error')
	})
}

function handleLine(ctx: StoreContext, name: string, raw: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	// Output draining from a child we're intentionally stopping is teardown noise: when we
	// SIGTERM the group, `pnpm run dev` logs ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL and "Command
	// failed with signal SIGTERM" on its way out. The stop was ours, so drop it rather than
	// surface a failure that didn't happen. A restart clears the flag when the child respawns.
	if (entry.intentionalExit) return

	const line = truncate(raw, MAX_LINE_LENGTH)

	const { process: proc } = entry

	appendLog(proc.logs, sanitizeForDisplay(line))

	entry.lastOutputAt = Date.now()

	// Output draining from a paused child's pipe must not flip its status out of
	// `paused`. Keep logging, leave the status alone.
	if (entry.pausedFrom !== null) {
		markChanged(ctx)

		return
	}

	const prevStatus = proc.status

	if (proc.status === 'idle') proc.status = entry.lastGoodStatus ?? 'ready'

	const { status, url } = parseLine(stripAnsi(line))

	if (status) {
		if (status === 'error') {
			scheduleErrorRecovery(ctx, name)
		} else {
			entry.lastGoodStatus = status

			clearErrorTimer(ctx, name)

			entry.restartRetries = 0

			if (status === 'watching' || status === 'ready') {
				if (entry.startupTimer) {
					clearTimeout(entry.startupTimer)

					entry.startupTimer = null
				}
			}
		}
		proc.status = status
	}
	if (url) proc.url = url

	// A parsed status shift brackets a burst of CPU; refresh metrics now, not next poll.
	if (proc.status !== prevStatus) ctx.meter?.request()

	markChanged(ctx)
}

function handleUnexpectedExit(
	ctx: StoreContext,
	workspace: Workspace,
	code: number | null,
	signal: string | null,
): void {
	if (code === 0) {
		setStatus(ctx, workspace.name, 'stopped')

		return
	}

	const entry = ctx.entries.get(workspace.name)

	if (!entry) return

	entry.restartRetries += 1

	const { restartRetries } = entry

	if (restartRetries > MAX_RESTART_RETRIES) {
		note(entry, `process exited ${MAX_RESTART_RETRIES} times — giving up.`)

		setStatus(ctx, workspace.name, 'error')

		return
	}

	const delay = RESTART_DELAY_MS * 2 ** (restartRetries - 1)

	note(
		entry,
		`process exited unexpectedly (attempt ${restartRetries}/${MAX_RESTART_RETRIES}) — restarting in ${delay / 1000}s...`,
	)

	setStatus(ctx, workspace.name, 'error')

	if (signal === 'SIGABRT') {
		rebuildFsevents(ctx)
			.then(() => {
				// Respawn only if still tracked and no deliberate exit intervened during the rebuild.
				const liveEntry = ctx.entries.get(workspace.name)

				if (!ctx.stopping && liveEntry && !liveEntry.intentionalExit) spawnWorkspace(ctx, workspace)
			})
			.catch(() => setStatus(ctx, workspace.name, 'error'))

		return
	}

	entry.restartTimer = createUnrefTimer(delay, () => {
		entry.restartTimer = null

		if (!ctx.stopping) spawnWorkspace(ctx, workspace)
	})
}

function rebuildFsevents(ctx: StoreContext): Promise<void> {
	return new Promise((resolve) => {
		const child: ChildProcess = spawn('pnpm', ['rebuild', 'fsevents'], {
			cwd: ctx.root,
			stdio: 'pipe',
			env: safeEnv(),
		})

		ctx.pendingRebuilds.add(child)

		const done = () => {
			ctx.pendingRebuilds.delete(child)

			resolve()
		}

		child.on('close', done)
		child.on('error', done)
	})
}
