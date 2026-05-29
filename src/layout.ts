/**
 * Pure layout maths for the dashboard. Kept out of the .tsx so it can be tested and
 * benchmarked without rendering Ink. Recomputed whenever the process list changes.
 */

import type { Process } from './types.js'

/**
 * Smallest the name column may shrink to when the URL column takes priority, so a
 * name stays partly legible on a tight terminal. Doubles as the natural-width floor.
 */
const MIN_NAME_WIDTH = 14

/**
 * Width of the workspace-name column: the longest name plus padding, floored at
 * `min`. A plain loop rather than `Math.max(min, ...names)` so it neither allocates
 * an intermediate array per render nor risks a RangeError from spreading a huge list.
 */
export function nameColumnWidth(processes: Process[], min = MIN_NAME_WIDTH): number {
	let width = min
	for (const proc of processes) {
		const candidate = proc.workspace.name.length + 2
		if (candidate > width) width = candidate
	}
	return width
}

/**
 * Width the URL column wants to show every URL in full: the longest URL's length, or
 * 0 when no process has one. URLs are ASCII, so character count maps 1:1 to columns.
 */
export function urlContentWidth(processes: Process[]): number {
	let width = 0
	for (const proc of processes) {
		const length = proc.url?.length ?? 0
		if (length > width) width = length
	}
	return width
}

/**
 * Fixed column widths shared by the table header and every row, so the two stay in
 * lockstep and the maths below derive from one source. Name and URL are variable;
 * `columnWidths` splits the remaining space between them.
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

/** Fixed horizontal space a row spends on everything except name and URL. */
const ROW_CHROME_WIDTH =
	ROW_PADDING_X * 2 + COLUMN_WIDTHS.indicator + COLUMN_WIDTHS.kind + COLUMN_WIDTHS.status

/** Combined width of the optional CPU and MEM metric columns. */
const METRICS_WIDTH = COLUMN_WIDTHS.cpu + COLUMN_WIDTHS.mem

export interface ColumnWidths {
	/** Width of the workspace-name column. */
	name: number
	/** Width of the URL column; 0 when there's no room (the caller then hides it). */
	url: number
}

/**
 * Split the flexible space left after the fixed chrome (and optional metric columns)
 * between name and URL, giving the URL priority: its full content width is reserved
 * first so a ready URL shows in full, and the name takes what remains up to its
 * natural width — so a long name truncates before it can squeeze the URL off-screen.
 * A readable name floor is always kept, so when even that doesn't fit it's the URL
 * that shrinks (and is hidden once nothing is left for it).
 */
export function columnWidths(
	columns: number,
	naturalNameWidth: number,
	urlContent: number,
	metrics: boolean,
): ColumnWidths {
	const available = columns - ROW_CHROME_WIDTH - (metrics ? METRICS_WIDTH : 0)
	if (available <= 1) return { name: Math.max(1, available), url: 0 }
	// Reserve the URL's full width, but never push the name below its floor.
	const url = Math.max(0, Math.min(urlContent, available - MIN_NAME_WIDTH))
	// The name takes the rest, capped at its natural width and floored at one column.
	const name = Math.max(1, Math.min(naturalNameWidth, available - url))
	return { name, url }
}

/**
 * Smallest log scrollback worth drawing: fewer rows than this is all border and
 * label, so the dashboard hides it rather than render a useless box.
 */
export const MIN_LOG_PANEL_HEIGHT = 3

/**
 * Fixed rows the dashboard spends on everything except log lines: the header (4),
 * the table header (2), the panel's own margin/border/label (5), and one row of
 * slack so the assembled frame stays a line clear of the bottom and can't scroll the
 * header off the top.
 */
const NON_LOG_CHROME = 12

/**
 * Height of the scrollback area inside the log panel: rows left after the fixed
 * chrome and one row per process. This is the panel's hard maximum, so a flood of
 * output never pushes the header off-screen. Comes out small (down to 0) on a short
 * terminal, where the caller hides the panel below `MIN_LOG_PANEL_HEIGHT`.
 */
export function logPanelHeight(rows: number, processCount: number): number {
	return Math.max(0, rows - processCount - NON_LOG_CHROME)
}
