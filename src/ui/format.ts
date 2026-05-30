import type { Metrics } from '../types.js'
import { colors } from './theme.js'

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
