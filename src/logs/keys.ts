/** A visible log line paired with its React key. The key is the line's absolute index in the
 * ring, so it names the same line across renders — unlike a window-relative index, which
 * reassigns to a different line as the tail grows or the view scrolls. */
export interface LogRow {
	id: number
	line: string
}

/** Keys for the scrollback's rows and its blank bottom padding.
 *
 * `start` is the absolute index of the first visible line (lines hidden above the window).
 * Visible ids run `start + i`, which stays put for a given line as the tail grows or the view
 * scrolls — stable until a ring eviction shifts every index, which is rare next to renders.
 * Fill keys continue past the last visible line so padding never collides with a real row. */
export function logRowKeys(
	lines: string[],
	start: number,
	height: number,
): { rows: LogRow[]; fills: number[] } {
	const rows = lines.map((line, i) => ({ id: start + i, line }))

	const firstFillId = start + lines.length
	const fillCount = Math.max(0, height - lines.length)
	const fills = Array.from({ length: fillCount }, (_, i) => firstFillId + i)

	return { rows, fills }
}
