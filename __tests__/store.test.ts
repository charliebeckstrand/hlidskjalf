import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_LOGS } from '../src/logs.js'
import { createStore, type Store } from '../src/store.js'
import type { Options, Process, Workspace } from '../src/types.js'

// A controllable stand-in for a spawned child process. Lets tests drive stdout/stderr
// output and exit/signal events deterministically.
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

			// SIGSTOP/SIGCONT suspend and resume; they don't terminate the process.
			if (this.lastSignal === 'SIGSTOP' || this.lastSignal === 'SIGCONT') return true

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

	const psOutput = { current: '' }

	const discovered = { current: [] as Workspace[] }

	return { FakeChild, spawned, psOutput, discovered }
})

vi.mock('node:child_process', () => ({
	spawn: (_cmd: string, args: string[], options: Record<string, unknown>) => {
		const child = new hoisted.FakeChild(args, options)

		hoisted.spawned.push(child)

		return child
	},
	execFileSync: () => hoisted.psOutput.current,
}))

// Keep the real sort/filter logic; only stub discovery so tests control the workspace set.
vi.mock('../src/workspaces.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/workspaces.js')>()

	return { ...actual, discover: () => hoisted.discovered.current }
})

const APP: Workspace = { name: 'web', kind: 'app', deps: [] }

const LIB: Workspace = { name: 'lib', kind: 'package', deps: [] }

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

let store: Store

function get(name: string): Process | undefined {
	return store.getSnapshot().find((p) => p.workspace.name === name)
}

function makeStore(opts: Partial<Options> = {}): Store {
	return createStore({
		root: '/root',
		order: 'alphabetical',
		title: 'Test',
		metrics: false,
		watch: false,
		theme: 'bifrost',
		...opts,
	})
}

beforeEach(() => {
	hoisted.discovered.current = [APP]

	// killTree signals the child's group via process.kill(-pid). The fake pids aren't
	// real groups, so intercept and drive the matching fake child instead.
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

	await store?.shutdown().catch(() => {})

	hoisted.spawned.length = 0

	hoisted.psOutput.current = ''

	vi.restoreAllMocks()
})

describe('createStore', () => {
	it('exposes the store interface', () => {
		store = makeStore()

		for (const method of [
			'getSnapshot',
			'subscribe',
			'start',
			'shutdown',
			'stopProcess',
			'restartProcess',
			'clearLogs',
			'addWorkspace',
			'removeWorkspace',
		] as const) {
			expect(typeof store[method]).toBe('function')
		}
	})

	it('starts empty before start()', () => {
		store = makeStore()

		expect(store.getSnapshot()).toEqual([])
	})

	it('resolves false when no workspaces are discovered', async () => {
		hoisted.discovered.current = []

		store = makeStore()

		expect(await store.start()).toBe(false)

		expect(store.getSnapshot()).toEqual([])
	})
})

describe('external-store contract', () => {
	it('returns a stable snapshot reference between changes and a fresh one after a change', async () => {
		store = makeStore()

		await store.start()

		const a = store.getSnapshot()

		const b = store.getSnapshot()

		expect(a).toBe(b)

		childFor('web')?.out('a line\n')

		const c = store.getSnapshot()

		expect(c).not.toBe(a)
	})

	it('coalesces a burst into one lazily-rebuilt snapshot reflecting the latest output', async () => {
		store = makeStore()

		await store.start()

		const listener = vi.fn()

		store.subscribe(listener)

		// Each chunk is a separate data event, as a chatty dev server would emit.
		for (let i = 0; i < 50; i++) childFor('web')?.out(`line ${i}\n`)

		// The store notifies per line, but a single read rebuilds the snapshot just once
		// and reflects every line — the trailing-edge guarantee the UI relies on.
		expect(listener.mock.calls.length).toBeGreaterThanOrEqual(50)

		const snap = store.getSnapshot()

		expect(snap).toBe(store.getSnapshot())

		expect(get('web')?.logs.at(-1)).toBe('line 49')
	})

	it('notifies subscribers when output arrives and stops after unsubscribe', async () => {
		store = makeStore()

		await store.start()

		const listener = vi.fn()

		const unsubscribe = store.subscribe(listener)

		childFor('web')?.out('hello\n')

		expect(listener).toHaveBeenCalled()

		unsubscribe()

		listener.mockClear()

		childFor('web')?.out('more\n')

		expect(listener).not.toHaveBeenCalled()
	})
})

