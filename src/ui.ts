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
	// The rainbow bridge — a cool steel-cyan ramp from frost-white down to a near-black slate.
	bifrost: {
		accent: '#9DB4C0',
		accentBright: '#C2DFE3',
		success: '#9DB4C0',
		warning: '#C2DFE3',
		error: '#E0FBFC',
		pending: '#5C6B73',
		highlight: '#E0FBFC',
		highlightDim: '#C2DFE3',
		muted: '#9DB4C0',
		dim: '#5C6B73',
		separator: '#253237',
		url: '#C2DFE3',
	},
	// Primordial realm of frost and mist — glacial blues from alabaster down to deep space.
	niflheim: {
		accent: '#007EA7',
		accentBright: '#80CED7',
		success: '#9AD1D4',
		warning: '#80CED7',
		error: '#CCDBDC',
		pending: '#007EA7',
		highlight: '#CCDBDC',
		highlightDim: '#9AD1D4',
		muted: '#007EA7',
		dim: '#003249',
		separator: '#003249',
		url: '#80CED7',
	},
	// Realm of fire — a molten ramp from ink-black through oxblood to a bright amber flame.
	muspelheim: {
		accent: '#DC2F02',
		accentBright: '#E85D04',
		success: '#FAA307',
		warning: '#FFBA08',
		error: '#D00000',
		pending: '#9D0208',
		highlight: '#F48C06',
		highlightDim: '#E85D04',
		muted: '#6A040F',
		dim: '#370617',
		separator: '#03071E',
		url: '#F48C06',
	},
	// The world tree — a verdant ramp from deep jungle-teal up through ferns to lemon-lime.
	yggdrasil: {
		accent: '#80B918',
		accentBright: '#AACC00',
		success: '#55A630',
		warning: '#D4D700',
		error: '#FFFF3F',
		pending: '#2B9348',
		highlight: '#DDDF00',
		highlightDim: '#BFD200',
		muted: '#55A630',
		dim: '#2B9348',
		separator: '#007F5F',
		url: '#EEEF20',
	},
	// The shadowed underworld — a clean greyscale from bright snow down to carbon black.
	helheim: {
		accent: '#ADB5BD',
		accentBright: '#DEE2E6',
		success: '#CED4DA',
		warning: '#ADB5BD',
		error: '#F8F9FA',
		pending: '#6C757D',
		highlight: '#E9ECEF',
		highlightDim: '#CED4DA',
		muted: '#6C757D',
		dim: '#495057',
		separator: '#343A40',
		url: '#ADB5BD',
	},
	// Norðurljós, the northern lights — a shimmer from royal violet through sky-blue to aquamarine.
	aurora: {
		accent: '#5390D9',
		accentBright: '#64DFDF',
		success: '#72EFDD',
		warning: '#56CFE1',
		error: '#6930C3',
		pending: '#5E60CE',
		highlight: '#80FFDB',
		highlightDim: '#72EFDD',
		muted: '#4EA8DE',
		dim: '#7400B8',
		separator: '#7400B8',
		url: '#48BFE3',
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
