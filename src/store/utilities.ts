/** Timer helpers used only by the store layer. No store domain knowledge, so trivially testable. */

/**
 * Schedule a timeout and unref it so a pending tick never keeps the process alive past
 * shutdown. Returns the handle for the caller to store and later clear.
 */
export function createUnrefTimer(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
	const timer = setTimeout(fn, ms)

	timer.unref()

	return timer
}
