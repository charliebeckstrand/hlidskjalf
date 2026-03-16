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
} as const
