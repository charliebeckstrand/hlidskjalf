import type { ChildProcess } from 'node:child_process'
import { KILL_GRACE_MS } from './constants.js'
import { createUnrefTimer } from './utilities.js'

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
 * Arm a force-kill: SIGKILL the group if it hasn't fully closed within the grace period
 * after its SIGTERM. Returns the unref'd timer for the caller to cancel.
 *
 * The caller cancels this timer on the child's `close` event, so if it ever fires the group
 * still hasn't finished exiting — and completion is keyed on `close` (stdio drain), not on
 * the direct child's exit. A dev toolchain whose `pnpm` wrapper exits by code while the real
 * server it spawned keeps the inherited pipes open leaves `child.exitCode` set but the group
 * alive; gating on `exitCode === null` would skip the SIGKILL, so `close` would never fire
 * and teardown/shutdown would wait forever. Force-kill the whole group unconditionally.
 */
export function escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
	return createUnrefTimer(KILL_GRACE_MS, () => {
		killTree(child, 'SIGKILL')
	})
}
