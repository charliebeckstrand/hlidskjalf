import { afterEach, describe, expect, it, vi } from 'vitest'
import { clamp, clampIndex, createUnrefTimer, truncate } from '../src/util.js'

describe('clamp', () => {
	it('returns the value when already inside the range', () => {
		expect(clamp(5, 0, 10)).toBe(5)
	})

	it('saturates to the bounds outside the range', () => {
		expect(clamp(-3, 0, 10)).toBe(0)
		expect(clamp(42, 0, 10)).toBe(10)
	})

	it('returns the shared bound when min equals max', () => {
		expect(clamp(7, 3, 3)).toBe(3)
	})
})

describe('clampIndex', () => {
	it('passes through an in-range index', () => {
		expect(clampIndex(2, 5)).toBe(2)
	})

	it('caps at the last valid index', () => {
		expect(clampIndex(9, 5)).toBe(4)
	})

	it('yields 0 for an empty list rather than -1', () => {
		expect(clampIndex(0, 0)).toBe(0)
		expect(clampIndex(3, 0)).toBe(0)
	})
})

describe('truncate', () => {
	it('leaves a string within the cap untouched', () => {
		expect(truncate('hello', 10)).toBe('hello')
		expect(truncate('hello', 5)).toBe('hello')
	})

	it('hard-caps an over-long string with no ellipsis', () => {
		expect(truncate('hello world', 5)).toBe('hello')
	})
})

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
