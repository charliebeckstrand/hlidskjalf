export interface CacheEntry {
	hash: string
	sizeBytes: number
	createdAt: Date
	files: string[]
}

export interface RunSummaryTask {
	taskId: string
	package: string
	task: string
	hash: string
	cacheHit: boolean
	durationMs: number
	command: string
	outputs: string[]
}

export interface RunSummary {
	id: string
	startedAt: Date
	durationMs: number
	tasks: RunSummaryTask[]
	cacheHitCount: number
	cacheMissCount: number
}

export interface CacheStats {
	totalSizeBytes: number
	entryCount: number
	oldestEntry: Date | null
	newestEntry: Date | null
}

export type View =
	| { kind: 'overview' }
	| { kind: 'entry-detail'; hash: string }
	| { kind: 'runs-list' }
	| { kind: 'run-detail'; id: string }
	| { kind: 'run-compare'; ids: [string, string] }

export interface Options {
	root: string
	cacheDir?: string
	title: string
}
