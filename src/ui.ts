/**
 * Shared presentation layer: the colour palette and status glyphs, the terminal
 * primitives the dashboard leans on (OSC 8 hyperlinks, alternate screen), value
 * formatters, and the timer helpers used across the polling code. Kept free of
 * Ink/React imports so every helper here can be unit tested directly.
 */

import type { Metrics, Status } from './types.js'

/** The slots every theme must fill. Consumers read these by name at render time. */
export interface ColorPalette {
	// Brand
	accent: string
	accentBright: string
	// Status
	success: string
	warning: string
	error: string
	pending: string
	// Selection
	highlight: string
	highlightDim: string
	// Text
	muted: string
	dim: string
	separator: string
	// Misc
	url: string
}

/**
 * Built-in palettes, named for the realms of Norse cosmology (fitting for a tool named
 * after Odin's all-seeing high seat). `success`/`warning`/`error` stay semantically
 * legible — green-ish / amber-ish / red-ish — in every theme so a status glyph never
 * misreads; the personality lives in the accent, highlight, and text greys.
 */
export const themes = {
	// The shimmering rainbow bridge — the original indigo + teal palette, the default.
	bifrost: {
		accent: '#7C8EF2',
		accentBright: '#A3B1FF',
		success: '#50E3A4',
		warning: '#F5C542',
		error: '#F2716B',
		pending: '#6B7280',
		highlight: '#5EEAD4',
		highlightDim: '#2DD4BF',
		muted: '#6B7280',
		dim: '#4B5563',
		separator: '#374151',
		url: '#93C5FD',
	},
	// Primordial realm of frost and mist — glacial blues, frost-white highlights.
	niflheim: {
		accent: '#7DD3FC',
		accentBright: '#BAE6FD',
		success: '#5EEAD4',
		warning: '#FCD34D',
		error: '#FB7185',
		pending: '#64748B',
		highlight: '#E0F2FE',
		highlightDim: '#7DD3FC',
		muted: '#64748B',
		dim: '#475569',
		separator: '#334155',
		url: '#93C5FD',
	},
	// Realm of fire — molten oranges and ember golds, a lime success to pop against the warmth.
	muspelheim: {
		accent: '#FB923C',
		accentBright: '#FDBA74',
		success: '#A3E635',
		warning: '#FBBF24',
		error: '#EF4444',
		pending: '#78716C',
		highlight: '#FCD34D',
		highlightDim: '#F59E0B',
		muted: '#78716C',
		dim: '#57534E',
		separator: '#44403C',
		url: '#FCA5A5',
	},
	// The world tree — mosses, leaf-greens, bark greys.
	yggdrasil: {
		accent: '#4ADE80',
		accentBright: '#86EFAC',
		success: '#34D399',
		warning: '#FACC15',
		error: '#F87171',
		pending: '#6B7280',
		highlight: '#BEF264',
		highlightDim: '#84CC16',
		muted: '#78716C',
		dim: '#57534E',
		separator: '#3F3F46',
		url: '#A7F3D0',
	},
	// The shadowed underworld — muted, low-contrast greys for low-light terminals,
	// with a faint pulse of life in the success colour.
	helheim: {
		accent: '#9CA3AF',
		accentBright: '#D1D5DB',
		success: '#6EE7B7',
		warning: '#D6B36A',
		error: '#E06C75',
		pending: '#4B5563',
		highlight: '#E5E7EB',
		highlightDim: '#9CA3AF',
		muted: '#6B7280',
		dim: '#4B5563',
		separator: '#374151',
		url: '#9CA3AF',
	},
	// Norðurljós, the northern lights — a violet-to-teal shimmer.
	aurora: {
		accent: '#C084FC',
		accentBright: '#E9D5FF',
		success: '#34D399',
		warning: '#FDE047',
		error: '#FB7185',
		pending: '#6B7280',
		highlight: '#5EEAD4',
		highlightDim: '#2DD4BF',
		muted: '#71717A',
		dim: '#52525B',
		separator: '#3F3F46',
		url: '#A5B4FC',
	},
} as const satisfies Record<string, ColorPalette>

/** Selectable theme names — the keys of {@link themes}. */
export type ThemeName = keyof typeof themes

/** The palette used when none is configured. */
export const DEFAULT_THEME: ThemeName = 'bifrost'

/** Narrow an untrusted value to a known theme name, or `undefined` if it isn't one. */
export function parseTheme(value: unknown): ThemeName | undefined {
	return typeof value === 'string' && value in themes ? (value as ThemeName) : undefined
}

/**
 * The active palette. A live binding: importers see whatever {@link setTheme} last set.
 * The dashboard picks a theme once at boot (before the first render), so render-time
 * reads of `colors.*` always resolve to the chosen palette.
 */
export let colors: ColorPalette = themes[DEFAULT_THEME]

/** Build the status → glyph map against a given palette. */
function buildStatusDisplay(
	c: ColorPalette,
): Record<Status, { color: string; label: string; icon: string }> {
	return {
		pending: { color: c.pending, label: 'pending', icon: '○' },
		building: { color: c.warning, label: 'building', icon: '◑' },
		watching: { color: c.success, label: 'watching', icon: '●' },
		ready: { color: c.success, label: 'watching', icon: '●' },
		error: { color: c.error, label: 'error', icon: '✖' },
		stopped: { color: c.pending, label: 'stopped', icon: '○' },
		idle: { color: c.warning, label: 'idle', icon: '◑' },
		timeout: { color: c.error, label: 'timeout', icon: '✖' },
	}
}

/** Status → colour/label/glyph for the active palette. Rebuilt by {@link setTheme}. */
export let statusDisplay = buildStatusDisplay(colors)

/** Switch the active palette. Call once at startup before rendering. */
export function setTheme(name: ThemeName): void {
	colors = themes[name]
	statusDisplay = buildStatusDisplay(colors)
}

/** Footer/header hint string shared by every screen. */
export const HINTS = '↑/↓ navigate | ? help | q quit'

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

	if (width === 1) return '...'

	return `${text.slice(0, width - 1)}...`
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
