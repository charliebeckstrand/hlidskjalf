/**
 * Coalesce a burst of rapid calls into a single deferred invocation.
 *
 * The runner emits a `change` event for every log line of every process, which
 * can be hundreds per second under a chatty dev server. Re-rendering the Ink
 * tree on each one means re-running React reconciliation and Yoga layout far
 * more often than a terminal can usefully redraw. Routing those events through
 * a coalescer bounds the work to one flush per interval while still always
 * delivering a final flush that reflects the latest state (trailing edge).
 */
export interface Coalescer {
	/** Request a flush. The first call starts the timer; calls within the same
	 * window are absorbed into the pending flush. */
	schedule(): void
	/** Cancel any pending flush without running it (e.g. on teardown). */
	cancel(): void
}

export function createCoalescer(flush: () => void, intervalMs: number): Coalescer {
	let timer: ReturnType<typeof setTimeout> | null = null

	const fire = () => {
		timer = null

		flush()
	}

	return {
		schedule() {
			if (timer === null) timer = setTimeout(fire, intervalMs)
		},
		cancel() {
			if (timer !== null) {
				clearTimeout(timer)

				timer = null
			}
		},
	}
}
