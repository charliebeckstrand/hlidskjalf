import { describe, expect, it } from 'vitest'

import { logPanelHeight, nameColumnWidth, urlColumnWidth } from '../src/layout.js'
import type { Process } from '../src/types.js'

function proc(name: string): Process {
	return { workspace: { name, kind: 'package', deps: [] }, status: 'ready', logs: [] }
}

describe('nameColumnWidth', () => {
	it('returns the minimum when no process name exceeds it', () => {
		expect(nameColumnWidth([proc('a'), proc('web')])).toBe(14)
	})

	it('returns the floor for an empty list', () => {
		expect(nameColumnWidth([])).toBe(14)
	})

	it('uses the longest name plus padding when it exceeds the minimum', () => {
		const longest = 'a-really-long-workspace-name'

		expect(nameColumnWidth([proc('short'), proc(longest)])).toBe(longest.length + 2)
	})

	it('honours a custom minimum', () => {
		expect(nameColumnWidth([proc('x')], 20)).toBe(20)
	})

	it('does not throw on a very large list (no argument spread)', () => {
		const many = Array.from({ length: 200_000 }, (_, i) => proc(`pkg-${i}`))

		expect(() => nameColumnWidth(many)).not.toThrow()
	})
})

describe('urlColumnWidth', () => {
	it('claims the space left after chrome and the name column', () => {
		// 120 - 14 (name) - 24 (chrome) = 82
		expect(urlColumnWidth(120, 14, false)).toBe(82)
	})

	it('reserves the metric columns when metrics are shown', () => {
		// 120 - 14 - 24 - 17 = 65
		expect(urlColumnWidth(120, 14, true)).toBe(65)
	})

	it('reflows when the terminal width changes', () => {
		const narrow = urlColumnWidth(80, 14, false)
		const wide = urlColumnWidth(160, 14, false)

		expect(wide - narrow).toBe(80)
	})

	it('can go non-positive on a narrow terminal (URL then hidden by the caller)', () => {
		expect(urlColumnWidth(30, 14, false)).toBeLessThanOrEqual(0)
	})
})

describe('logPanelHeight', () => {
	it('uses the rows left after the chrome and process rows', () => {
		// 40 - 5 processes - 11 = 24
		expect(logPanelHeight(40, 5)).toBe(24)
	})

	it('grows when the terminal gets taller', () => {
		expect(logPanelHeight(50, 5)).toBeGreaterThan(logPanelHeight(40, 5))
	})

	it('never collapses below three rows', () => {
		expect(logPanelHeight(10, 8)).toBe(3)
		expect(logPanelHeight(0, 0)).toBe(3)
	})
})
