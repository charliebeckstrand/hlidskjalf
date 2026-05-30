/**
 * Bounded per-process log buffer. Pure helpers (no class state) so the trimming
 * policy can be unit-tested and benchmarked directly — this runs on every line
 * emitted by every child process, the same hot path as the parser. The buffer is
 * mutated in place (O(1) amortized append); the store signals React by rebuilding
 * its snapshot array, not by copying this buffer per line.
 */

import { clamp } from '../util.js'

/** Maximum log lines retained per process for display scrollback. */
export const MAX_LOGS = 500

/**
 * Extra lines allowed above MAX_LOGS before trimming. Splicing from the front is
 * O(n) in retained lines; deferring it until this much headroom is used amortizes
 * that to O(1) per line. Memory stays bounded at MAX_LOGS + TRIM_SLACK.
 */
const TRIM_SLACK = MAX_LOGS

/** Append a line, trimming the oldest lines in batches once past MAX_LOGS + TRIM_SLACK. */
export function appendLog(logs: string[], line: string): void {
	logs.push(line)

	if (logs.length > MAX_LOGS + TRIM_SLACK) {
		logs.splice(0, logs.length - MAX_LOGS)
	}
}

export interface LogWindow {
	/** Inclusive start index into the log buffer. */
	start: number
	/** Exclusive end index into the buffer. */
	end: number
	/** Largest valid scroll offset for the given buffer and viewport. */
	maxScroll: number
}

/**
 * Resolve the slice visible in a viewport of `height` lines, given a `scroll` offset
 * measured in lines above the tail. `scroll` 0 shows the newest `height` lines
 * (follow mode); larger values page back. Offsets are clamped to the buffer, so a
 * caller can pass an over-large value ("jump to top") without knowing the line count.
 */
export function visibleLogRange(total: number, height: number, scroll: number): LogWindow {
	const maxScroll = Math.max(0, total - height)

	const clamped = clamp(scroll, 0, maxScroll)

	const end = total - clamped

	const start = Math.max(0, end - height)

	return { start, end, maxScroll }
}
