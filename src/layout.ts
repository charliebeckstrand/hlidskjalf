/**
 * Pure layout maths for the dashboard. Kept out of the .tsx so it can be tested
 * and benchmarked without rendering Ink. Recomputed whenever the process list
 * changes, i.e. up to once per render frame.
 */

import type { Process } from './types.js'

/**
 * Width of the workspace-name column: the longest name plus padding, floored at
 * `min`. A plain loop rather than `Math.max(min, ...names)` so it neither
 * allocates an intermediate array per render nor risks a RangeError from
 * spreading a huge list as call arguments.
 */
export function nameColumnWidth(processes: Process[], min = 14): number {
	let width = min

	for (const proc of processes) {
		const candidate = proc.workspace.name.length + 2

		if (candidate > width) width = candidate
	}

	return width
}
