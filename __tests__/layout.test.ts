import { describe, expect, it } from 'vitest'
import { columnWidths, logPanelHeight, nameColumnWidth, urlContentWidth } from '../src/layout.js'
import type { WorkspaceProcess } from '../src/types.js'

function proc(name: string, url?: string): WorkspaceProcess {
	return { workspace: { name, kind: 'package', deps: [] }, status: 'ready', logs: [], url }
}

describe('nameColumnWidth', () => {
	it('floors at the minimum and honours a custom one', () => {
		expect(nameColumnWidth([proc('a'), proc('web')])).toBe(14)

		expect(nameColumnWidth([])).toBe(14)

		expect(nameColumnWidth([proc('x')], 20)).toBe(20)
	})

	it('uses the longest name plus padding when it exceeds the minimum', () => {
		const longest = 'a-really-long-workspace-name'

		expect(nameColumnWidth([proc('short'), proc(longest)])).toBe(longest.length + 2)
	})

	it('does not throw on a very large list (no argument spread)', () => {
		const many = Array.from({ length: 200_000 }, (_, i) => proc(`pkg-${i}`))

		expect(() => nameColumnWidth(many)).not.toThrow()
	})
})

describe('urlContentWidth', () => {
	it('is zero when no process has a URL, else the longest URL length', () => {
		expect(urlContentWidth([proc('a'), proc('web')])).toBe(0)

		const longest = 'http://localhost:3000'

		expect(urlContentWidth([proc('a', 'http://x:80'), proc('web', longest)])).toBe(longest.length)
	})
})

describe('columnWidths', () => {
	it('reserves the full URL width and gives the name the rest on a roomy terminal', () => {
		expect(columnWidths(120, 14, 21, false)).toEqual({ name: 14, url: 21 })
	})

	it('keeps the URL in full and truncates a long name when space is tight', () => {
		expect(columnWidths(60, 40, 21, false)).toEqual({ name: 15, url: 21 })
	})

	it('never pushes the name below its floor — the URL shrinks instead', () => {
		expect(columnWidths(48, 40, 21, false)).toEqual({ name: 14, url: 10 })
	})

	it('accounts for the metric columns and hides an absent URL', () => {
		expect(columnWidths(120, 14, 21, true)).toEqual({ name: 14, url: 21 })

		expect(columnWidths(120, 14, 0, false)).toEqual({ name: 14, url: 0 })
	})

	it('never exceeds the available width', () => {
		const { name, url } = columnWidths(50, 80, 21, false)

		expect(name + url + 24).toBeLessThanOrEqual(50)
	})

	it('keeps the name at one column on a pathologically tiny terminal', () => {
		expect(columnWidths(10, 40, 21, false)).toEqual({ name: 1, url: 0 })

		expect(columnWidths(0, 40, 21, true)).toEqual({ name: 1, url: 0 })
	})
})

describe('logPanelHeight', () => {
	it('uses the rows left after the chrome and process rows, growing with the terminal', () => {
		expect(logPanelHeight(40, 5)).toBe(23)

		expect(logPanelHeight(50, 5)).toBeGreaterThan(logPanelHeight(40, 5))
	})

	it('clamps to zero on a terminal too short for a panel', () => {
		expect(logPanelHeight(10, 8)).toBe(0)

		expect(logPanelHeight(0, 0)).toBe(0)
	})

	it('leaves the assembled frame a row clear of the bottom', () => {
		const rows = 37

		const count = 4

		const total = 4 + 2 + count + (logPanelHeight(rows, count) + 4)

		expect(total).toBeLessThanOrEqual(rows - 1)
	})
})