describe('lifecycle', () => {
	it('spawns a child and starts in the building state', async () => {
		store = makeStore()

		await store.start()

		expect(childFor('web')).toBeDefined()

		expect(get('web')?.status).toBe('building')
	})

	it('spawns packages before apps, gating apps on package readiness', async () => {
		hoisted.discovered.current = [LIB, { name: 'web', kind: 'app', deps: ['lib'] }]

		store = makeStore()

		await store.start()

		// The package spawns first; the app waits until the package settles.
		expect(childFor('lib')).toBeDefined()

		expect(childFor('web')).toBeUndefined()

		childFor('lib')?.out('Watching for changes\n')

		await flush()

		expect(childFor('web')).toBeDefined()
	})
})

describe('status transitions', () => {
	beforeEach(async () => {
		store = makeStore()

		await store.start()
	})

	it('moves to watching on a build-success signal', () => {
		childFor('web')?.out('Watching for changes\n')

		expect(get('web')?.status).toBe('watching')
	})

	it('moves to ready and captures the url when a server reports listening', () => {
		childFor('web')?.out('running on http://localhost:3000\n')

		expect(get('web')?.status).toBe('ready')

		expect(get('web')?.url).toBe('http://localhost:3000')
	})

	it('moves to error on an error line', () => {
		childFor('web')?.out('[ERROR] something broke\n')

		expect(get('web')?.status).toBe('error')
	})

	it('captures output as logs', () => {
		childFor('web')?.out('a line of output\n')

		expect(get('web')?.logs).toContain('a line of output')
	})
})

describe('log handling', () => {
	beforeEach(async () => {
		store = makeStore()

		await store.start()
	})

	it('caps the log buffer while retaining the newest output', () => {
		const count = MAX_LOGS * 5

		const lines = Array.from({ length: count }, (_, i) => `line${i}`).join('\n')

		childFor('web')?.out(`${lines}\n`)

		const logs = get('web')?.logs ?? []

		expect(logs.length).toBeLessThanOrEqual(MAX_LOGS * 2)

		expect(logs.length).toBeGreaterThanOrEqual(MAX_LOGS)

		expect(logs.at(-1)).toBe(`line${count - 1}`)
	})

	it('flushes and truncates an oversized line with no newline', () => {
		childFor('web')?.out('x'.repeat(70_000))

		const logs = get('web')?.logs ?? []

		expect(logs.length).toBe(1)

		expect(logs[0]?.length).toBe(8192)
	})

	it('clears the buffer for a process and notifies', () => {
		childFor('web')?.out('line one\nline two\n')

		expect(get('web')?.logs.length ?? 0).toBeGreaterThan(0)

		const listener = vi.fn()

		store.subscribe(listener)

		store.clearLogs('web')

		expect(get('web')?.logs).toEqual([])

		expect(listener).toHaveBeenCalled()
	})

	it('ignores clearLogs for an unknown process', () => {
		expect(() => store.clearLogs('nonexistent')).not.toThrow()
	})
})

describe('error recovery', () => {
	it('returns to the last good status if no further errors arrive', async () => {
		vi.useFakeTimers()

		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		child?.out('[ERROR] transient\n')

		expect(get('web')?.status).toBe('error')

		vi.advanceTimersByTime(5000)

		expect(get('web')?.status).toBe('watching')
	})
})

describe('unexpected exit', () => {
	it('marks a clean exit (code 0) as stopped without restarting', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.exit(0)

		expect(get('web')?.status).toBe('stopped')

		expect(spawnCount('web')).toBe(1)
	})

	it('restarts with backoff after a crash', async () => {
		vi.useFakeTimers()

		store = makeStore()

		await store.start()

		childFor('web')?.exit(1)

		expect(get('web')?.status).toBe('error')

		expect(spawnCount('web')).toBe(1)

		vi.advanceTimersByTime(1000)

		expect(spawnCount('web')).toBe(2)
	})

	it('gives up after exceeding the retry limit', async () => {
		vi.useFakeTimers()

		store = makeStore()

		await store.start()

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(1000)

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(2000)

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(4000)

		expect(spawnCount('web')).toBe(4)

		childFor('web')?.exit(1)

		vi.advanceTimersByTime(8000)

		expect(spawnCount('web')).toBe(4)

		expect(get('web')?.status).toBe('error')

		expect(get('web')?.logs.some((l) => l.includes('giving up'))).toBe(true)
	})

	it('rebuilds fsevents and respawns on a SIGABRT exit', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.exit(1, 'SIGABRT')

		await flush()

		// A pnpm rebuild fsevents child is spawned, then closes, then the workspace respawns.
		const rebuild = hoisted.spawned.find((c) => c.args[0] === 'rebuild')

		expect(rebuild).toBeDefined()

		rebuild?.exit(0)

		await flush()

		expect(spawnCount('web')).toBe(2)
	})
})

