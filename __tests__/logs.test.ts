import { describe, expect, it } from 'vitest'
import { appendLog, MAX_LOGS, visibleLogRange } from '../src/logs.js'

describe('appendLog', () => {
	it('appends and retains every line under the trim threshold', () => {
		const logs: string[] = []
		for (let i = 0; i < MAX_LOGS * 2; i++) appendLog(logs, `line ${i}`)
		expect(logs).toHaveLength(MAX_LOGS * 2)
		expect(logs[0]).toBe('line 0')
	})

	it('trims oldest lines back to MAX_LOGS once the slack is exceeded', () => {
		const logs: string[] = []
		const total = MAX_LOGS * 2 + 1
		for (let i = 0; i < total; i++) appendLog(logs, `line ${i}`)
		expect(logs).toHaveLength(MAX_LOGS)
		expect(logs[0]).toBe(`line ${total - MAX_LOGS}`)
		expect(logs.at(-1)).toBe(`line ${total - 1}`)
	})

	it('stays bounded across a long stream, always keeping the newest line', () => {
		const logs: string[] = []
		for (let i = 0; i < MAX_LOGS * 10; i++) appendLog(logs, `line ${i}`)
		expect(logs.length).toBeLessThanOrEqual(MAX_LOGS * 2)
		expect(logs.at(-1)).toBe(`line ${MAX_LOGS * 10 - 1}`)
	})
})

describe('visibleLogRange', () => {
	it('shows the whole buffer when it fits', () => {
		expect(visibleLogRange(3, 10, 0)).toEqual({ start: 0, end: 3, maxScroll: 0 })
	})

	it('follows the newest lines at scroll 0 and pages back by the offset', () => {
		expect(visibleLogRange(100, 10, 0)).toEqual({ start: 90, end: 100, maxScroll: 90 })
		expect(visibleLogRange(100, 10, 25)).toEqual({ start: 65, end: 75, maxScroll: 90 })
	})

	it('clamps over-large and negative offsets', () => {
		expect(visibleLogRange(100, 10, 9999)).toEqual({ start: 0, end: 10, maxScroll: 90 })
		expect(visibleLogRange(100, 10, -5)).toEqual({ start: 90, end: 100, maxScroll: 90 })
	})

	it('handles an empty buffer', () => {
		expect(visibleLogRange(0, 10, 0)).toEqual({ start: 0, end: 0, maxScroll: 0 })
	})
})
