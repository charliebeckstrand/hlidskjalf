/**
 * The colour palette and status glyphs. Kept free of Ink/React imports so every helper
 * here can be unit tested directly.
 */

import type { Status } from '../types.js'

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
