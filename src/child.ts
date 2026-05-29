import type { ChildProcess } from 'node:child_process'

/** Grace period after SIGTERM before a lingering child is force-killed with SIGKILL. */
const KILL_GRACE_MS = 5000

/**
 * Whether a spawned child is still running — it exists and the OS hasn't reported
 * it exiting (`exitCode`) or being signalled (`signalCode`). Centralizes the
 * three-part check the lifecycle code would otherwise repeat (and risk getting
 * subtly wrong) at every teardown and metrics site.
 */
export function isRunning(child: ChildProcess | null | undefined): child is ChildProcess {
	return !!child && child.exitCode === null && child.signalCode === null
}

/**
 * Terminate a dev child and everything it spawned. Dev processes run in their
 * own process group (see the runner's `spawn`), so a negative PID signals the
 * whole group — without it, `pnpm`'s grandchild (the real server) would be
 * orphaned and keep holding its port, breaking the next start. Falls back to the
 * bare child if the group is already gone.
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
 * Arm a force-kill: if the child hasn't exited within the grace period after its
 * SIGTERM, SIGKILL its group. Returns the (unref'd) timer so the caller can
 * cancel it from the child's `close` handler.
 */
export function escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
	const timer = setTimeout(() => {
		if (child.exitCode === null) killTree(child, 'SIGKILL')
	}, KILL_GRACE_MS)

	timer.unref()

	return timer
}
