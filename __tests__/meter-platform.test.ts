import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeter } from '../src/metrics/index.js'

// The two execFile-backed paths: `getconf` (page size, Linux only) and `ps` (the non-Linux
// metrics source). Each can be told to throw, modelling a missing binary or a wedged process
// table — the defensive fallbacks the /proc-based meter.test can't reach.
const exec = {
	getconfThrows: false,
	psThrows: false,
	psOutput: '',
}

vi.mock('node:child_process', () => ({
	execFileSync: (cmd: string) => {
		if (cmd === 'getconf') {
			if (exec.getconfThrows) throw new Error('ENOENT')

			return '4096\n'
		}

		if (cmd === 'ps') {
			if (exec.psThrows) throw new Error('ps failed')

			return exec.psOutput
		}

		throw new Error(`unexpected command: ${cmd}`)
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
