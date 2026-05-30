/**
 * Start an unref'd interval and return a canceller. Unref'd so a pending tick never
 * keeps the process alive past shutdown; the canceller is idempotent.
 */
export function every(ms: number, fn: () => void): () => void {
	const timer = setInterval(fn, ms)

	timer.unref()

	return () => clearInterval(timer)
}
