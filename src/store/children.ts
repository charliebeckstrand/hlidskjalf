// --- Child-process helpers (this store is their only consumer) -----------------

import type { ChildProcess } from 'node:child_process'
import { KILL_GRACE_MS } from './constants.js'

/** Whether a spawned child is still running (exists and the OS hasn't reported it exiting). */
export function isRunning(child: ChildProcess | null | undefined): child is ChildProcess {
	return !!child && child.exitCode === null && child.signalCode === null
}

/**
 * Terminate a dev child and everything it spawned. Dev processes run in their own
 * process group (see `spawn`), so a negative PID signals the whole group — without it,
 * `pnpm`'s grandchild (the real server) would be orphaned and keep holding its port.
 * Falls back to the bare child if the group is already gone.
 */
export function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
	const { pid } = child

	if (pid !== undefined) {
		try {
			process.kill(-pid, signal)

			return
		} catch {
			// Group already exited, or the child never became a leader.
		}
	}

	try {
		child.kill(signal)
	} catch {
		// Already dead.
	}
}

/**
 * Arm a force-kill: SIGKILL the group if the child hasn't exited within the grace
 * period after its SIGTERM. Returns the unref'd timer so the caller can cancel it.
 */
export function escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
	const timer = setTimeout(() => {
		if (child.exitCode === null) killTree(child, 'SIGKILL')
	}, KILL_GRACE_MS)

	timer.unref()

	return timer
}
