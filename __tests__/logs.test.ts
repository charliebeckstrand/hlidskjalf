import { describe, expect, it } from 'vitest'

import { appendLog, MAX_LOGS, visibleLogRange } from '../src/logs.js'

describe('appendLog', () => {
	it('appends a line to the buffer', () => {
		const logs: string[] = []

		appendLog(logs, 'first')

		expect(logs).toEqual(['first'])
	})

	it('keeps every line while under the trim threshold', () => {
		const logs: string[] = []

		for (let i = 0; i < MAX_LOGS; i++) appendLog(logs, `line ${i}`)

		expect(logs).toHaveLength(MAX_LOGS)
		expect(logs[0]).toBe('line 0')
		expect(logs[MAX_LOGS - 1]).toBe(`line ${MAX_LOGS - 1}`)
	})

	it('does not trim until the buffer exceeds MAX_LOGS plus its slack', () => {
		const logs: string[] = []

		// Fill to exactly twice MAX_LOGS — still within the slack headroom.
		for (let i = 0; i < MAX_LOGS * 2; i++) appendLog(logs, `line ${i}`)

		expect(logs).toHaveLength(MAX_LOGS * 2)
		expect(logs[0]).toBe('line 0')
	})

	it('trims oldest lines back to MAX_LOGS once the slack is exceeded', () => {
		const logs: string[] = []

		const total = MAX_LOGS * 2 + 1

		for (let i = 0; i < total; i++) appendLog(logs, `line ${i}`)

		// Trimmed down to the most recent MAX_LOGS lines.
		expect(logs).toHaveLength(MAX_LOGS)
		expect(logs[0]).toBe(`line ${total - MAX_LOGS}`)
		expect(logs[MAX_LOGS - 1]).toBe(`line ${total - 1}`)
	})

	it('retains at most MAX_LOGS lines across a long stream', () => {
		const logs: string[] = []

		for (let i = 0; i < MAX_LOGS * 10; i++) appendLog(logs, `line ${i}`)

		expect(logs.length).toBeLessThanOrEqual(MAX_LOGS * 2)
		// The newest line is always present.
		expect(logs[logs.length - 1]).toBe(`line ${MAX_LOGS * 10 - 1}`)
	})
})

describe('visibleLogRange', () => {
	it('shows the whole buffer when it fits the viewport', () => {
		expect(visibleLogRange(3, 10, 0)).toEqual({ start: 0, end: 3, maxScroll: 0 })
	})

	it('shows the newest lines when following (scroll 0)', () => {
		// 100 lines, 10-line viewport → last ten lines.
		expect(visibleLogRange(100, 10, 0)).toEqual({ start: 90, end: 100, maxScroll: 90 })
	})

	it('pages back through history by the scroll offset', () => {
		// Scrolled up 25 lines: the window ends 25 lines above the tail.
		expect(visibleLogRange(100, 10, 25)).toEqual({ start: 65, end: 75, maxScroll: 90 })
	})

	it('clamps an over-large scroll to the oldest lines', () => {
		// "Jump to top" can pass a huge offset without knowing the line count.
		expect(visibleLogRange(100, 10, 9999)).toEqual({ start: 0, end: 10, maxScroll: 90 })
	})

	it('clamps a negative scroll back to follow mode', () => {
		expect(visibleLogRange(100, 10, -5)).toEqual({ start: 90, end: 100, maxScroll: 90 })
	})

	it('handles an empty buffer', () => {
		expect(visibleLogRange(0, 10, 0)).toEqual({ start: 0, end: 0, maxScroll: 0 })
	})
})
