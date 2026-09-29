import { colors } from './theme.js'

/**
 * Right-align a CPU percentage (of one core) in a fixed six-column field. Readings past one
 * core drop the decimal so a multi-core figure like `1250%` still fits.
 */
export function formatCpu(cpu: number): string {
	return `${cpu.toFixed(cpu >= 100 ? 0 : 1)}%`.padStart(6)
}

/** Format a byte count as a right-aligned K/M/G value in a seven-column field. */
export function formatMem(bytes: number): string {
	let formatted: string

	if (bytes < 1024 * 1024) formatted = `${(bytes / 1024).toFixed(0)} K`
	else if (bytes < 1024 * 1024 * 1024) formatted = `${(bytes / (1024 * 1024)).toFixed(1)} M`
	else formatted = `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`

	return formatted.padStart(7)
}

/** Colour for a memory cell, escalating warning→error past 256M/512M. */
export function memColor(bytes: number): string {
	if (bytes > 512 * 1024 * 1024) return colors.error

	if (bytes > 256 * 1024 * 1024) return colors.warning

	return colors.muted
}

/** Colour for a CPU cell, flipping to error once a workspace nears a full core. */
export function cpuColor(cpu: number): string {
	return cpu > 80 ? colors.error : colors.muted
}
