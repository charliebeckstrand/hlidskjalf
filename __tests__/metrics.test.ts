import { describe, expect, it } from 'vitest'

import {
	collectDescendants,
	cpuPercentFromTicks,
	parseCpuTime,
	parseProcStat,
	parsePsOutput,
	safeEnv,
	sumTickDeltas,
} from '../src/metrics.js'

describe('safeEnv', () => {
	it('keeps only allowlisted variables', () => {
		const env = safeEnv({ PATH: '/usr/bin', SECRET_TOKEN: 'abc', HOME: '/home/me' })

		expect(env.PATH).toBe('/usr/bin')
		expect(env.HOME).toBe('/home/me')
		expect(env.SECRET_TOKEN).toBeUndefined()
	})

	it('forces color output', () => {
		const env = safeEnv({})

		expect(env.FORCE_COLOR).toBe('1')
	})

	it('does not leak arbitrary secrets', () => {
		const env = safeEnv({ AWS_SECRET_ACCESS_KEY: 'nope', DATABASE_URL: 'postgres://...' })

		expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
		expect(env.DATABASE_URL).toBeUndefined()
	})

	it('defaults to process.env when no source is given', () => {
		// Should not throw and should always include the forced color flag.
		expect(safeEnv().FORCE_COLOR).toBe('1')
	})
})

