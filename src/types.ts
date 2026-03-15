export type WorkspaceKind = 'package' | 'app'

export type Status = 'pending' | 'building' | 'watching' | 'ready' | 'error' | 'stopped'

export interface Workspace {
	name: string
	kind: WorkspaceKind
	path: string
	port?: number
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
