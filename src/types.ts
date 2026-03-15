export type WorkspaceKind = 'package' | 'app' | 'service'

export type Status = 'pending' | 'building' | 'watching' | 'ready' | 'error' | 'stopped' | 'stale' | 'timeout'

export interface Workspace {
	name: string
	kind: WorkspaceKind
	deps: string[]
}

export interface Process {
	workspace: Workspace
	status: Status
	url?: string
	logs: string[]
}

export type SortOrder = 'alphabetical' | 'run'

export interface Options {
	root: string
	filter?: string[]
	order: SortOrder
}
