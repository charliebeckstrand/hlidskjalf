/** Small numeric/string primitives shared across layers. No domain knowledge, so trivially testable. */

/** Constrain `value` to the inclusive range [`min`, `max`]. Caller guarantees `min <= max`. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

/**
 * Clamp a list index to the last valid position, or 0 for an empty list. Unlike {@link clamp},
 * it never floors below 0 even when `length` is 0 (so an empty list yields 0, not -1).
 */
export function clampIndex(index: number, length: number): number {
	return Math.min(index, Math.max(0, length - 1))
}

/** Hard-cap `text` to `max` characters with no ellipsis — a length guard for hot paths. */
export function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) : text
}
