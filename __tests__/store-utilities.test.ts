import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUnrefTimer } from '../src/store/utilities.js'

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
