import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTimers, createEntry, note, withEntry } from '../src/store/entry.js'
import type { StoreContext, WorkspaceEntry } from '../src/store/types.js'
import { createUnrefTimer } from '../src/store/utilities.js'
import type { Workspace } from '../src/types.js'

const WS: Workspace = { name: 'web', kind: 'app', deps: [] }

/** A StoreContext stub exposing only the entries map the helpers under test read. */
function ctxWith(...entries: [string, WorkspaceEntry][]): StoreContext {
	return { entries: new Map(entries) } as unknown as StoreContext
}

describe('createEntry', () => {
	it('starts pending with no child, timers, or logs', () => {
		const entry = createEntry(WS)

		expect(entry.process.status).toBe('pending')

		expect(entry.process.logs).toEqual([])

		expect(entry.child).toBeNull()

		expect(entry.restartTimer).toBeNull()

		expect(entry.errorTimer).toBeNull()

		expect(entry.startupTimer).toBeNull()

		expect(entry.pausedFrom).toBeNull()
	})
})

describe('note', () => {
	it('appends a hlidskjalf-prefixed line to the buffer', () => {
		const entry = createEntry(WS)

		note(entry, 'stopping (SIGTERM)...')

		expect(entry.process.logs).toEqual(['[hlidskjalf] stopping (SIGTERM)...'])
	})
})

describe('withEntry', () => {
	it('runs the callback against a tracked entry', () => {
		const entry = createEntry(WS)

		const ctx = ctxWith(['web', entry])

		const fn = vi.fn()

		withEntry(ctx, 'web', fn)

		expect(fn).toHaveBeenCalledWith(entry)
	})

	it('is a no-op for an unknown name', () => {
		const fn = vi.fn()

		withEntry(ctxWith(), 'ghost', fn)

		expect(fn).not.toHaveBeenCalled()
	})
})

describe('clearTimers', () => {
	afterEach(() => vi.useRealTimers())

	it('cancels every armed timer and nulls its handle', () => {
		vi.useFakeTimers()

		const restart = vi.fn()
		const error = vi.fn()
		const startup = vi.fn()

		const entry = createEntry(WS)

		entry.restartTimer = createUnrefTimer(1000, restart)
		entry.errorTimer = createUnrefTimer(1000, error)
		entry.startupTimer = createUnrefTimer(1000, startup)

		clearTimers(entry)

		expect(entry.restartTimer).toBeNull()

		expect(entry.errorTimer).toBeNull()

		expect(entry.startupTimer).toBeNull()

		vi.advanceTimersByTime(2000)

		expect(restart).not.toHaveBeenCalled()

		expect(error).not.toHaveBeenCalled()

		expect(startup).not.toHaveBeenCalled()
	})

	it('is safe when no timers are armed', () => {
		const entry = createEntry(WS)

		expect(() => clearTimers(entry)).not.toThrow()
	})
})
