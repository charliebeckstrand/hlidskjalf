import type { ChildProcess } from 'node:child_process'
import type { Heartbeat } from '../liveness.js'
import type { Meter } from '../metrics/index.js'
import type { Process, SortOrder, Status, Workspace } from '../types.js'
import type { Watcher } from '../watcher.js'

export interface ProcessEntry {
	process: Process
	child: ChildProcess | null
	errorTimer: ReturnType<typeof setTimeout> | null
	restartTimer: ReturnType<typeof setTimeout> | null
	startupTimer: ReturnType<typeof setTimeout> | null
	lastGoodStatus: Status | null
	restartRetries: number
	lastOutputAt: number
	/** Set when stop/restart deliberately kills the child, so its close isn't treated as a crash. */
	intentionalExit: boolean
	/** True while a deliberate kill is in flight, so a second stop/restart doesn't stack a close handler. */
	teardownStarted: boolean
	/** Action to run once the in-flight teardown's child closes. The latest request wins. */
	onClose: (() => void) | null
	/** Status held before a SIGSTOP pause, to restore on resume; null when not paused. */
	pausedFrom: Status | null
}

export interface Store {
	/** Immutable, referentially stable between changes — for `useSyncExternalStore`. */
	getSnapshot(): Process[]
	subscribe(listener: () => void): () => void
	/** Discover, register, and begin spawning. Resolves false if no workspaces matched. */
	start(): Promise<boolean>
	shutdown(): Promise<void>
	stopProcess(name: string): void
	restartProcess(name: string): void
	/** Freeze a running process with SIGSTOP — its child stays alive but consumes no CPU. */
	pauseProcess(name: string): void
	/** Resume a paused process with SIGCONT, restoring the status it held before pausing. */
	resumeProcess(name: string): void
	/** Force-kill a process immediately (SIGKILL), skipping the graceful grace period; no restart. */
	killProcess(name: string): void
	clearLogs(name: string): void
	/** Register and spawn a workspace discovered after startup (watch mode). */
	addWorkspace(workspace: Workspace): void
	/** Stop and forget a workspace that no longer exists in discovery (watch mode). */
	removeWorkspace(name: string): void
}

/**
 * The shared mutable state behind a {@link Store}. Each concern module (lifecycle,
 * spawn, control, recovery, watch, …) operates over this context rather than a class
 * instance, so the store's behaviour is split across small files without losing the
 * single source of truth they all read and mutate.
 */
export interface StoreContext {
	entries: Map<string, ProcessEntry>
	/** Display order of workspace names; the snapshot is built from this. */
	order: string[]
	listeners: Set<() => void>
	snapshot: Process[]
	dirty: boolean

	pendingRebuilds: Set<ChildProcess>
	heartbeat: Heartbeat | null
	meter: Meter | null
	watcher: Watcher | null
	allWorkspaces: Workspace[]
	stopping: boolean

	readonly root: string
	readonly sortOrder: SortOrder
	readonly filter?: string[]
	readonly metricsEnabled: boolean
	readonly watchEnabled: boolean
}
