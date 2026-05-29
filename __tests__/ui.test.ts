import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Status } from '../src/types.js'
import {
	after,
	colors,
	cpuColor,
	enterAltScreen,
	every,
	formatCpu,
	formatMem,
	hyperlink,
	memColor,
	parseTheme,
	setTheme,
	statusDisplay,
	themes,
	truncateEnd,
} from '../src/ui.js'

const ESC = String.fromCharCode(27)

const OSC8 = `${ESC}]8;;`

const BEL = String.fromCharCode(7)

describe('colors & statusDisplay', () => {
	it('exposes hex colour strings', () => {
		for (const value of Object.values(colors)) {
			expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
		}
	})

	const allStatuses: Status[] = [
		'pending',
		'building',
		'watching',
		'ready',
		'error',
		'stopped',
		'idle',
		'timeout',
	]

	it('has a complete entry for every status', () => {
		for (const status of allStatuses) {
			const entry = statusDisplay[status]

			expect(typeof entry.color).toBe('string')

			expect(typeof entry.label).toBe('string')

			expect(typeof entry.icon).toBe('string')
		}
	})

	it('maps failure statuses to error and running ones to success', () => {
		expect(statusDisplay.error.color).toBe(colors.error)

		expect(statusDisplay.timeout.color).toBe(colors.error)

		expect(statusDisplay.watching.color).toBe(colors.success)

		expect(statusDisplay.ready.color).toBe(colors.success)
	})
})

describe('themes', () => {
	// setTheme mutates the shared palette; restore the default so other suites are unaffected.
	afterEach(() => setTheme('bifrost'))

	it('every built-in palette fills every slot with a hex colour', () => {
		const slots = Object.keys(themes.bifrost)

		for (const palette of Object.values(themes)) {
			expect(Object.keys(palette)).toEqual(slots)

			for (const value of Object.values(palette)) {
				expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
			}
		}
	})

	it('parses known theme names and rejects everything else', () => {
		for (const name of Object.keys(themes)) expect(parseTheme(name)).toBe(name)

		expect(parseTheme('midgard')).toBeUndefined()
		expect(parseTheme(undefined)).toBeUndefined()
		expect(parseTheme(42)).toBeUndefined()
	})

	it('setTheme swaps the active palette and rebuilds the status map', () => {
		setTheme('niflheim')

		expect(colors.accent).toBe(themes.niflheim.accent)
		expect(statusDisplay.error.color).toBe(themes.niflheim.error)
		expect(statusDisplay.watching.color).toBe(themes.niflheim.success)
	})
})

describe('formatters', () => {
	it('formats CPU as a right-aligned percentage', () => {
		expect(formatCpu(12.34)).toBe('12.3%'.padStart(6))
	})

	it('formats memory with K/M/G units', () => {
		expect(formatMem(2048).trim()).toBe('2 K')

		expect(formatMem(5 * 1024 * 1024).trim()).toBe('5.0 M')

		expect(formatMem(3 * 1024 * 1024 * 1024).trim()).toBe('3.0 G')
	})

	it('escalates memory colour past the thresholds', () => {
		expect(memColor(1024)).toBe(colors.muted)

		expect(memColor(300 * 1024 * 1024)).toBe(colors.warning)

		expect(memColor(600 * 1024 * 1024)).toBe(colors.error)
	})

	it('flips CPU colour to error once a core saturates', () => {
		expect(cpuColor({ cpu: 50, mem: 0 })).toBe(colors.muted)

		expect(cpuColor({ cpu: 95, mem: 0 })).toBe(colors.error)
	})
})

describe('hyperlink', () => {
	it('wraps a label in an OSC 8 sequence targeting the full url', () => {
		const url = 'http://localhost:3000'

		expect(hyperlink(url, 'http://localh...')).toBe(
			`${OSC8}${url}${BEL}http://localh...${OSC8}${BEL}`,
		)
	})

	it('defaults the visible label to the url and terminates with BEL, not ST', () => {
		const url = 'http://localhost:5173'

		const link = hyperlink(url)

		expect(link).toBe(`${OSC8}${url}${BEL}${url}${OSC8}${BEL}`)

		expect(link).not.toContain(`${ESC}\\`)
	})

	it('keeps the full url as the target even when the label is truncated', () => {
		const url = 'http://localhost:3000'

		const link = hyperlink(url, truncateEnd(url, 10))

		expect(link.slice(OSC8.length, link.indexOf(BEL))).toBe(url)
	})
})

describe('truncateEnd', () => {
	it('returns text unchanged when it fits', () => {
		expect(truncateEnd('abcde', 5)).toBe('abcde')

		expect(truncateEnd('http://localhost:3000', 30)).toBe('http://localhost:3000')
	})

	it('appends a single-column ellipsis when shortened', () => {
		expect(truncateEnd('http://localhost:3000', 10)).toBe('http://lo...')

		expect(truncateEnd('http://localhost', 1)).toBe('...')
	})

	it('returns empty for a non-positive width', () => {
		expect(truncateEnd('http://localhost', 0)).toBe('')

		expect(truncateEnd('http://localhost', -5)).toBe('')
	})
})

describe('enterAltScreen', () => {
	const ENTER = '\x1b[?1049h'
	const EXIT = '\x1b[?1049l'

	function fakeStream(isTTY: boolean) {
		const writes: string[] = []

		return {
			isTTY,
			write: (s: string) => {
				writes.push(s)

				return true
			},
			writes,
		} as unknown as NodeJS.WriteStream & { writes: string[] }
	}

	afterEach(() => vi.restoreAllMocks())

	it('does nothing on a non-TTY stream', () => {
		const stream = fakeStream(false)

		enterAltScreen(stream)()

		expect(stream.writes).toEqual([])
	})

	it('switches to the alternate screen and restores at most once', () => {
		vi.spyOn(process, 'once').mockReturnValue(process)

		const stream = fakeStream(true)

		const restore = enterAltScreen(stream)

		expect(stream.writes).toEqual([ENTER])

		restore()
		restore()

		expect(stream.writes).toEqual([ENTER, EXIT])
	})

	it('registers a process exit listener for an abrupt exit', () => {
		const once = vi.spyOn(process, 'once').mockReturnValue(process)

		enterAltScreen(fakeStream(true))

		expect(once).toHaveBeenCalledWith('exit', expect.any(Function))
	})
})

describe('timers', () => {
	afterEach(() => vi.useRealTimers())

	it('every() runs on an interval until cancelled', () => {
		vi.useFakeTimers()

		const fn = vi.fn()

		const stop = every(1000, fn)

		vi.advanceTimersByTime(3000)

		expect(fn).toHaveBeenCalledTimes(3)

		stop()

		vi.advanceTimersByTime(3000)

		expect(fn).toHaveBeenCalledTimes(3)
	})

	it('after() runs once and can be cancelled before firing', () => {
		vi.useFakeTimers()

		const fn = vi.fn()

		const cancel = after(1000, fn)

		cancel()

		vi.advanceTimersByTime(2000)

		expect(fn).not.toHaveBeenCalled()
	})
})