describe('manual stop and restart', () => {
	it('stops a running process cleanly via its process group', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		const pid = child?.pid ?? 0

		store.stopProcess('web')

		await flush()

		expect(child?.killed).toBe(true)

		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGTERM')

		expect(get('web')?.status).toBe('stopped')

		expect(get('web')?.logs.some((l) => l.includes('giving up'))).toBe(false)
	})

	it('restarts a stopped process when stop is toggled', async () => {
		store = makeStore()

		await store.start()

		store.stopProcess('web')

		await flush()

		expect(get('web')?.status).toBe('stopped')

		store.restartProcess('web')

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(get('web')?.status).toBe('building')
	})

	it('restarts a running process without flashing an error', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.out('Watching for changes\n')

		store.restartProcess('web')

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(get('web')?.status).toBe('building')

		expect(get('web')?.logs.some((l) => l.includes('giving up'))).toBe(false)
	})

	it('does not double-spawn when restart is pressed twice before the child closes', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.out('Watching for changes\n')

		store.restartProcess('web')

		store.restartProcess('web')

		await flush()

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(get('web')?.status).toBe('building')
	})

	it('does not duplicate when stop then restart race before the child closes', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.out('Watching for changes\n')

		store.stopProcess('web')

		store.restartProcess('web')

		await flush()

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(get('web')?.status).toBe('building')
	})
})

describe('pause and resume', () => {
	it('suspends a running process with SIGSTOP and marks it paused', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		const pid = child?.pid ?? 0

		store.pauseProcess('web')

		await flush()

		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGSTOP')

		// SIGSTOP doesn't terminate; the child stays alive.
		expect(child?.killed).toBe(false)

		expect(get('web')?.status).toBe('paused')
	})

	it('resumes a paused process with SIGCONT, restoring its prior status', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		expect(get('web')?.status).toBe('watching')

		store.pauseProcess('web')

		const pid = child?.pid ?? 0

		store.resumeProcess('web')

		await flush()

		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGCONT')

		expect(get('web')?.status).toBe('watching')
	})

	it('does not overwrite paused status with late-draining output', async () => {
		store = makeStore()

		await store.start()

		childFor('web')?.out('Watching for changes\n')

		store.pauseProcess('web')

		// Output still buffered in the pipe arrives after the SIGSTOP.
		childFor('web')?.out('running on http://localhost:3000\n')

		await flush()

		expect(get('web')?.status).toBe('paused')

		// The line is still captured in the log buffer, just not acted on.
		expect(get('web')?.logs.some((l) => l.includes('localhost:3000'))).toBe(true)
	})

	it('ignores pause when there is no live child, and resume when not paused', async () => {
		store = makeStore()

		await store.start()

		store.stopProcess('web')

		await flush()

		store.pauseProcess('web')

		expect(get('web')?.status).toBe('stopped')

		// Resuming a process that was never paused is a no-op.
		store.resumeProcess('web')

		expect(get('web')?.status).toBe('stopped')
	})

	it('wakes a paused process before stopping it so SIGTERM is honored', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		store.pauseProcess('web')

		const pid = child?.pid ?? 0

		store.stopProcess('web')

		await flush()

		// Continued first so the terminate lands promptly, then torn down.
		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGCONT')

		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGTERM')

		expect(get('web')?.status).toBe('stopped')
	})
})

