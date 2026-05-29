import { describe, expect, it } from 'vitest'

import { columnWidths, logPanelHeight, nameColumnWidth, urlContentWidth } from '../src/layout.js'
import type { Process } from '../src/types.js'

function proc(name: string, url?: string): Process {
	return { workspace: { name, kind: 'package', deps: [] }, status: 'ready', logs: [], url }
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

describe('urlContentWidth', () => {
	it('is zero when no process has a URL', () => {
		expect(urlContentWidth([proc('a'), proc('web')])).toBe(0)
	})

	it('returns the length of the longest URL', () => {
		const longest = 'http://localhost:3000'

		expect(urlContentWidth([proc('a', 'http://x:80'), proc('web', longest)])).toBe(longest.length)
	})
})

describe('columnWidths', () => {
	it('reserves the full URL width and gives the name the rest on a roomy terminal', () => {
		// 120 - 24 (chrome) = 96 available. URL wants 21, name's natural width is 14.
		const { name, url } = columnWidths(120, 14, 21, false)

		expect(url).toBe(21)
		expect(name).toBe(14)
	})

	it('keeps the URL in full and truncates a long name when space is tight', () => {
		// 60 - 24 = 36 available. URL (21) is reserved first; the name takes the rest.
		const { name, url } = columnWidths(60, 40, 21, false)

		expect(url).toBe(21)
		expect(name).toBe(15)
	})

	it('never pushes the name below its floor — the URL shrinks instead', () => {
		// 48 - 24 = 24 available. Reserving the 14-col name floor leaves 10 for the URL.
		const { name, url } = columnWidths(48, 40, 21, false)

		expect(name).toBe(14)
		expect(url).toBe(10)
	})

	it('accounts for the metric columns when shown', () => {
		// 120 - 24 - 17 = 79 available; URL still gets its full 21.
		const { name, url } = columnWidths(120, 14, 21, true)

		expect(url).toBe(21)
		expect(name).toBe(14)
	})

	it('hides the URL (width 0) when there is none to show', () => {
		const { name, url } = columnWidths(120, 14, 0, false)

		expect(url).toBe(0)
		expect(name).toBe(14)
	})

	it('does not exceed the available width', () => {
		const columns = 50
		const { name, url } = columnWidths(columns, 80, 21, false)

		expect(name + url + 24).toBeLessThanOrEqual(columns)
	})

	it('keeps the name at one column on a pathologically tiny terminal', () => {
		expect(columnWidths(10, 40, 21, false)).toEqual({ name: 1, url: 0 })
		expect(columnWidths(0, 40, 21, true)).toEqual({ name: 1, url: 0 })
	})
})

describe('logPanelHeight', () => {
	it('uses the rows left after the chrome and process rows', () => {
		// 40 - 5 processes - 12 = 23
		expect(logPanelHeight(40, 5)).toBe(23)
	})

	it('grows when the terminal gets taller', () => {
		expect(logPanelHeight(50, 5)).toBeGreaterThan(logPanelHeight(40, 5))
	})

	it('clamps to zero on a terminal too short for a panel (caller then hides it)', () => {
		expect(logPanelHeight(10, 8)).toBe(0)
		expect(logPanelHeight(0, 0)).toBe(0)
	})

	it('leaves the assembled frame a row clear of the bottom', () => {
		// total = header(4) + table header(2) + N rows + panel(logHeight + 4 incl. margin)
		const rows = 37
		const count = 4
		const total = 4 + 2 + count + (logPanelHeight(rows, count) + 4)

		expect(total).toBeLessThanOrEqual(rows - 1)
	})
})
