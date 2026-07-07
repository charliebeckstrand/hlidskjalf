import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeter } from '../src/metrics/index.js'

// The two execFile-backed paths: `getconf` (page size, Linux only) and `ps` (the non-Linux
// metrics source). Each can be told to throw, modelling a missing binary or a wedged process
// table — the defensive fallbacks the /proc-based meter.test can't reach.
const exec = {
	getconfThrows: false,
	psThrows: false,
	psOutput: '',
	psCalls: 0,
	// When set, ps callbacks queue here instead of firing, modelling a slow/in-flight sample
	// the test releases manually.
	defer: false,
	pending: [] as (() => void)[],
}

vi.mock('node:child_process', () => ({
	// `getconf` (page size) is still read synchronously at construction.
	execFileSync: (cmd: string) => {
		if (cmd === 'getconf') {
			if (exec.getconfThrows) throw new Error('ENOENT')

			return '4096\n'
		}

		throw new Error(`unexpected execFileSync: ${cmd}`)
	},
	// `ps` runs via async execFile now; drive its callback synchronously so the sample still
	// lands within the same tick the test asserts on.
	execFile: (
		cmd: string,
		_args: string[],
		_opts: unknown,
		cb: (error: Error | null, stdout: string) => void,
	) => {
		if (cmd !== 'ps') {
			cb(new Error(`unexpected execFile: ${cmd}`), '')

			return
		}

		exec.psCalls += 1

		const run = () => {
			if (exec.psThrows) cb(new Error('ps failed'), '')
			else cb(null, exec.psOutput)
		}

		if (exec.defer) exec.pending.push(run)
		else run()
	},
}))

const realPlatform = process.platform

function setPlatform(value: string): void {
	Object.defineProperty(process, 'platform', { value, configurable: true })
}

beforeEach(() => {
	vi.useFakeTimers()

	exec.getconfThrows = false

	exec.psThrows = false

	exec.psOutput = ''

	exec.psCalls = 0

	exec.defer = false

	exec.pending = []
})

afterEach(() => {
	vi.useRealTimers()

	setPlatform(realPlatform)

	vi.restoreAllMocks()
})

describe('createMeter (ps path)', () => {
	beforeEach(() => {
		setPlatform('darwin')
	})

	it('reads metrics from ps output on a non-Linux platform', () => {
		exec.psOutput = ['  PID  PPID    TIME    RSS', '100 1 0:05.00 2048'].join('\n')

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		const onChange = vi.fn()

		const meter = createMeter({ roots: () => new Map([[100, 'web']]), setMetrics, onChange })

		expect(setMetrics).toHaveBeenCalledWith('web', { cpu: 0, mem: 2048 * 1024 })

		expect(onChange).toHaveBeenCalled()

		meter.stop()
	})

	it('survives a ps invocation that throws', () => {
		exec.psThrows = true

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		expect(() =>
			createMeter({ roots: () => new Map([[100, 'web']]), setMetrics, onChange: () => {} }).stop(),
		).not.toThrow()

		// A failed sample writes nothing rather than crashing the poll.
		expect(setMetrics).not.toHaveBeenCalled()
	})

	it('does not start an overlapping ps sample while one is still in flight', async () => {
		exec.defer = true

		exec.psOutput = ['  PID  PPID    TIME    RSS', '100 1 0:01.00 1024'].join('\n')

		const meter = createMeter({
			roots: () => new Map([[100, 'web']]),
			setMetrics: () => true,
			onChange: () => {},
		})

		// Construction launched one sample; its ps hasn't answered yet (deferred).
		expect(exec.psCalls).toBe(1)

		// A request while that sample drains must not shell out to ps a second time.
		meter.request()

		await vi.advanceTimersByTimeAsync(1000)

		expect(exec.psCalls).toBe(1)

		// Release the in-flight sample and confirm the poll can sample again afterward.
		exec.pending.shift()?.()

		await vi.advanceTimersByTimeAsync(3000)

		expect(exec.psCalls).toBeGreaterThan(1)

		meter.stop()
	})
})

describe('createMeter (page size resolution)', () => {
	it('falls back to a 4096 page size when getconf is unavailable on Linux', () => {
		setPlatform('linux')

		exec.getconfThrows = true

		const setMetrics = vi.fn((_name: string, _metrics: { cpu: number; mem: number }) => true)

		// No roots, so the poll takes no sample; the only thing exercised is the page-size probe
		// failing during construction, which must not throw.
		expect(() =>
			createMeter({ roots: () => new Map(), setMetrics, onChange: () => {} }).stop(),
		).not.toThrow()
	})
})
