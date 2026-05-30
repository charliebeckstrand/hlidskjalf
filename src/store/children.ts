import type { ChildProcess } from 'node:child_process'
import { createUnrefTimer } from '../util.js'
import { KILL_GRACE_MS } from './constants.js'

/** Whether a child is still running: exists and the OS hasn't reported it exiting. */
export function isRunning(child: ChildProcess | null | undefined): child is ChildProcess {
	return !!child && child.exitCode === null && child.signalCode === null
}

/**
 * Terminate a dev child and everything it spawned. Dev processes run in their own group
 * (see `spawn`), so a negative PID signals the whole group; without it, `pnpm`'s grandchild
 * (the real server) is orphaned and keeps holding its port. Falls back to the bare child
 * if the group is already gone.
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
 * Arm a force-kill: SIGKILL the group if the child hasn't exited within the grace period
 * after its SIGTERM. Returns the unref'd timer for the caller to cancel.
 */
export function escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
	return createUnrefTimer(KILL_GRACE_MS, () => {
		if (child.exitCode === null) killTree(child, 'SIGKILL')
	})
}
