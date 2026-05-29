import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHeartbeat, type Heartbeat, type Monitored } from '../src/liveness.js'
import type { Status } from '../src/types.js'

function entry(
	status: Status,
	opts: { url?: string; lastOutputAt?: number; lastGoodStatus?: Status | null } = {},
): Monitored {
	return {
		process: { status, url: opts.url },
		lastOutputAt: opts.lastOutputAt ?? 0,
		lastGoodStatus: opts.lastGoodStatus ?? null,
	}
}

/** A fetch that resolves (server reachable), draining the body like the real probe expects. */
const reachable = () => vi.fn(async () => ({ body: { cancel: async () => {} } }))

/** A fetch that rejects (server unreachable). */
const unreachable = () =>
	vi.fn(async () => {
		throw new Error('unreachable')
	})

let hb: Heartbeat | undefined

afterEach(() => {
	hb?.stop()

	hb = undefined

	vi.useRealTimers()

	vi.restoreAllMocks()

	vi.unstubAllGlobals()
})

function run(entries: Map<string, Monitored>): ReturnType<typeof vi.fn> {
	const setStatus = vi.fn()

	hb = createHeartbeat({ entries: () => entries, setStatus })

	return setStatus
}

describe('createHeartbeat', () => {
	it('restores a reachable idle process to its last good status', async () => {
		vi.useFakeTimers()

		vi.stubGlobal('fetch', reachable())

		const e = entry('idle', { url: 'http://localhost:3000', lastGoodStatus: 'watching' })

		const setStatus = run(new Map([['web', e]]))

		await vi.advanceTimersByTimeAsync(10_000)

		expect(setStatus).toHaveBeenCalledWith('web', 'watching')

		expect(e.lastOutputAt).toBeGreaterThan(0)
	})

	it('leaves an unreachable idle process idle', async () => {
		vi.useFakeTimers()

		vi.stubGlobal('fetch', unreachable())

		const e = entry('idle', { url: 'http://localhost:3000', lastGoodStatus: 'watching' })

		const setStatus = run(new Map([['web', e]]))

		await vi.advanceTimersByTimeAsync(10_000)

		expect(setStatus).not.toHaveBeenCalled()
	})

	it('marks a quiet ready process with no URL as idle', async () => {
		vi.useFakeTimers()

		vi.setSystemTime(1_000_000)

		const setStatus = run(new Map([['web', entry('ready', { lastOutputAt: 1 })]]))

		await vi.advanceTimersByTimeAsync(10_000)

		expect(setStatus).toHaveBeenCalledWith('web', 'idle')
	})

	it('keeps a quiet but reachable ready process and refreshes its activity', async () => {
		vi.useFakeTimers()

		vi.setSystemTime(1_000_000)

		vi.stubGlobal('fetch', reachable())

		const e = entry('ready', { url: 'http://localhost:3000', lastOutputAt: 1 })

		const setStatus = run(new Map([['web', e]]))

		await vi.advanceTimersByTimeAsync(10_000)

		expect(setStatus).not.toHaveBeenCalled()

		expect(e.lastOutputAt).toBe(1_010_000)
	})

	it('marks a quiet, unreachable ready process as idle', async () => {
		vi.useFakeTimers()

		vi.setSystemTime(1_000_000)

		vi.stubGlobal('fetch', unreachable())

		const setStatus = run(
			new Map([['web', entry('ready', { url: 'http://localhost:3000', lastOutputAt: 1 })]]),
		)

		await vi.advanceTimersByTimeAsync(10_000)

		expect(setStatus).toHaveBeenCalledWith('web', 'idle')
	})

	it('does not probe a freshly-active ready process', async () => {
		vi.useFakeTimers()

		vi.setSystemTime(1_000_000)

		const fetchMock = reachable()

		vi.stubGlobal('fetch', fetchMock)

		run(new Map([['web', entry('ready', { url: 'http://localhost:3000', lastOutputAt: 999_999 })]]))

		await vi.advanceTimersByTimeAsync(10_000)

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('stops sweeping after stop()', async () => {
		vi.useFakeTimers()

		vi.setSystemTime(1_000_000)

		const setStatus = run(new Map([['web', entry('ready', { lastOutputAt: 1 })]]))

		hb?.stop()

		await vi.advanceTimersByTimeAsync(30_000)

		expect(setStatus).not.toHaveBeenCalled()
	})
})
