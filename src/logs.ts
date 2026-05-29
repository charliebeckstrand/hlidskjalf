/**
 * Bounded per-process log buffer. Kept as a pure helper (no class state) so the
 * trimming policy can be unit-tested and benchmarked directly — it runs on every
 * line emitted by every child process, the same hot path as the parser.
 */

/** Maximum log lines retained per process for display scrollback. */
export const MAX_LOGS = 500

/**
 * Extra lines allowed to accumulate above MAX_LOGS before trimming. Trimming
 * splices from the front of the array, which is O(n) in the number of retained
 * lines; deferring it until this much headroom is used amortizes that cost to
 * O(1) per line instead of paying an O(MAX_LOGS) shift on every line once the
 * buffer is full. Memory stays bounded at MAX_LOGS + TRIM_SLACK lines.
 */
const TRIM_SLACK = MAX_LOGS

/**
 * Append a line to a process's bounded log buffer, trimming the oldest lines in
 * batches once the buffer grows past MAX_LOGS + TRIM_SLACK. Consumers read the
 * tail (the most recent lines), so the extra headroom is never visible.
 */
export function appendLog(logs: string[], line: string): void {
	logs.push(line)

	if (logs.length > MAX_LOGS + TRIM_SLACK) {
		logs.splice(0, logs.length - MAX_LOGS)
	}
}
