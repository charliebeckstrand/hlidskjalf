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
import { getSnapshot, subscribe } from './snapshot.js'
import type { Store, StoreContext } from './types.js'
import { addWorkspace, removeWorkspace } from './watch.js'

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
		metricsEnabled: opts.metrics,
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
