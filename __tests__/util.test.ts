import { describe, expect, it } from 'vitest'

import { isPlainObject } from '../src/util.js'

describe('isPlainObject', () => {
	it('accepts plain objects', () => {
		expect(isPlainObject({})).toBe(true)
		expect(isPlainObject({ a: 1 })).toBe(true)
	})

	it('rejects null', () => {
		expect(isPlainObject(null)).toBe(false)
	})

	it('rejects arrays', () => {
		expect(isPlainObject([])).toBe(false)
		expect(isPlainObject([1, 2, 3])).toBe(false)
	})

	it('rejects primitives', () => {
		expect(isPlainObject('x')).toBe(false)
		expect(isPlainObject(42)).toBe(false)
		expect(isPlainObject(true)).toBe(false)
		expect(isPlainObject(undefined)).toBe(false)
	})
})