describe('force kill', () => {
	it('kills a running process with SIGKILL and does not restart it', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		child?.out('Watching for changes\n')

		const pid = child?.pid ?? 0

		store.killProcess('web')

		await flush()

		expect(vi.mocked(process.kill)).toHaveBeenCalledWith(-pid, 'SIGKILL')

		expect(get('web')?.status).toBe('stopped')

		// No backoff restart was scheduled.
		expect(spawnCount('web')).toBe(1)
	})

	it('can be restarted after a kill via restartProcess', async () => {
		store = makeStore()

		await store.start()

		store.killProcess('web')

		await flush()

		expect(get('web')?.status).toBe('stopped')

		store.restartProcess('web')

		await flush()

		expect(spawnCount('web')).toBe(2)

		expect(get('web')?.status).toBe('building')
	})
})

describe('process isolation', () => {
	it('spawns dev processes detached, in their own group', async () => {
		store = makeStore()

		await store.start()

		expect(childFor('web')?.options.detached).toBe(true)
	})
})

describe('dynamic workspaces', () => {
	it('spawns a workspace added after startup and shows it in the snapshot', async () => {
		store = makeStore()

		await store.start()

		store.addWorkspace(LIB)

		expect(childFor('lib')).toBeDefined()

		expect(get('lib')?.status).toBe('building')
	})

	it('ignores adding a workspace that already exists', async () => {
		store = makeStore()

		await store.start()

		store.addWorkspace(APP)

		expect(spawnCount('web')).toBe(1)
	})

	it('stops, forgets, and hides a removed workspace', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		store.removeWorkspace('web')

		await flush()

		expect(child?.killed).toBe(true)

		expect(get('web')).toBeUndefined()
	})

	it('does not restart a removed workspace when its child exits', async () => {
		store = makeStore()

		await store.start()

		store.removeWorkspace('web')

		await flush()

		expect(spawnCount('web')).toBe(1)

		expect(get('web')).toBeUndefined()
	})

	it('ignores removing an unknown workspace', async () => {
		store = makeStore()

		await store.start()

		expect(() => store.removeWorkspace('nonexistent')).not.toThrow()
	})
})

describe('shutdown', () => {
	it('terminates running children', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		await store.shutdown()

		expect(child?.killed).toBe(true)
	})

	it('ignores further output after shutdown', async () => {
		store = makeStore()

		await store.start()

		const child = childFor('web')

		await store.shutdown()

		const before = get('web')?.logs.length ?? 0

		child?.out('late output\n')

		expect(get('web')?.logs.length).toBe(before)
	})
})

describe('metrics', () => {
	const realPlatform = process.platform

	beforeEach(() => {
		// Force the `ps`-based path so the poll reads our controllable fixture.
		Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

		hoisted.psOutput.current = ''
	})

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })

		hoisted.psOutput.current = ''
	})

	const psTree = (pid: number, time: string, rssKb: number): string =>
		['  PID  PPID    TIME    RSS', `${pid} 1 ${time} ${rssKb}`].join('\n')

	it('derives a bounded interval CPU from cumulative cputime deltas (no startup spike)', async () => {
		vi.useFakeTimers()

		store = makeStore({ metrics: true })

		await store.start()

		const pid = childFor('web')?.pid ?? 0

		hoisted.psOutput.current = psTree(pid, '0:10.00', 200_000)

		childFor('web')?.out('Watching for changes\n')

		await vi.advanceTimersByTimeAsync(1200)

		hoisted.psOutput.current = psTree(pid, '0:10.50', 200_000)

		childFor('web')?.out('Build start\n')

		await vi.advanceTimersByTimeAsync(1200)

		const metrics = get('web')?.metrics

		expect(metrics).toBeDefined()

		expect(metrics?.cpu).toBeGreaterThan(0)

		expect(metrics?.cpu).toBeLessThan(100)

		expect(metrics?.mem).toBe(200_000 * 1024)
	})

	it('clears stale metrics once a process is stopped', async () => {
		vi.useFakeTimers()

		store = makeStore({ metrics: true })

		await store.start()

		const pid = childFor('web')?.pid ?? 0

		hoisted.psOutput.current = psTree(pid, '0:01.00', 100_000)

		childFor('web')?.out('Watching for changes\n')

		await vi.advanceTimersByTimeAsync(1200)

		expect(get('web')?.metrics).toBeDefined()

		store.stopProcess('web')

		await vi.advanceTimersByTimeAsync(10)

		expect(get('web')?.status).toBe('stopped')

		expect(get('web')?.metrics).toBeUndefined()
	})
})
