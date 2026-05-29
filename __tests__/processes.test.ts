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

		constructor(args: string[]) {
			super()

			this.args = args
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

	return { FakeChild, spawned }
})

vi.mock('node:child_process', () => ({
	spawn: (_cmd: string, args: string[]) => {
		const child = new hoisted.FakeChild(args)

		hoisted.spawned.push(child)

		return child
	},
	execFileSync: () => '',
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

afterEach(async () => {
	vi.useRealTimers()

	await runner?.shutdown().catch(() => {})

	hoisted.spawned.length = 0
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
