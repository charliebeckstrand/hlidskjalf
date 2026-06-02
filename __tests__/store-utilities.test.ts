import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTimer, createUnrefTimer } from '../src/store/utilities.js'

describe('createUnrefTimer', () => {
	afterEach(() => vi.useRealTimers())

	it('fires once after the delay', () => {
		vi.useFakeTimers()

		const fn = vi.fn()

		createUnrefTimer(1000, fn)

		vi.advanceTimersByTime(999)

		expect(fn).not.toHaveBeenCalled()

		vi.advanceTimersByTime(1)

		expect(fn).toHaveBeenCalledTimes(1)
	})

	it('returns a handle the caller can clear before it fires', () => {
		vi.useFakeTimers()

		const fn = vi.fn()

		clearTimeout(createUnrefTimer(1000, fn))

		vi.advanceTimersByTime(2000)

		expect(fn).not.toHaveBeenCalled()
	})
})

describe('clearTimer', () => {
	afterEach(() => vi.useRealTimers())

	it('cancels a pending timer and returns null', () => {
		vi.useFakeTimers()

		const fn = vi.fn()

		const handle = clearTimer(createUnrefTimer(1000, fn))

		expect(handle).toBeNull()

		vi.advanceTimersByTime(2000)

		expect(fn).not.toHaveBeenCalled()
	})

	it('is a no-op on a null handle', () => {
		expect(clearTimer(null)).toBeNull()
	})
})
