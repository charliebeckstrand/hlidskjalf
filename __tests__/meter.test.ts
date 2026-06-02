import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeter } from '../src/metrics/index.js'

// Controllable stand-in for /proc: readdir lists the entries, readFile returns a stat
// line per pid (or throws, modelling a process that vanished mid-scan).
const proc = {
	entries: [] as string[],
	stat: new Map<string, string>(),
	readdirThrows: false,
}

vi.mock('node:fs', () => ({
	default: {
		readdirSync: (path: string) => {
			if (proc.readdirThrows) throw new Error('EACCES')

			if (path === '/proc') return proc.entries

			throw new Error('ENOENT')
		},
		readFileSync: (path: string) => {
			const content = proc.stat.get(path)

			if (content === undefined) throw new Error('ENOENT')

			return content
		},
	},
}))

// Pin the page size so the /proc RSS→bytes conversion is host-independent: the real
// `getconf PAGE_SIZE` reports 4096 on x86 Linux but 16384 on Apple Silicon, which would
// inflate the asserted memory 4x. The /proc path never shells out to anything else.
vi.mock('node:child_process', () => ({
	execFileSync: (file: string) => {
		if (file === 'getconf') return '4096\n'

		throw new Error(`unexpected execFileSync: ${file}`)
	},
}))

// A /proc/<pid>/stat line: field 1 (after comm) is ppid, 11 utime, 12 stime, 21 rss pages.
function statLine(o: { ppid: number; utime: number; stime: number; rssPages: number }): string {
	const fields = new Array(50).fill('0')

	fields[1] = String(o.ppid)

	fields[11] = String(o.utime)

	fields[12] = String(o.stime)

	fields[21] = String(o.rssPages)

	return `1234 (some comm) S ${fields.slice(1).join(' ')}`
}

function setStat(pid: number, o: { ppid: number; utime: number; stime: number; rssPages: number }) {
	proc.stat.set(`/proc/${pid}/stat`, statLine(o))
}

beforeEach(() => {
	vi.useFakeTimers()

	proc.entries = []

	proc.stat.clear()

	proc.readdirThrows = false

	// The /proc reader is the Linux path; ensure it's the one selected.
	Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
})

afterEach(() => {
	vi.useRealTimers()

	vi.restoreAllMocks()
})

describe('createMeter (/proc path)', () => {
	it('seeds at 0% CPU and reports summed RSS for a root and its descendants', () => {
		proc.entries = ['1234', '5678', 'self', 'notapid']

		// 5678 is a child of 1234, so its memory rolls up into the workspace total.
		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		setStat(5678, { ppid: 1234, utime: 50, stime: 0, rssPages: 40 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const onChange = vi.fn()

		const meter = createMeter({ roots: () => new Map([[1234, 'web']]), setMetrics, onChange })

		expect(setMetrics).toHaveBeenCalledWith('web', { cpu: 0, mem: (100 + 40) * 4096 })

		expect(onChange).toHaveBeenCalled()

		meter.stop()
	})

	it('derives a positive CPU% from the cumulative-tick delta between samples', async () => {
		proc.entries = ['1234']

		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({
			roots: () => new Map([[1234, 'web']]),
			setMetrics,
			onChange: () => {},
		})

		setMetrics.mockClear()

		// 300 more ticks burned over the 3s interval.
		setStat(1234, { ppid: 1, utime: 400, stime: 0, rssPages: 120 })

		await vi.advanceTimersByTimeAsync(3000)

		const reading = setMetrics.mock.calls.at(-1)?.[1]

		expect(reading?.mem).toBe(120 * 4096)

		expect(reading?.cpu).toBeGreaterThan(0)

		meter.stop()
	})

	it('pulls a sample on request, sooner than the periodic interval', async () => {
		proc.entries = ['1234']

		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({
			roots: () => new Map([[1234, 'web']]),
			setMetrics,
			onChange: () => {},
		})

		setMetrics.mockClear()

		meter.request()

		await vi.advanceTimersByTimeAsync(1000)

		expect(setMetrics).toHaveBeenCalled()

		meter.stop()
	})

	it('skips a vanished or malformed process without throwing', async () => {
		proc.entries = ['1234', '5678']

		// 1234's stat read throws (gone); 5678 is malformed (no comm parens).
		proc.stat.set('/proc/5678/stat', 'garbage with no parens')

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({
			roots: () => new Map([[1234, 'web']]),
			setMetrics,
			onChange: () => {},
		})

		// No readable stats, so the workspace reads as zero rather than crashing the poll.
		expect(setMetrics).toHaveBeenCalledWith('web', { cpu: 0, mem: 0 })

		meter.stop()
	})

	it('takes no sample and skips setMetrics when there are no running roots', () => {
		proc.entries = ['1234']

		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({ roots: () => new Map(), setMetrics, onChange: () => {} })

		expect(setMetrics).not.toHaveBeenCalled()

		meter.stop()
	})

	it('survives a /proc that cannot be read', () => {
		proc.readdirThrows = true

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		expect(() =>
			createMeter({ roots: () => new Map([[1234, 'web']]), setMetrics, onChange: () => {} }).stop(),
		).not.toThrow()

		// An unreadable tree yields an empty stat map, so the root reads as zero.
		expect(setMetrics).toHaveBeenCalledWith('web', { cpu: 0, mem: 0 })
	})

	it('stops sampling after stop(), so a later request is a no-op', async () => {
		proc.entries = ['1234']

		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({
			roots: () => new Map([[1234, 'web']]),
			setMetrics,
			onChange: () => {},
		})

		meter.stop()

		setMetrics.mockClear()

		meter.request()

		await vi.advanceTimersByTimeAsync(5000)

		expect(setMetrics).not.toHaveBeenCalled()
	})

	it('drops a workspace snapshot on reset so a reused PID starts clean', async () => {
		proc.entries = ['1234']

		setStat(1234, { ppid: 1, utime: 100, stime: 0, rssPages: 100 })

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const meter = createMeter({
			roots: () => new Map([[1234, 'web']]),
			setMetrics,
			onChange: () => {},
		})

		meter.reset('web')

		setMetrics.mockClear()

		// With the snapshot dropped, the next sample re-seeds at 0% even though ticks jumped.
		setStat(1234, { ppid: 1, utime: 9000, stime: 0, rssPages: 100 })

		await vi.advanceTimersByTimeAsync(3000)

		expect(setMetrics.mock.calls.at(-1)?.[1].cpu).toBe(0)

		meter.stop()
	})
})
