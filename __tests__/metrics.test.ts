import { describe, expect, it } from 'vitest'
import {
	collectDescendants,
	cpuPercentFromTicks,
	parseCpuTime,
	parseProcStat,
	parsePsOutput,
	safeEnv,
	sumTickDeltas,
} from '../src/metrics/index.js'

describe('safeEnv', () => {
	it('keeps only allowlisted variables and drops secrets', () => {
		const env = safeEnv({
			PATH: '/usr/bin',
			HOME: '/home/me',
			SECRET_TOKEN: 'abc',
			AWS_SECRET_ACCESS_KEY: 'nope',
		})

		expect(env.PATH).toBe('/usr/bin')

		expect(env.HOME).toBe('/home/me')

		expect(env.SECRET_TOKEN).toBeUndefined()

		expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
	})

	it('forces colour output, even with no source', () => {
		expect(safeEnv({}).FORCE_COLOR).toBe('1')

		expect(safeEnv().FORCE_COLOR).toBe('1')
	})
})

describe('collectDescendants', () => {
	it('returns just the root when it has no children', () => {
		expect(collectDescendants(1, new Map())).toEqual([1])
	})

	it('collects transitive descendants of the given root only', () => {
		const children = new Map([
			[1, [2]],
			[2, [3]],
			[10, [11]],
		])

		expect(collectDescendants(1, children).sort((a, b) => a - b)).toEqual([1, 2, 3])
	})
})

describe('parseCpuTime', () => {
	it.each([
		['1:23', 8300],
		['0:00.50', 50],
		['1:00:00', 360_000],
		['1-00:00:00', 86_400 * 100],
	])('parses %j into ticks', (raw, ticks) => {
		expect(parseCpuTime(raw)).toBe(ticks)
	})

	it.each(['', '   ', 'garbage'])('returns 0 for %j', (raw) => {
		expect(parseCpuTime(raw)).toBe(0)
	})
})

describe('parsePsOutput', () => {
	const output = [
		'  PID  PPID     TIME   RSS',
		'  100     1  0:05.00  1024',
		'  200   100  0:10.50  2048',
		'  300   100  0:00.00   512',
	].join('\n')

	it('skips the header and parses each row', () => {
		const { stats } = parsePsOutput(output)

		expect(stats.has(1)).toBe(false)

		expect(stats.size).toBe(3)

		expect(stats.get(100)?.rss).toBe(1024 * 1024)

		expect(stats.get(200)?.cputimeTicks).toBe(1050)
	})

	it('builds a parent → children map walkable by collectDescendants', () => {
		const { children } = parsePsOutput(output)

		expect(children.get(100)?.sort((a, b) => a - b)).toEqual([200, 300])

		expect(collectDescendants(100, children).sort((a, b) => a - b)).toEqual([100, 200, 300])
	})

	it('ignores malformed rows and empty output', () => {
		expect(parsePsOutput('PID PPID TIME RSS\ngarbage line\n42 1 0:01 64').stats.size).toBe(1)

		expect(parsePsOutput('').stats.size).toBe(0)
	})
})

describe('sumTickDeltas', () => {
	it('returns 0 without a previous snapshot', () => {
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

		expect(sumTickDeltas(prev, curr)).toBe(110)
	})

	it('ignores a freshly-appeared PID so a growing tree does not spike', () => {
		expect(
			sumTickDeltas(
				new Map([[1, 100]]),
				new Map([
					[1, 110],
					[2, 5000],
				]),
			),
		).toBe(10)
	})

	it('ignores PIDs whose ticks went backwards (PID reuse)', () => {
		expect(sumTickDeltas(new Map([[1, 100]]), new Map([[1, 40]]))).toBe(0)
	})
})

describe('parseProcStat', () => {
	// Field offsets after comm: 1 = ppid, 11 = utime, 12 = stime, 21 = rss (pages).
	function buildStat(o: { ppid: number; utime: number; stime: number; rssPages: number }): string {
		const fields = new Array(50).fill('0')

		fields[1] = String(o.ppid)

		fields[11] = String(o.utime)

		fields[12] = String(o.stime)

		fields[21] = String(o.rssPages)

		return `1234 (some comm) S ${fields.slice(1).join(' ')}`
	}

	it('parses ppid, cpu ticks, and rss in bytes', () => {
		expect(
			parseProcStat(buildStat({ ppid: 1, utime: 100, stime: 50, rssPages: 10 }), 4096),
		).toEqual({ ppid: 1, utime: 100, stime: 50, rss: 10 * 4096 })
	})

	it('handles a comm field containing spaces and parens', () => {
		const fields = new Array(50).fill('0')

		fields[1] = '7'

		expect(parseProcStat(`999 (weird )( name) S ${fields.slice(1).join(' ')}`, 4096)?.ppid).toBe(7)
	})

	it('returns null on a missing comm paren or non-numeric ppid', () => {
		expect(parseProcStat('1234 no parens here')).toBeNull()

		expect(parseProcStat('1234 (comm) S notanumber')).toBeNull()
	})

	it('floors a malformed rss field to 0 rather than NaN', () => {
		const fields = new Array(50).fill('0')

		fields[1] = '1'

		fields[21] = 'bogus'

		const parsed = parseProcStat(`1234 (comm) S ${fields.slice(1).join(' ')}`, 4096)

		expect(parsed?.rss).toBe(0)
	})
})

describe('cpuPercentFromTicks', () => {
	it('computes a percentage of total capacity across cores', () => {
		expect(cpuPercentFromTicks(100, 1000, 1)).toBeCloseTo(100)

		expect(cpuPercentFromTicks(100, 1000, 4)).toBeCloseTo(25)
	})

	it('returns 0 for negative deltas or degenerate windows/cpus', () => {
		expect(cpuPercentFromTicks(-50, 1000, 1)).toBe(0)

		expect(cpuPercentFromTicks(100, 0, 1)).toBe(0)

		expect(cpuPercentFromTicks(100, 1000, 0)).toBe(0)
	})
})
