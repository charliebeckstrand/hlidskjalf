/**
 * Shared presentation layer: the colour palette and status glyphs ({@link ./theme.ts}),
 * the terminal primitives the dashboard leans on — OSC 8 hyperlinks, alternate screen
 * ({@link ./terminal.ts}) — value formatters ({@link ./format.ts}), the shared hint
 * string ({@link ./hints.ts}), and the timer helpers used across the polling code
 * ({@link ./timers.ts}). Kept free of Ink/React imports so every helper can be unit
 * tested directly.
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
export { after, every } from './timers.js'
