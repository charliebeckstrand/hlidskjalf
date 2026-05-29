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

/**
 * Fixed column widths shared by the dashboard's table header and every row, so
 * the two stay in lockstep and the layout maths below derive from the same
 * source rather than re-encoding the numbers. The name column is variable (see
 * `nameColumnWidth`/`fitNameColumnWidth`) and the URL column claims whatever is
 * left.
 */
export const COLUMN_WIDTHS = {
	/** Selection indicator (`▸`) plus its trailing space. */
	indicator: 2,
	kind: 6,
	status: 14,
	cpu: 8,
	mem: 9,
} as const

/** Horizontal padding applied to each row's outer Box (`paddingX`), per side. */
const ROW_PADDING_X = 1

/**
 * Fixed horizontal space a row spends on everything except the name and URL
 * columns: the row padding (both sides), the selection indicator, and the
 * kind/status columns.
 */
const ROW_CHROME_WIDTH =
	ROW_PADDING_X * 2 + COLUMN_WIDTHS.indicator + COLUMN_WIDTHS.kind + COLUMN_WIDTHS.status

/** Combined width of the optional CPU and MEM metric columns. */
const METRICS_WIDTH = COLUMN_WIDTHS.cpu + COLUMN_WIDTHS.mem

/**
 * Clamp the natural name-column width to the space left for the always-visible
 * columns (the fixed chrome plus the optional metric columns), so a long
 * workspace name on a narrow terminal can't push the kind/status columns
 * off-screen. On a roomy terminal the natural width is returned untouched; when
 * it has to shrink, a sliver is always kept so the name box stays valid and its
 * text truncates with an ellipsis. The URL column then absorbs whatever, if
 * anything, remains.
 */
export function fitNameColumnWidth(
	naturalWidth: number,
	columns: number,
	metrics: boolean,
): number {
	const available = columns - ROW_CHROME_WIDTH - (metrics ? METRICS_WIDTH : 0)

	return Math.max(1, Math.min(naturalWidth, available))
}

/**
 * Width left for the URL column after the fixed chrome, the name column, and the
 * optional metric columns. May come out non-positive on a narrow terminal, in
 * which case the caller hides the URL rather than rendering a zero/negative box.
 */
export function urlColumnWidth(columns: number, nameWidth: number, metrics: boolean): number {
	return columns - nameWidth - ROW_CHROME_WIDTH - (metrics ? METRICS_WIDTH : 0)
}

/**
 * Height of the scrollback area inside the log panel: the rows left after the
 * header, table header, one row per process, and the panel's own border/labels,
 * floored at 3 so the panel never collapses on a short terminal.
 */
export function logPanelHeight(rows: number, processCount: number): number {
	return Math.max(3, rows - processCount - 11)
}
