/**
 * The process supervisor: spawns one child per workspace, tracks each one's status and
 * logs, and publishes an immutable snapshot React subscribes to. {@link ./lifecycle.ts}
 * owns startup and teardown; {@link ./control.ts} the per-process actions (stop, restart,
 * pause, resume, kill, clear logs); {@link ./reconcile.ts} adds and removes workspaces as
 * the watcher rediscovers them; {@link ./snapshot.ts} rebuilds and notifies on the
 * snapshot. `createStore` threads a single mutable {@link ./types.ts | StoreContext}
 * through the thin method surface those modules act on.
 */

import type { Options } from '../types.js'
import {
	clearLogs,
	killProcess,
	pauseProcess,
	restartProcess,
	resumeProcess,
	stopProcess,
} from './control.js'
import { shutdown, start } from './lifecycle.js'
import { addWorkspace, removeWorkspace } from './reconcile.js'
import { getSnapshot, subscribe } from './snapshot.js'
import type { Store, StoreContext } from './types.js'

export type { Store } from './types.js'

function createContext(opts: Options): StoreContext {
	return {
		entries: new Map(),
		order: [],
		listeners: new Set(),
		snapshot: [],
		dirty: true,
		pendingRebuilds: new Set(),
		heartbeat: null,
		meter: null,
		watcher: null,
		allWorkspaces: [],
		stopping: false,
		root: opts.root,
		sortOrder: opts.order,
		filter: opts.filter,
		metricsEnabled: opts.showMetrics,
		watchEnabled: opts.watch,
	}
}

export function createStore(opts: Options): Store {
	const ctx = createContext(opts)

	return {
		getSnapshot: () => getSnapshot(ctx),
		subscribe: (listener) => subscribe(ctx, listener),
		start: () => start(ctx),
		shutdown: () => shutdown(ctx),
		stopProcess: (name) => stopProcess(ctx, name),
		restartProcess: (name) => restartProcess(ctx, name),
		pauseProcess: (name) => pauseProcess(ctx, name),
		resumeProcess: (name) => resumeProcess(ctx, name),
		killProcess: (name) => killProcess(ctx, name),
		clearLogs: (name) => clearLogs(ctx, name),
		addWorkspace: (workspace) => addWorkspace(ctx, workspace),
		removeWorkspace: (name) => removeWorkspace(ctx, name),
	}
}
