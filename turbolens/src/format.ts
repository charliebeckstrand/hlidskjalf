const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	let value = bytes
	let unitIndex = 0
	while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024
		unitIndex++
	}
	return unitIndex === 0 ? `${value} B` : `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`
}

const TIME_UNITS = [
	[60, 'second'],
	[60, 'minute'],
	[24, 'hour'],
	[365, 'day'],
] as const

export function formatAge(date: Date): string {
	let diff = Math.floor((Date.now() - date.getTime()) / 1000)
	if (diff < 5) return 'just now'

	for (const [divisor, unit] of TIME_UNITS) {
		if (diff < divisor) {
			return `${diff} ${unit}${diff === 1 ? '' : 's'} ago`
		}
		diff = Math.floor(diff / divisor)
	}
	return `${diff} year${diff === 1 ? '' : 's'} ago`
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
	const minutes = Math.floor(ms / 60_000)
	const seconds = Math.round((ms % 60_000) / 1000)
	return `${minutes}m ${seconds}s`
}

export function truncateHash(hash: string, length = 12): string {
	return hash.length <= length ? hash : hash.slice(0, length)
}
