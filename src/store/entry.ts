// --- Entry helpers -------------------------------------------------------------

import { appendLog } from '../logs.js'
import type { Workspace } from '../types.js'
import { escalateKill, isRunning, killTree } from './children.js'
import type { ProcessEntry } from './types.js'

export function newEntry(workspace: Workspace): ProcessEntry {
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
 * Kill a live child and run `onClosed` once it exits, escalating to SIGKILL if it
 * lingers. Calling this again while a teardown is already pending for the same child
 * just swaps in the latest `onClosed` rather than stacking another `close` listener —
 * otherwise a rapid stop/restart would fire two handlers and spawn duplicate servers.
 * If the child is already gone, `onClosed` runs synchronously. `signal` is the initial
 * termination signal (SIGTERM by default; SIGKILL for a force-kill); either way a
 * lingering child is still escalated to SIGKILL after the grace period.
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

	// A SIGSTOP'd child won't act on SIGTERM until it's continued, so wake it first;
	// otherwise the terminate would only land after the SIGKILL grace period elapsed.
	if (entry.pausedFrom !== null) {
		killTree(child, 'SIGCONT')

		entry.pausedFrom = null
	}

	// Latest request wins; the single close handler below reads this at close time.
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
