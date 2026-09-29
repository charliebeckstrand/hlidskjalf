import { type ChildProcess, spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { appendLog, parseLine, sanitizeForDisplay, stripAnsi } from '../logs/index.js'
import { safeEnv } from '../metrics/index.js'
import type { Workspace } from '../types.js'
import { truncate } from '../utilities.js'
import { isRunning } from './children.js'
import {
	MAX_BUFFER_SIZE,
	MAX_LINE_LENGTH,
	MAX_RESTART_RETRIES,
	RESTART_DELAY_MS,
	STARTUP_TIMEOUT_MS,
} from './constants.js'
import { note } from './entry.js'
import { createLineBuffer } from './lines.js'
import { cancelErrorRecovery, scheduleErrorRecovery } from './recovery.js'
import { markChanged } from './snapshot.js'
import { setStatus } from './status.js'
import type { StoreContext, WorkspaceEntry } from './types.js'
import { clearTimer, createUnrefTimer } from './utilities.js'

/**
 * A child the live entry has already replaced — the workspace was removed and re-added under
 * the same name while this child's teardown was still draining. Its late events must not touch
 * the new instance that took its place.
 */
function isStaleChild(ctx: StoreContext, name: string, child: ChildProcess): boolean {
	return ctx.entries.get(name)?.child !== child
}

export function spawnWorkspace(ctx: StoreContext, workspace: Workspace): void {
	const entry = ctx.entries.get(workspace.name)

	// Spawn only into a tracked entry with no live child. A child with no entry is owned by
	// nothing — shutdown walks the entries, so it would outlive hlidskjalf holding its port —
	// and a second child beside a live one strands the first as a stale, never-reaped group.
	if (ctx.stopping || !entry || isRunning(entry.child)) return

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

	// Owned until its stdio closes, independent of the entry: see `StoreContext.groups`.
	ctx.groups.add(child)

	child.on('close', () => ctx.groups.delete(child))

	entry.child = child

	entry.intentionalExit = false

	entry.pausedFrom = null

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

	entry.startupTimer = startupTimer

	const lineBuffer = createLineBuffer(MAX_BUFFER_SIZE)

	// A `data` chunk boundary can fall inside a multi-byte UTF-8 character. Buffer.toString()
	// per chunk would decode the split halves to U+FFFD — garbling the log and, worse,
	// defeating status parsing (a torn `⚡`/`➜` no longer matches its ready/watching pattern,
	// so the process can stall at `building` and time out). A StringDecoder holds the trailing
	// partial bytes until the rest arrives. stdout and stderr each get their own: they're
	// independent byte streams whose chunks can interleave mid-character.
	const decode = (decoder: StringDecoder, data: Buffer) => {
		// Ignore a stale child's output: its teardown noise must not land in the new
		// instance's log or drive its status.
		if (isStaleChild(ctx, workspace.name, child)) return

		for (const line of lineBuffer.push(decoder.write(data))) handleLine(ctx, workspace.name, line)
	}

	const stdoutDecoder = new StringDecoder('utf8')

	const stderrDecoder = new StringDecoder('utf8')

	child.stdout?.on('data', (data: Buffer) => decode(stdoutDecoder, data))
	child.stderr?.on('data', (data: Buffer) => decode(stderrDecoder, data))

	// A stdio pipe can emit 'error' (EPIPE/EIO as the child's end tears down). With no listener
	// Node re-throws it as an uncaught exception, killing hlidskjalf and orphaning every child
	// group; the child's own 'close'/'error' handlers already drive teardown, so absorb it.
	child.stdout?.on('error', () => {})
	child.stderr?.on('error', () => {})

	child.on('close', (code, signal) => {
		const rest = lineBuffer.flush()

		const entry = ctx.entries.get(workspace.name)

		// A stale child's delayed exit must not mutate the live entry that replaced it, or it
		// flips a healthy new instance into a false crash and schedules a spurious restart.
		if (!entry || isStaleChild(ctx, workspace.name, child)) return

		if (rest !== null) handleLine(ctx, workspace.name, rest)

		if (ctx.stopping) return

		// A deliberate stop/restart handles its own teardown; don't treat it as a crash.
		if (entry.intentionalExit) return

		// The child is gone: cancel any startup or error-recovery timer still armed against
		// it, so a stale deadline can't fire against the status we settle on now or against a
		// later respawn. A clean exit settles to `stopped` below — a live startup timer would
		// flip that to a phantom `timeout`; a give-up settles to `error` — a live error timer
		// would resurrect the dead process to `ready`. Deliberate stops already cleared these
		// via clearTimers; only the unexpected-exit path reaches here without having done so.
		entry.startupTimer = clearTimer(entry.startupTimer)

		entry.errorTimer = clearTimer(entry.errorTimer)

		handleUnexpectedExit(ctx, workspace, child, code, signal)
	})

	child.on('error', () => {
		// A spawn that failed outright (no pid) never ran, so there is no group to own.
		if (child.pid === undefined) ctx.groups.delete(child)

		// Ignore an error surfacing from a stale child the live entry has already replaced.
		if (isStaleChild(ctx, workspace.name, child)) return

		const liveEntry = ctx.entries.get(workspace.name)

		if (liveEntry) liveEntry.startupTimer = clearTimer(liveEntry.startupTimer)

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

			cancelErrorRecovery(ctx, name)

			entry.restartRetries = 0

			if (status === 'watching' || status === 'ready') {
				entry.startupTimer = clearTimer(entry.startupTimer)
			}
		}
		proc.status = status
	}
	if (url) proc.url = url

	// A parsed status shift brackets a burst of CPU; refresh metrics now, not next poll.
	if (proc.status !== prevStatus) ctx.meter?.request()

	markChanged(ctx)
}

/**
 * Respawn after an unexpected exit — unless something claimed the entry while the backoff or
 * fsevents rebuild was pending: a manual stop/restart/kill (which replaces or clears
 * `entry.child`), a removal or re-add (a different entry), or shutdown. Without this, a
 * restart pressed during the rebuild spawns a second server and strands the first.
 */
function respawnAfterCrash(
	ctx: StoreContext,
	entry: WorkspaceEntry,
	crashed: ChildProcess,
	workspace: Workspace,
): void {
	if (ctx.entries.get(workspace.name) !== entry) return

	if (entry.child !== crashed || entry.intentionalExit) return

	spawnWorkspace(ctx, workspace)
}

function handleUnexpectedExit(
	ctx: StoreContext,
	workspace: Workspace,
	crashed: ChildProcess,
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
			.then(() => respawnAfterCrash(ctx, entry, crashed, workspace))
			.catch(() => setStatus(ctx, workspace.name, 'error'))

		return
	}

	entry.restartTimer = createUnrefTimer(delay, () => {
		entry.restartTimer = null

		respawnAfterCrash(ctx, entry, crashed, workspace)
	})
}

function rebuildFsevents(ctx: StoreContext): Promise<void> {
	return new Promise((resolve) => {
		const child: ChildProcess = spawn('pnpm', ['rebuild', 'fsevents'], {
			cwd: ctx.root,
			// Discard stdio rather than pipe it: nothing reads this child's output, and a piped
			// node-gyp build that out-writes the OS pipe buffer (~64KB) would block on write and
			// never exit, so `close` never fires and the SIGABRT recovery wedges at `error`.
			stdio: 'ignore',
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
