import { describe, expect, it } from 'vitest'

import { colors, statusDisplay } from './theme.js'
import type { Status } from './types.js'

describe('colors', () => {
	it('exports all required color keys', () => {
		expect(colors).toHaveProperty('accent')
		expect(colors).toHaveProperty('success')
		expect(colors).toHaveProperty('warning')
		expect(colors).toHaveProperty('error')
		expect(colors).toHaveProperty('pending')
		expect(colors).toHaveProperty('muted')
		expect(colors).toHaveProperty('url')
	})

	it('all values are hex color strings', () => {
		for (const value of Object.values(colors)) {
			expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
		}
	})
})

describe('statusDisplay', () => {
	const allStatuses: Status[] = [
		'pending',
		'building',
		'watching',
		'ready',
		'error',
		'stopped',
		'idle',
		'timeout',
	]

	it('has an entry for every status', () => {
		for (const status of allStatuses) {
			expect(statusDisplay).toHaveProperty(status)
		}
	})

	it('each entry has color, label, and icon', () => {
		for (const status of allStatuses) {
			const entry = statusDisplay[status]

			expect(entry).toHaveProperty('color')
			expect(entry).toHaveProperty('label')
			expect(entry).toHaveProperty('icon')
			expect(typeof entry.color).toBe('string')
			expect(typeof entry.label).toBe('string')
			expect(typeof entry.icon).toBe('string')
		}
	})

	it('error statuses use error color', () => {
		expect(statusDisplay.error.color).toBe(colors.error)
		expect(statusDisplay.timeout.color).toBe(colors.error)
	})

	it('success statuses use success color', () => {
		expect(statusDisplay.watching.color).toBe(colors.success)
		expect(statusDisplay.ready.color).toBe(colors.success)
	})
})
