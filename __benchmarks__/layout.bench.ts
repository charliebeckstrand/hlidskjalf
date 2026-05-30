import { Bench } from 'tinybench'

import { nameColumnWidth } from '../src/layout.js'
import type { Process } from '../src/types.js'
import { makeProcesses } from './fixtures.js'

/**
 * The dashboard recomputes the name-column width whenever the process list changes — up to
 * once per render frame. The previous spread form (`Math.max(min, ...processes.map(...))`)
 * allocated an intermediate array and spread it as call arguments; `spreadWidth` reproduces
 * it as a baseline so the loop's per-render savings — and its freedom from the spread's
 * RangeError ceiling — show in the same run.
 */
function spreadWidth(processes: Process[], min = 14): number {
	return Math.max(min, ...processes.map((p) => p.workspace.name.length + 2))
}

export function layoutSuite(): Bench {
	const bench = new Bench({ name: 'layout — dashboard column widths', time: 500 })

	const small = makeProcesses(20)

	const large = makeProcesses(200)

	bench
		.add('nameColumnWidth: loop, 200 processes', () => {
			nameColumnWidth(large)
		})
		.add('spread baseline: 200 processes', () => {
			spreadWidth(large)
		})
		.add('nameColumnWidth: loop, 20 processes', () => {
			nameColumnWidth(small)
		})

	return bench
}
