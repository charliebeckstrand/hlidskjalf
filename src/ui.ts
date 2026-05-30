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
	// Text
	muted: string
	dim: string
	separator: string
	// Misc
	url: string
}

type SharedColors = Pick<
	ColorPalette,
	'success' | 'warning' | 'error' | 'pending' | 'highlight' | 'muted' | 'dim' | 'separator'
>

/**
 * Neutral slots shared verbatim by every theme — the greys, the frost-white highlight,
 * and the pending/url tones. Kept as one source of truth and spread into each palette so
 * they can't drift apart; per-theme personality lives in the accent/status colours below.
 */
const SHARED: SharedColors = {
	success: '#15FA5A',
	warning: '#FACC15',
	error: '#F87171',
	pending: '#8D93A0',
	highlight: '#faf9f6',
	muted: '#8D93A0',
	dim: '#6B7280',
	separator: '#353940',
}

/**
 * Built-in palettes, named for the realms of Norse cosmology (fitting for a tool named
 * after Odin's all-seeing high seat). `success`/`warning`/`error` stay semantically
 * legible — green-ish / amber-ish / red-ish — in every theme so a status glyph never
 * misreads; the personality lives in the accent and status colours, with the neutral
 * slots pulled from {@link SHARED}.
 */
export const themes = {
	// Default — electric purples, sky blues, and starlight whites.
	bifrost: {
		accent: '#7C8EF2',
		accentBright: '#BEC7F9',
		url: '#E8EBFD',
		...SHARED,
	},
	// Frost and mist — icy cyans, frost-white highlights.
	niflheim: {
		accent: '#22D3EE',
		accentBright: '#92E9F7',
		url: '#E7FAFD',
		...SHARED,
	},
	// Fire — molten oranges, ember golds, lime success.
	muspelheim: {
		accent: '#F97316',
		accentBright: '#FCBB8D',
		url: '#FEF0E6',
		...SHARED,
	},
	// World tree — mosses, leaf-greens, bark greys.
	yggdrasil: {
		accent: '#22C55E',
		accentBright: '#73E79E',
		url: '#E9FBF0',
		...SHARED,
	},
} as const satisfies Record<string, ColorPalette>

/** Selectable theme names — the keys of {@link themes}. */
export type ThemeName = keyof typeof themes

/**
 * Friendly elemental aliases for the Norse realm names, so `--theme=ice` resolves to
 * `niflheim` (and `fire`→`muspelheim`, `earth`→`yggdrasil`). Accepted anywhere a theme
 * name is — both the CLI flag and the persisted config flow through {@link parseTheme}.
 */
export const THEME_ALIASES = {
	ice: 'niflheim',
	fire: 'muspelheim',
	earth: 'yggdrasil',
} as const satisfies Record<string, ThemeName>

/** The palette used when none is configured. */
export const DEFAULT_THEME: ThemeName = 'bifrost'

/**
 * Narrow an untrusted value to a known theme name, resolving an elemental alias
 * ({@link THEME_ALIASES}) to its canonical realm, or `undefined` if it's neither.
 */
export function parseTheme(value: unknown): ThemeName | undefined {
	if (typeof value !== 'string') return undefined

	if (value in themes) return value as ThemeName

	return value in THEME_ALIASES ? THEME_ALIASES[value as keyof typeof THEME_ALIASES] : undefined
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
		paused: { color: c.warning, label: 'paused', icon: '⏸' },
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
