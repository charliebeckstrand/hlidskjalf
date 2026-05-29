import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_LOGS } from '../src/logs.js'
import { createRunner, type Runner } from '../src/processes.js'
import type { Workspace } from '../src/types.js'

// A controllable stand-in for a spawned child process. Lets tests drive
// stdout/stderr output and exit/signal events deterministically.
const hoisted = vi.hoisted(() => {
	const { EventEmitter } = require('node:events') as typeof import('node:events')

	let pidSeq = 1000

	class FakeChild extends EventEmitter {
		stdout = new EventEmitter()
		stderr = new EventEmitter()
		exitCode: number | null = null
		signalCode: string | null = null
		pid = ++pidSeq
		killed = false
		lastSignal: string | null = null
		args: string[]
		options: Record<string, unknown>

		constructor(args: string[], options: Record<string, unknown> = {}) {
			super()

			this.args = args
			this.options = options
		}

		kill(signal?: string): boolean {
			this.lastSignal = signal ?? 'SIGTERM'

			if (this.exitCode !== null || this.signalCode !== null) return true

			this.killed = true

			// Model the OS delivering the signal and the process then closing.
			queueMicrotask(() => {
				if (this.exitCode === null && this.signalCode === null) {
					this.signalCode = this.lastSignal

					this.emit('close', null, this.lastSignal)
				}
			})

			return true
		}

		/** Push a chunk of output as the child would on stdout. */
		out(text: string): void {
			this.stdout.emit('data', Buffer.from(text))
		}

		/** Simulate the process exiting on its own (a crash or clean stop). */
		exit(code: number | null, signal: string | null = null): void {
			this.exitCode = code

			this.signalCode = signal

			this.emit('close', code, signal)
		}
	}

	const spawned: FakeChild[] = []

	// Controllable `ps` output for the metrics poll (the non-linux code path).
	const psOutput = { current: '' }

	return { FakeChild, spawned, psOutput }
})

vi.mock('node:child_process', () => ({
	spawn: (_cmd: string, args: string[], options: Record<string, unknown>) => {
		const child = new hoisted.FakeChild(args, options)

		hoisted.spawned.push(child)

		return child
	},
	execFileSync: () => hoisted.psOutput.current,
}))

const APP: Workspace = { name: 'web', kind: 'app', deps: [] }

/** Latest spawned child for a workspace (args are ['--filter', name, 'run', 'dev']). */
function childFor(name: string): InstanceType<typeof hoisted.FakeChild> | undefined {
	for (let i = hoisted.spawned.length - 1; i >= 0; i--) {
		if (hoisted.spawned[i]?.args[1] === name) return hoisted.spawned[i]
	}

	return undefined
}

function spawnCount(name: string): number {
	return hoisted.spawned.filter((c) => c.args[1] === name).length
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

let runner: Runner

beforeEach(() => {
	// killTree signals the child's process group via process.kill(-pid). The fake
	// pids here aren't real groups, so intercept the call and drive the matching
	// fake child instead of signalling an unrelated process group on the machine.
	vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: NodeJS.Signals) => {
		const child = hoisted.spawned.find((c) => c.pid === Math.abs(pid))

		if (!child) {
			const err = new Error('ESRCH') as NodeJS.ErrnoException

			err.code = 'ESRCH'

			throw err
		}

		child.kill(signal)

		return true
	}) as typeof process.kill)
})

afterEach(async () => {
	vi.useRealTimers()

	await runner?.shutdown().catch(() => {})

	hoisted.spawned.length = 0

	vi.restoreAllMocks()
})

