import { Bench } from 'tinybench'

import { appendLog, MAX_LOGS, visibleLogRange } from '../src/logs/index.js'
import { LOG_LINES } from './fixtures.js'

/**
 * appendLog runs on every line emitted by every child process. A long-running
 * dev server fills the buffer past MAX_LOGS within seconds, so the steady state
 * — appending into an already-full buffer — is what matters.
 *
 * The previous implementation spliced one line off the front on every append once full;
 * a front splice shifts every retained line, so that was O(MAX_LOGS) per line. `naiveAppend`
 * reproduces it as a baseline so the amortized batch-trim's win shows in the same run.
 */
function naiveAppend(logs: string[], line: string): void {
	logs.push(line)

	if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
}

export function logsBufferSuite(): Bench {
	const bench = new Bench({ name: 'logs — per-line buffer append', time: 500 })

	const line = LOG_LINES.plain

	// Prefill to capacity to measure steady-state appends, not the initial fill. Each task
	// mutates its own buffer; both self-regulate via trimming.
	const amortized = Array.from({ length: MAX_LOGS }, () => line)

	const naive = Array.from({ length: MAX_LOGS }, () => line)

	bench
		.add('appendLog: amortized batch trim (full buffer)', () => {
			appendLog(amortized, line)
		})
		.add('naive splice-per-line (full buffer)', () => {
			naiveAppend(naive, line)
		})
		// visibleLogRange resolves the slice to draw on every render of the log panel.
		.add('visibleLogRange: follow mode (tail)', () => {
			visibleLogRange(MAX_LOGS, 40, 0)
		})
		.add('visibleLogRange: paged back, clamped', () => {
			visibleLogRange(MAX_LOGS, 40, 10_000)
		})

	return bench
}
