/**
 * Shared presentation layer: the colour palette and status glyphs, the terminal
 * primitives the dashboard leans on (OSC 8 hyperlinks, alternate screen), value
 * formatters, and the timer helpers used across the polling code. Kept free of
 * Ink/React imports so every helper here can be unit tested directly.
 */

import type { Metrics, Status } from './types.js'

export const colors = {
	// Brand
	accent: '#7C8EF2',
	accentBright: '#A3B1FF',
	// Status
	success: '#50E3A4',
	warning: '#F5C542',
	error: '#F2716B',
	pending: '#6B7280',
	// Selection
	highlight: '#5EEAD4',
	highlightDim: '#2DD4BF',
	// Text
	muted: '#6B7280',
	dim: '#4B5563',
	separator: '#374151',
	// Misc
	url: '#93C5FD',
}

export const statusDisplay = {
	pending: { color: colors.pending, label: 'pending', icon: '○' },
	building: { color: colors.warning, label: 'building', icon: '◑' },
	watching: { color: colors.success, label: 'watching', icon: '●' },
	ready: { color: colors.success, label: 'watching', icon: '●' },
	error: { color: colors.error, label: 'error', icon: '✖' },
	stopped: { color: colors.pending, label: 'stopped', icon: '○' },
	idle: { color: colors.warning, label: 'idle', icon: '◑' },
	timeout: { color: colors.error, label: 'timeout', icon: '✖' },
} as const satisfies Record<Status, { color: string; label: string; icon: string }>

/** Footer/header hint string shared by every screen. */
export const HINTS = '? help   q quit'

// --- Value formatters (dashboard metric cells) ---------------------------------

/** Right-align a CPU percentage in a fixed six-column field. */
export function formatCpu(cpu: number): string {
	return `${cpu.toFixed(1)}%`.padStart(6)
}

/** Format a byte count as a right-aligned K/M/G value in a seven-column field. */
export function formatMem(bytes: number): string {
	let s: string
	if (bytes < 1024 * 1024) s = `${(bytes / 1024).toFixed(0)} K`
	else if (bytes < 1024 * 1024 * 1024) s = `${(bytes / (1024 * 1024)).toFixed(1)} M`
	else s = `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`
	return s.padStart(7)
}

/** Colour for a memory cell, escalating warning→error past 256M/512M. */
export function memColor(bytes: number): string {
	if (bytes > 512 * 1024 * 1024) return colors.error
	if (bytes > 256 * 1024 * 1024) return colors.warning
	return colors.muted
}

/** Colour for a CPU cell, flipping to error once a workspace saturates a core. */
export function cpuColor(metrics: Metrics): string {
	return metrics.cpu > 80 ? colors.error : colors.muted
}

// --- Terminal hyperlinks -------------------------------------------------------

const ESC = String.fromCharCode(27)
/** OSC 8 hyperlink introducer (no params): ESC ] 8 ; ; */
const OSC8 = `${ESC}]8;;`
/**
 * OSC terminator. The spec allows BEL or ST, but Ink's renderer
 * (`@alcalzone/ansi-tokenize`) only recognises the BEL form — feeding it ST makes
 * the tokenizer miss the terminator, drop the label on narrow columns, and strand
 * a BEL that rings the bell on every re-render. So we terminate with BEL.
 */
const BEL = String.fromCharCode(7)

/**
 * Wrap `label` in an OSC 8 hyperlink pointing at `url`. The clickable target is
 * always the full `url` while only `label` is rendered, so a truncated label still
 * opens the complete address. Terminals without OSC 8 show `label` as plain text.
 */
export function hyperlink(url: string, label: string = url): string {
	return `${OSC8}${url}${BEL}${label}${OSC8}${BEL}`
}

/**
 * Truncate `text` to at most `width` display columns with a single-column ellipsis
 * when shortened. Used to pre-fit a hyperlink label so Ink never truncates it
 * itself (its truncator isn't OSC 8 aware). URLs are ASCII, so chars map 1:1 to columns.
 */
export function truncateEnd(text: string, width: number): string {
	if (width <= 0) return ''
	if (text.length <= width) return text
	if (width === 1) return '…'
	return `${text.slice(0, width - 1)}…`
}

// --- Alternate screen ----------------------------------------------------------

/** DECSET/DECRST 1049: switch to / restore the alternate screen buffer. */
const ENTER_ALT_SCREEN = '\x1b[?1049h'
const EXIT_ALT_SCREEN = '\x1b[?1049l'

/**
 * Switch `stream` to the alternate screen (the buffer vim/htop use, so frames never
 * land in scrollback) and return an idempotent restore function. A `process.exit`
 * listener guarantees the primary screen returns even on an abrupt exit. No-op on a
 * non-TTY stream (piped output, tests).
 */
export function enterAltScreen(stream: NodeJS.WriteStream = process.stdout): () => void {
	if (!stream.isTTY) return () => {}
	stream.write(ENTER_ALT_SCREEN)
	let restored = false
	const restore = () => {
		if (restored) return
		restored = true
		stream.write(EXIT_ALT_SCREEN)
	}
	process.once('exit', restore)
	return restore
}

// --- Timers --------------------------------------------------------------------

/**
 * Start an unref'd interval and return a canceller. Unref'd so a pending tick never
 * keeps the process alive past shutdown; the canceller is idempotent.
 */
export function every(ms: number, fn: () => void): () => void {
	const t = setInterval(fn, ms)
	t.unref()
	return () => clearInterval(t)
}

/** Schedule an unref'd timeout and return a canceller. */
export function after(ms: number, fn: () => void): () => void {
	const t = setTimeout(fn, ms)
	t.unref()
	return () => clearTimeout(t)
}
