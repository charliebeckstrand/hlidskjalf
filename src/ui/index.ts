/**
 * Shared presentation layer: colour palette and status glyphs ({@link ./theme.ts}),
 * terminal primitives — OSC 8 hyperlinks, alternate screen ({@link ./terminal.ts}) —
 * value formatters ({@link ./format.ts}), the shared hint string ({@link ./hints.ts}), and
 * the polling timer helpers ({@link ./timers.ts}). No Ink/React imports, so every helper
 * is unit-testable.
 */

export { cpuColor, formatCpu, formatMem, memColor } from './format.js'
export { HINTS } from './hints.js'
export { enterAltScreen, hyperlink, truncateEnd } from './terminal.js'
export {
	type ColorPalette,
	colors,
	DEFAULT_THEME,
	parseTheme,
	setTheme,
	statusDisplay,
	THEME_ALIASES,
	type ThemeName,
	themes,
} from './theme.js'
export { every } from './timers.js'