describe('createRunner', () => {
	it('returns a runner with the expected interface', () => {
		runner = createRunner('/tmp/test-root')

		expect(typeof runner.get).toBe('function')
		expect(typeof runner.start).toBe('function')
		expect(typeof runner.shutdown).toBe('function')
		expect(typeof runner.stopProcess).toBe('function')
		expect(typeof runner.restartProcess).toBe('function')
		expect(typeof runner.clearLogs).toBe('function')
	})

	it('is an EventEmitter', () => {
		runner = createRunner('/tmp/test-root')

		expect(typeof runner.on).toBe('function')
		expect(typeof runner.emit).toBe('function')
		expect(typeof runner.off).toBe('function')
	})

	it('get returns undefined for unknown process', () => {
		runner = createRunner('/tmp/test-root')

		expect(runner.get('nonexistent')).toBeUndefined()
	})
})

describe('runner lifecycle', () => {
	it('spawns a child and starts in the building state', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		expect(childFor('web')).toBeDefined()

		expect(runner.get('web')?.status).toBe('building')
	})

	it('emits a change event when output arrives', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		const onChange = vi.fn()

		runner.on('change', onChange)

		childFor('web')?.out('hello\n')

		expect(onChange).toHaveBeenCalled()
	})
})

describe('status transitions', () => {
	beforeEach(async () => {
		runner = createRunner('/root')

		await runner.start([APP])
	})

	it('moves to watching on a build-success signal', () => {
		childFor('web')?.out('Watching for changes\n')

		expect(runner.get('web')?.status).toBe('watching')
	})

	it('moves to ready and captures the url when a server reports listening', () => {
		childFor('web')?.out('running on http://localhost:3000\n')

		expect(runner.get('web')?.status).toBe('ready')
		expect(runner.get('web')?.url).toBe('http://localhost:3000')
	})

	it('moves to error on an error line', () => {
		childFor('web')?.out('[ERROR] something broke\n')

		expect(runner.get('web')?.status).toBe('error')
	})

	it('captures output as logs', () => {
		childFor('web')?.out('a line of output\n')

		expect(runner.get('web')?.logs).toContain('a line of output')
	})
})

describe('log handling', () => {
	beforeEach(async () => {
		runner = createRunner('/root')

		await runner.start([APP])
	})

	it('caps the log buffer while retaining the newest output', () => {
		// Emit far more than the buffer holds so trimming is exercised. The buffer
		// keeps headroom above MAX_LOGS to amortize trims, so the bound is 2x.
		const count = MAX_LOGS * 5

		const lines = Array.from({ length: count }, (_, i) => `line${i}`).join('\n')

		childFor('web')?.out(`${lines}\n`)

		const logs = runner.get('web')?.logs ?? []

		expect(logs.length).toBeLessThanOrEqual(MAX_LOGS * 2)

		expect(logs.length).toBeGreaterThanOrEqual(MAX_LOGS)

		expect(logs.at(-1)).toBe(`line${count - 1}`)
	})

	it('flushes and truncates an oversized line with no newline', () => {
		childFor('web')?.out('x'.repeat(70_000))

		const logs = runner.get('web')?.logs ?? []

		expect(logs.length).toBe(1)

		expect(logs[0]?.length).toBe(8192)
	})

	it('clears the buffer for a process and emits a change', () => {
		childFor('web')?.out('line one\nline two\n')

		expect(runner.get('web')?.logs.length ?? 0).toBeGreaterThan(0)

		const onChange = vi.fn()

		runner.on('change', onChange)

		runner.clearLogs('web')

		expect(runner.get('web')?.logs).toEqual([])

		expect(onChange).toHaveBeenCalled()
	})

	it('ignores clearLogs for an unknown process', () => {
		expect(() => runner.clearLogs('nonexistent')).not.toThrow()
	})
})

describe('error recovery', () => {
	it('returns to the last good status if no further errors arrive', async () => {
		vi.useFakeTimers()

		runner = createRunner('/root')

		await runner.start([APP])

		const child = childFor('web')

		child?.out('Watching for changes\n')
		child?.out('[ERROR] transient\n')

		expect(runner.get('web')?.status).toBe('error')

		vi.advanceTimersByTime(5000)

		expect(runner.get('web')?.status).toBe('watching')
	})
})

