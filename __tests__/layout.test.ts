import { describe, expect, it } from 'vitest'
import {
	columnWidths,
	logPanelHeight,
	nameColumnWidth,
	overallActivity,
	urlContentWidth,
} from '../src/layout.js'
import type { Status, WorkspaceProcess } from '../src/types.js'

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

	it('opens the URL column exactly one column past the name floor', () => {
		// Row chrome is 24, the name floor 14: at 38 columns (14 available) there's no room
		// for a URL; 39 is the first to give it a column, the name still floored.
		expect(columnWidths(38, 40, 21, false)).toEqual({ name: 14, url: 0 })

		expect(columnWidths(39, 40, 21, false)).toEqual({ name: 14, url: 1 })
	})

	it('grows the name only after the URL reaches its full content width', () => {
		// While the URL is still short of its 21-column content, every extra column goes to
		// the URL and the name stays floored at 14 — URL reservation has priority.
		expect(columnWidths(40, 40, 21, false)).toEqual({ name: 14, url: 2 })

		expect(columnWidths(41, 40, 21, false)).toEqual({ name: 14, url: 3 })

		// Column 59 is the last where the URL has just filled out (21) with the name still
		// floored; one more column (60) is the first the name is allowed to grow.
		expect(columnWidths(59, 40, 21, false)).toEqual({ name: 14, url: 21 })

		expect(columnWidths(60, 40, 21, false)).toEqual({ name: 15, url: 21 })
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

describe('overallActivity', () => {
	const withStatus = (status: Status): WorkspaceProcess => ({
		workspace: { name: status, kind: 'package', deps: [] },
		status,
		logs: [],
	})

	it('is down for an empty list', () => {
		expect(overallActivity([])).toBe('down')
	})

	it('is up only when every process is active', () => {
		expect(overallActivity([withStatus('ready'), withStatus('watching')])).toBe('up')
	})

	it('is partial when some are active and the rest stopped, with none paused', () => {
		expect(overallActivity([withStatus('watching'), withStatus('stopped')])).toBe('partial')
	})

	it('is paused whenever any process is paused, even among active or stopped ones', () => {
		expect(overallActivity([withStatus('watching'), withStatus('paused')])).toBe('paused')

		// The reported case: everything stopped but one paused process.
		expect(
			overallActivity([withStatus('stopped'), withStatus('paused'), withStatus('stopped')]),
		).toBe('paused')
	})

	it('is down when nothing is active or paused', () => {
		expect(overallActivity([withStatus('stopped'), withStatus('error')])).toBe('down')
	})
})
