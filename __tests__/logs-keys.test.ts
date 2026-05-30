import { describe, expect, it } from 'vitest'
import { logRowKeys } from '../src/logs/index.js'

describe('logRowKeys', () => {
	it('keys visible rows on their absolute index from the buffer start', () => {
		const { rows } = logRowKeys(['a', 'b', 'c'], 10, 3)

		expect(rows).toEqual([
			{ id: 10, line: 'a' },
			{ id: 11, line: 'b' },
			{ id: 12, line: 'c' },
		])
	})

	it('continues fill keys past the last visible line, never colliding with a row', () => {
		const { rows, fills } = logRowKeys(['a', 'b'], 5, 5)

		expect(rows.map((r) => r.id)).toEqual([5, 6])

		// height 5, two real lines → three blanks, keyed above the last row id.
		expect(fills).toEqual([7, 8, 9])
	})

	it('keeps a line key stable as the tail grows and the window scrolls', () => {
		// One line appended while following the tail: the window slides by one, so the same
		// line lands at an earlier position but keeps its absolute id.
		const before = logRowKeys(['a', 'b', 'c'], 10, 3)

		const after = logRowKeys(['b', 'c', 'd'], 11, 3)

		const idOf = (rows: { id: number; line: string }[], line: string) =>
			rows.find((r) => r.line === line)?.id

		expect(idOf(before.rows, 'b')).toBe(idOf(after.rows, 'b'))

		expect(idOf(before.rows, 'c')).toBe(idOf(after.rows, 'c'))
	})

	it('emits only fills for an empty window', () => {
		const { rows, fills } = logRowKeys([], 0, 3)

		expect(rows).toEqual([])

		expect(fills).toEqual([0, 1, 2])
	})

	it('produces no fills when the window is already full', () => {
		const { fills } = logRowKeys(['a', 'b', 'c'], 0, 3)

		expect(fills).toEqual([])
	})

	it('clamps a negative fill count to zero', () => {
		const { fills } = logRowKeys(['a', 'b', 'c', 'd'], 0, 2)

		expect(fills).toEqual([])
	})
})
