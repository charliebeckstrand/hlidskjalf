import { describe, expect, it } from 'vitest'

import { nameColumnWidth } from '../src/layout.js'
import type { Process } from '../src/types.js'

function proc(name: string): Process {
	return { workspace: { name, kind: 'package', deps: [] }, status: 'ready', logs: [] }
}

describe('nameColumnWidth', () => {
	it('returns the minimum when no process name exceeds it', () => {
		expect(nameColumnWidth([proc('a'), proc('web')])).toBe(14)
	})

	it('returns the floor for an empty list', () => {
		expect(nameColumnWidth([])).toBe(14)
	})

	it('uses the longest name plus padding when it exceeds the minimum', () => {
		const longest = 'a-really-long-workspace-name'

		expect(nameColumnWidth([proc('short'), proc(longest)])).toBe(longest.length + 2)
	})

	it('honours a custom minimum', () => {
		expect(nameColumnWidth([proc('x')], 20)).toBe(20)
	})

	it('does not throw on a very large list (no argument spread)', () => {
		const many = Array.from({ length: 200_000 }, (_, i) => proc(`pkg-${i}`))

		expect(() => nameColumnWidth(many)).not.toThrow()
	})
})
