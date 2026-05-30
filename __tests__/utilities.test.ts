import { describe, expect, it } from 'vitest'
import { clamp, clampIndex, isPlainObject, truncate } from '../src/utilities.js'

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

describe('isPlainObject', () => {
	it('accepts plain objects', () => {
		expect(isPlainObject({})).toBe(true)

		expect(isPlainObject({ a: 1 })).toBe(true)
	})

	it('rejects null, arrays, and primitives', () => {
		expect(isPlainObject(null)).toBe(false)

		expect(isPlainObject([1, 2])).toBe(false)

		expect(isPlainObject('s')).toBe(false)

		expect(isPlainObject(42)).toBe(false)

		expect(isPlainObject(undefined)).toBe(false)
	})
})
