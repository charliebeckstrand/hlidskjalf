/** Store-layer timer helpers. No domain knowledge, so trivially testable. */

/**
 * Schedule a timeout and unref it so a pending tick never keeps the process alive past
 * shutdown. Returns the handle for the caller to store and later clear.
 */
export function createUnrefTimer(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
	const timer = setTimeout(fn, ms)

	timer.unref()

	return timer
}

/**
 * Clear a pending timeout if one is armed, returning null so a stored handle is reset in a
 * single step: `entry.restartTimer = clearTimer(entry.restartTimer)`. Safe on a null handle.
 */
export function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
	if (timer) clearTimeout(timer)

	return null
}
