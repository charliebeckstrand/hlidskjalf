import { appendLog } from '../logs.js'
import type { Workspace } from '../types.js'
import { escalateKill, isRunning, killTree } from './children.js'
import type { ProcessEntry, StoreContext } from './types.js'

export function createEntry(workspace: Workspace): ProcessEntry {
	return {
		process: { workspace, status: 'pending', logs: [] },
		child: null,
		errorTimer: null,
		restartTimer: null,
		startupTimer: null,
		lastGoodStatus: null,
		restartRetries: 0,
		lastOutputAt: 0,
		intentionalExit: false,
		teardownStarted: false,
		onClose: null,
		pausedFrom: null,
	}
}

/** Append an internal hlidskjalf status line to a process's (bounded) log buffer. */
export function note(entry: ProcessEntry, message: string): void {
	appendLog(entry.process.logs, `[hlidskjalf] ${message}`)
}

/** Run `fn` against the named entry, or do nothing if no such entry is tracked. */
export function withEntry(
	ctx: StoreContext,
	name: string,
	fn: (entry: ProcessEntry) => void,
): void {
	const entry = ctx.entries.get(name)

	if (!entry) return

	fn(entry)
}

export function clearTimers(entry: ProcessEntry): void {
	if (entry.restartTimer) {
		clearTimeout(entry.restartTimer)

		entry.restartTimer = null
	}

	if (entry.errorTimer) {
		clearTimeout(entry.errorTimer)

		entry.errorTimer = null
	}

	if (entry.startupTimer) {
		clearTimeout(entry.startupTimer)

		entry.startupTimer = null
	}
}

/**
 * Kill a live child and run `onClosed` once it exits, escalating to SIGKILL if it lingers.
 * Re-calling during a pending teardown swaps in the latest `onClosed` instead of stacking
 * a second `close` listener — without that, a rapid stop/restart fires two handlers and
 * spawns duplicate servers. If the child is already gone, `onClosed` runs synchronously.
 * `signal` is the initial termination signal (SIGTERM default, SIGKILL for a force-kill);
 * a lingering child escalates to SIGKILL after the grace period regardless.
 */
export function beginTeardown(
	entry: ProcessEntry,
	onClosed: () => void,
	signal: NodeJS.Signals = 'SIGTERM',
): void {
	entry.intentionalExit = true

	const { child } = entry

	if (!isRunning(child)) {
		entry.child = null

		entry.pausedFrom = null

		onClosed()

		return
	}

	// A SIGSTOP'd child ignores SIGTERM until continued, so wake it first; otherwise the
	// terminate only lands after the SIGKILL grace period elapses.
	if (entry.pausedFrom !== null) {
		killTree(child, 'SIGCONT')

		entry.pausedFrom = null
	}

	// Latest request wins; the single close handler below reads this at close.
	entry.onClose = onClosed

	if (!entry.teardownStarted) {
		entry.teardownStarted = true

		const escalate = escalateKill(child)

		child.on('close', () => {
			clearTimeout(escalate)

			entry.child = null

			entry.teardownStarted = false

			const action = entry.onClose

			entry.onClose = null

			action?.()
		})
	}

	killTree(child, signal)
}
