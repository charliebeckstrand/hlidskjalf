export type WorkspaceKind = 'package' | 'app' | 'service'

export type Status =
	| 'pending'
	| 'building'
	| 'watching'
	| 'ready'
	| 'error'
	| 'stopped'
	| 'idle'
	| 'timeout'

export interface Workspace {
	name: string
	kind: WorkspaceKind
	deps: string[]
}

export interface Metrics {
	cpu: number
	mem: number
}

export interface Process {
	workspace: Workspace
	status: Status
	url?: string
	logs: string[]
	metrics?: Metrics
}

export type SortOrder = 'alphabetical' | 'run'

export interface Options {
	root: string
	filter?: string[]
	order: SortOrder
	title: string
	metrics: boolean
}
