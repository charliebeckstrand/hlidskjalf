// --- Spawning & output handling ------------------------------------------------

import { type ChildProcess, spawn } from 'node:child_process'
import { appendLog } from '../logs.js'
import { safeEnv } from '../metrics/index.js'
import { parseLine, sanitizeForDisplay, stripAnsi } from '../parser.js'
import type { Workspace } from '../types.js'
import {
	MAX_BUFFER_SIZE,
	MAX_LINE_LENGTH,
	MAX_RESTART_RETRIES,
	RESTART_DELAY_MS,
	STARTUP_TIMEOUT_MS,
} from './constants.js'
import { note } from './entry.js'
import { clearErrorTimer, scheduleErrorRecovery } from './recovery.js'
import { changed } from './snapshot.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'

export function spawnWorkspace(ctx: StoreContext, workspace: Workspace): void {
	const child = spawn('pnpm', ['--filter', workspace.name, 'run', 'dev'], {
		cwd: ctx.root,
		stdio: 'pipe',
		env: safeEnv(),
		// Put each dev process in its own process group. Otherwise it shares ours, and
		// when a dev toolchain tears itself down by signalling its whole group
		// (`kill -- -<pgid>`), the signal also lands on hlidskjalf — whose SIGTERM
		// handler then exits the entire UI. A dedicated group also lets us reap the
		// real server under `pnpm` instead of orphaning it.
		detached: true,
	})

	const entry = ctx.entries.get(workspace.name)

	if (entry) {
		entry.child = child

		entry.intentionalExit = false

		entry.pausedFrom = null
	}

	setStatus(ctx, workspace.name, 'building')

	const startupTimer = setTimeout(() => {
		const e = ctx.entries.get(workspace.name)

		if (e) {
			e.startupTimer = null

			if (e.process.status !== 'watching' && e.process.status !== 'ready') {
				note(e, `startup timeout after ${STARTUP_TIMEOUT_MS / 1000}s`)

				setStatus(ctx, workspace.name, 'timeout')
			}
		}
	}, STARTUP_TIMEOUT_MS)

	startupTimer.unref()

	if (entry) entry.startupTimer = startupTimer

	let buffer = ''

	const onData = (data: Buffer) => {
		buffer += data.toString()

		if (!buffer.includes('\n') && buffer.length > MAX_BUFFER_SIZE) {
			handleLine(ctx, workspace.name, buffer)

			buffer = ''

			return
		}

		const lines = buffer.split('\n')

		buffer = lines.pop() ?? ''

		for (const raw of lines) {
			const line = raw.trimEnd()

			if (line) handleLine(ctx, workspace.name, line)
		}
	}

	child.stdout?.on('data', onData)
	child.stderr?.on('data', onData)

	child.on('close', (code, signal) => {
		if (buffer.trim()) handleLine(ctx, workspace.name, buffer.trimEnd())

		buffer = ''

		if (ctx.stopping) return

		// A deliberate stop/restart handles its own teardown; don't treat it as a crash.
		if (ctx.entries.get(workspace.name)?.intentionalExit) return

		handleUnexpectedExit(ctx, workspace, code, signal)
	})

	child.on('error', () => {
		const e = ctx.entries.get(workspace.name)

		if (e?.startupTimer) {
			clearTimeout(e.startupTimer)

			e.startupTimer = null
		}

		setStatus(ctx, workspace.name, 'error')
	})
}

function handleLine(ctx: StoreContext, name: string, raw: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	const line = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) : raw

	const { process: proc } = entry

	appendLog(proc.logs, sanitizeForDisplay(line))

	entry.lastOutputAt = Date.now()

	// A paused child is frozen; any output still draining from the pipe shouldn't
	// flip its status out of `paused`. Keep logging, but leave the status alone.
	if (entry.pausedFrom !== null) {
		changed(ctx)

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

	// A status shift parsed from output tends to bracket a burst of CPU; refresh
	// metrics promptly rather than on the next poll.
	if (proc.status !== prevStatus) ctx.meter?.request()

	changed(ctx)
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
				// The workspace may have been stopped or removed while the rebuild ran;
				// only respawn if it's still tracked and no deliberate exit intervened.
				const e = ctx.entries.get(workspace.name)
				if (!ctx.stopping && e && !e.intentionalExit) spawnWorkspace(ctx, workspace)
			})
			.catch(() => setStatus(ctx, workspace.name, 'error'))

		return
	}

	const timer = setTimeout(() => {
		entry.restartTimer = null

		if (!ctx.stopping) spawnWorkspace(ctx, workspace)
	}, delay)

	timer.unref()

	entry.restartTimer = timer
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