describe('collectDescendants', () => {
	it('returns just the root when it has no children', () => {
		expect(collectDescendants(1, new Map())).toEqual([1])
	})

	it('collects direct children', () => {
		const children = new Map([[1, [2, 3]]])

		expect(collectDescendants(1, children).sort((a, b) => a - b)).toEqual([1, 2, 3])
	})

	it('collects transitive descendants', () => {
		const children = new Map([
			[1, [2]],
			[2, [3]],
			[3, [4]],
		])

		expect(collectDescendants(1, children).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
	})

	it('only collects the subtree under the given root', () => {
		const children = new Map([
			[1, [2]],
			[10, [11]],
		])

		expect(collectDescendants(1, children)).toEqual([1, 2])
	})
})

describe('parseCpuTime', () => {
	it('parses MM:SS into ticks (hundredths of a second)', () => {
		// 1:23 = 83s = 8300 ticks at 100 Hz.
		expect(parseCpuTime('1:23')).toBe(8300)
	})

	it('parses fractional seconds (BSD/macOS style)', () => {
		expect(parseCpuTime('0:00.50')).toBe(50)
	})

	it('parses HH:MM:SS', () => {
		// 1:00:00 = 3600s = 360000 ticks.
		expect(parseCpuTime('1:00:00')).toBe(360_000)
	})

	it('parses a day prefix', () => {
		// 1-00:00:00 = 86400s.
		expect(parseCpuTime('1-00:00:00')).toBe(86_400 * 100)
	})

	it('returns 0 for empty or malformed values', () => {
		expect(parseCpuTime('')).toBe(0)
		expect(parseCpuTime('   ')).toBe(0)
		expect(parseCpuTime('garbage')).toBe(0)
	})
})

describe('parsePsOutput', () => {
	const output = [
		'  PID  PPID     TIME   RSS',
		'  100     1  0:05.00  1024',
		'  200   100  0:10.50  2048',
		'  300   100  0:00.00   512',
	].join('\n')

	it('skips the header row', () => {
		const { stats } = parsePsOutput(output)

		expect(stats.has(1)).toBe(false)
		expect(stats.size).toBe(3)
	})

	it('converts rss from KiB to bytes and time to ticks', () => {
		const { stats } = parsePsOutput(output)

		expect(stats.get(100)?.rss).toBe(1024 * 1024)
		expect(stats.get(200)?.cputimeTicks).toBe(1050)
	})

	it('builds the parent → children map', () => {
		const { children } = parsePsOutput(output)

		expect(children.get(100)?.sort((a, b) => a - b)).toEqual([200, 300])
	})

	it('lets collectDescendants sum a process tree', () => {
		const { children } = parsePsOutput(output)

		expect(collectDescendants(100, children).sort((a, b) => a - b)).toEqual([100, 200, 300])
	})

	it('ignores malformed rows', () => {
		const { stats } = parsePsOutput('PID PPID TIME RSS\ngarbage line\n42 1 0:01 64')

		expect(stats.size).toBe(1)
		expect(stats.has(42)).toBe(true)
	})

	it('handles empty output without throwing', () => {
		expect(parsePsOutput('').stats.size).toBe(0)
	})
})

describe('sumTickDeltas', () => {
	it('returns 0 when there is no previous snapshot', () => {
		expect(sumTickDeltas(undefined, new Map([[1, 100]]))).toBe(0)
	})

	it('sums per-PID increases between snapshots', () => {
		const prev = new Map([
			[1, 100],
			[2, 200],
		])
		const curr = new Map([
			[1, 150],
			[2, 260],
		])

		expect(sumTickDeltas(prev, curr)).toBe(50 + 60)
	})

	it('ignores a freshly-appeared PID so a growing tree does not spike', () => {
		// PID 2 is new this sample: its since-birth ticks must not count as interval work.
		const prev = new Map([[1, 100]])
		const curr = new Map([
			[1, 110],
			[2, 5000],
		])

		expect(sumTickDeltas(prev, curr)).toBe(10)
	})

	it('ignores PIDs whose ticks went backwards (PID reuse)', () => {
		const prev = new Map([[1, 100]])
		const curr = new Map([[1, 40]])

		expect(sumTickDeltas(prev, curr)).toBe(0)
	})
})

describe('parseProcStat', () => {
	// Fields after "comm": state(2) ppid(3) ... utime(13) stime(14) ... rss(23).
	// The slice starts after the closing paren, so index 0 = state, index 1 = ppid,
	// index 11 = utime, index 12 = stime, index 21 = rss (in pages).
	function buildStat(opts: {
		ppid: number
		utime: number
		stime: number
		rssPages: number
	}): string {
		const fields = new Array(50).fill('0')
		fields[1] = String(opts.ppid)
		fields[11] = String(opts.utime)
		fields[12] = String(opts.stime)
		fields[21] = String(opts.rssPages)

		return `1234 (some comm) S ${fields.slice(1).join(' ')}`
	}

	it('parses ppid, cpu ticks, and rss', () => {
		const stat = buildStat({ ppid: 1, utime: 100, stime: 50, rssPages: 10 })
		const parsed = parseProcStat(stat, 4096)

		expect(parsed).toEqual({ ppid: 1, utime: 100, stime: 50, rss: 10 * 4096 })
	})

	it('handles a comm field containing spaces and parens', () => {
		const fields = new Array(50).fill('0')
		fields[1] = '7'
		fields[11] = '1'
		fields[12] = '2'
		fields[21] = '3'
		const stat = `999 (weird )( name) S ${fields.slice(1).join(' ')}`

		expect(parseProcStat(stat, 4096)?.ppid).toBe(7)
	})

	it('returns null when there is no comm paren', () => {
		expect(parseProcStat('1234 no parens here')).toBeNull()
	})

	it('returns null when ppid is not a number', () => {
		expect(parseProcStat('1234 (comm) S notanumber')).toBeNull()
	})
})

describe('cpuPercentFromTicks', () => {
	it('computes a percentage of total capacity', () => {
		// 100 ticks over 1s on a single CPU at 100 Hz = 100% of one core.
		expect(cpuPercentFromTicks(100, 1000, 1)).toBeCloseTo(100)
	})

	it('divides across multiple cores', () => {
		// 100 ticks over 1s across 4 cores = 25% of total capacity.
		expect(cpuPercentFromTicks(100, 1000, 4)).toBeCloseTo(25)
	})

	it('clamps negative deltas to zero', () => {
		expect(cpuPercentFromTicks(-50, 1000, 1)).toBe(0)
	})

	it('returns zero for a non-positive elapsed window', () => {
		expect(cpuPercentFromTicks(100, 0, 1)).toBe(0)
	})

	it('returns zero when there are no cpus reported', () => {
		expect(cpuPercentFromTicks(100, 1000, 0)).toBe(0)
	})
})
