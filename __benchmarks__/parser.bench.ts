import { Bench } from 'tinybench'

import { parseLine, sanitizeForDisplay, stripAnsi } from '../src/parser.js'
import { LOG_LINES } from './fixtures.js'

/**
 * The parser runs on every line emitted by every child process — the single
 * hottest path in the app. These cases cover each status branch, the dominant
 * no-match line, the ANSI strippers, and the full per-line pipeline as it runs
 * in processes.ts (sanitize for display + strip + classify).
 */
export function parserSuite(): Bench {
	const bench = new Bench({ name: 'parser — per-log-line hot path', time: 500 })

	bench
		.add('parseLine: plain line (no match)', () => {
			parseLine(LOG_LINES.plain)
		})
		.add('parseLine: ready + URL extraction', () => {
			parseLine(LOG_LINES.ready)
		})
		.add('parseLine: listening + URL extraction', () => {
			parseLine(LOG_LINES.listening)
		})
		.add('parseLine: error (full matcher scan)', () => {
			parseLine(LOG_LINES.error)
		})
		.add('parseLine: vite ready (no capture)', () => {
			parseLine(LOG_LINES.viteReady)
		})
		.add('parseLine: oversized line (truncate + miss)', () => {
			parseLine(LOG_LINES.long)
		})
		.add('stripAnsi: ansi-heavy line', () => {
			stripAnsi(LOG_LINES.ansiHeavy)
		})
		.add('stripAnsi: plain line (no escapes)', () => {
			stripAnsi(LOG_LINES.plain)
		})
		.add('sanitizeForDisplay: SGR-only line', () => {
			sanitizeForDisplay(LOG_LINES.ansiHeavy)
		})
		.add('sanitizeForDisplay: plain line (no escapes)', () => {
			sanitizeForDisplay(LOG_LINES.plain)
		})
		.add('sanitizeForDisplay: control + OSC line', () => {
			sanitizeForDisplay(LOG_LINES.ansiControl)
		})
		.add('full pipeline: sanitize + strip + classify', () => {
			sanitizeForDisplay(LOG_LINES.ansiHeavy)
			parseLine(stripAnsi(LOG_LINES.ansiHeavy))
		})

	return bench
}