describe('unexpected exit', () => {
	it('marks a clean exit (code 0) as stopped without restarting', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.exit(0)

		expect(runner.get('web')?.status).toBe('stopped')

		expect(spawnCount('web')).toBe(1)
	})

	it('restarts with backoff after a crash', async () => {
		vi.useFakeTimers()

		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.exit(1)

		expect(runner.get('web')?.status).toBe('error')

		expect(spawnCount('web')).toBe(1)

		// First backoff is 1s.
		vi.advanceTimersByTime(1000)

		expect(spawnCount('web')).toBe(2)
	})

	it('gives up after exceeding the retry limit', async () => {
		vi.useFakeTimers()

		runner = createRunner('/root')

		await runner.start([APP])

		// Crash → restart → crash, escalating the backoff each time.
		childFor('web')?.exit(1)

		vi.advanceTimersByTime(1000)

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(2000)

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(4000)

		expect(spawnCount('web')).toBe(4)

		// One crash too many: the runner gives up rather than respawning.
		childFor('web')?.exit(1)

		vi.advanceTimersByTime(8000)

		expect(spawnCount('web')).toBe(4)

		expect(runner.get('web')?.status).toBe('error')
		expect(runner.get('web')?.logs.some((l) => l.includes('giving up'))).toBe(true)
	})
})

describe('manual stop and restart', () => {
	it('stops a running process cleanly', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		const child = childFor('web')

		child?.out('Watching for changes\n')

		runner.stopProcess('web')

		await flush()

		expect(child?.killed).toBe(true)

		expect(runner.get('web')?.status).toBe('stopped')
	})

	it('does not log a spurious give-up message when stopping', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.out('Watching for changes\n')

		runner.stopProcess('web')

		await flush()

		expect(runner.get('web')?.logs.some((l) => l.includes('giving up'))).toBe(false)
	})

	it('restarts a stopped process when stop is toggled', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		runner.stopProcess('web')

		await flush()

		expect(runner.get('web')?.status).toBe('stopped')

		runner.restartProcess('web')

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(runner.get('web')?.status).toBe('building')
	})

	it('restarts a running process without flashing an error', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.out('Watching for changes\n')

		runner.restartProcess('web')

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(runner.get('web')?.status).toBe('building')
		expect(runner.get('web')?.logs.some((l) => l.includes('giving up'))).toBe(false)
	})

	it('does not double-spawn when restart is pressed twice before the child closes', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.out('Watching for changes\n')

		// Two restarts land while the old child is still tearing down. The second
		// must not stack a second teardown handler, or the close fires both and
		// spawns two dev servers for one workspace.
		runner.restartProcess('web')
		runner.restartProcess('web')

		await flush()
		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(runner.get('web')?.status).toBe('building')
	})

	it('does not duplicate when stop then restart race before the child closes', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.out('Watching for changes\n')

		runner.stopProcess('web')
		runner.restartProcess('web')

		await flush()
		await flush()

		// Original + a single restart spawn; the latest request (restart) wins.
		expect(spawnCount('web')).toBe(2)

		expect(runner.get('web')?.status).toBe('building')
	})
})

describe('process isolation', () => {
	it('spawns dev processes detached, in their own group', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		// Without a dedicated group, a dev toolchain signalling its own group on
		// teardown would also signal — and exit — the hlidskjalf UI.
		expect(childFor('web')?.options.detached).toBe(true)
	})

	it('signals the whole process group when stopping', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		childFor('web')?.out('Watching for changes\n')

		const pid = childFor('web')?.pid ?? 0

		runner.stopProcess('web')

		await flush()

		// Negative PID targets the group, so the real server under pnpm dies too.
		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGTERM')
	})
})

