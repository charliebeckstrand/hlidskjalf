// --- Timers --------------------------------------------------------------------

/**
 * Start an unref'd interval and return a canceller. Unref'd so a pending tick never
 * keeps the process alive past shutdown; the canceller is idempotent.
 */
export function every(ms: number, fn: () => void): () => void {
	const t = setInterval(fn, ms)

	t.unref()

	return () => clearInterval(t)
}

/** Schedule an unref'd timeout and return a canceller. */
export function after(ms: number, fn: () => void): () => void {
	const t = setTimeout(fn, ms)

	t.unref()

	return () => clearTimeout(t)
}