describe('dynamic workspaces', () => {
	const LIB: Workspace = { name: 'lib', kind: 'package', deps: [] }

	it('spawns a workspace added after startup', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		runner.addWorkspace(LIB)

		expect(childFor('lib')).toBeDefined()

		expect(runner.get('lib')?.status).toBe('building')
	})

	it('ignores adding a workspace that already exists', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		runner.addWorkspace(APP)

		expect(spawnCount('web')).toBe(1)
	})

	it('stops and forgets a removed workspace', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		const child = childFor('web')

		runner.removeWorkspace('web')

		await flush()

		expect(child?.killed).toBe(true)

		expect(runner.get('web')).toBeUndefined()
	})

	it('does not restart a removed workspace when its child exits', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		runner.removeWorkspace('web')

		await flush()

		// The teardown SIGTERM closes the child; that close must not respawn it.
		expect(spawnCount('web')).toBe(1)

		expect(runner.get('web')).toBeUndefined()
	})

	it('ignores removing an unknown workspace', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		expect(() => runner.removeWorkspace('nonexistent')).not.toThrow()
	})
})

describe('shutdown', () => {
	it('terminates running children', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		const child = childFor('web')

		await runner.shutdown()

		expect(child?.killed).toBe(true)
	})

	it('ignores further output after shutdown', async () => {
		runner = createRunner('/root')

		await runner.start([APP])

		const child = childFor('web')

		await runner.shutdown()

		const before = runner.get('web')?.logs.length ?? 0

		child?.out('late output\n')

		expect(runner.get('web')?.logs.length).toBe(before)
	})
})

describe('metrics', () => {
	const realPlatform = process.platform

	beforeEach(() => {
		// Force the `ps`-based path so the poll reads our controllable fixture
		// rather than the host's /proc (which the Linux path uses).
		Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

		hoisted.psOutput.current = ''
	})

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })

		hoisted.psOutput.current = ''
	})

	/** One-line ps tree: the root pid with a cumulative cputime and RSS. */
	const psTree = (pid: number, time: string, rssKb: number): string =>
		['  PID  PPID    TIME    RSS', `${pid} 1 ${time} ${rssKb}`].join('\n')

	it('derives a bounded interval CPU from cumulative cputime deltas (no startup spike)', async () => {
		vi.useFakeTimers()

		runner = createRunner('/root', true)

		await runner.start([APP])

		const pid = childFor('web')?.pid ?? 0

		// Baseline: the process has already burned 10s of CPU at startup. A naive
		// reading would surface that whole cumulative figure as a spike.
		hoisted.psOutput.current = psTree(pid, '0:10.00', 200_000)

		// A status change drives an event-driven sample (records the baseline).
		childFor('web')?.out('Watching for changes\n')

		await vi.advanceTimersByTimeAsync(1200)

		// The next window adds only 0.5 CPU-seconds of real work.
		hoisted.psOutput.current = psTree(pid, '0:10.50', 200_000)

		childFor('web')?.out('Build start\n')

		await vi.advanceTimersByTimeAsync(1200)

		const metrics = runner.get('web')?.metrics

		expect(metrics).toBeDefined()

		// Reflects the 0.5s delta, not the 10.5s cumulative total: well under 100%.
		expect(metrics?.cpu).toBeGreaterThan(0)
		expect(metrics?.cpu).toBeLessThan(100)

		expect(metrics?.mem).toBe(200_000 * 1024)
	})

	it('clears stale metrics once a process is stopped', async () => {
		vi.useFakeTimers()

		runner = createRunner('/root', true)

		await runner.start([APP])

		const pid = childFor('web')?.pid ?? 0

		hoisted.psOutput.current = psTree(pid, '0:01.00', 100_000)

		childFor('web')?.out('Watching for changes\n')

		await vi.advanceTimersByTimeAsync(1200)

		expect(runner.get('web')?.metrics).toBeDefined()

		runner.stopProcess('web')

		await vi.advanceTimersByTimeAsync(10)

		expect(runner.get('web')?.status).toBe('stopped')
		expect(runner.get('web')?.metrics).toBeUndefined()
	})
})
