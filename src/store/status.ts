import type { Status } from '../types.js'
import { isRunning } from './children.js'
import { note, withEntry } from './entry.js'
import { markChanged } from './snapshot.js'
import type { StoreContext } from './types.js'

export function setStatus(ctx: StoreContext, name: string, status: Status): void {
	withEntry(ctx, name, (entry) => {
		const statusChanged = entry.process.status !== status

		entry.process.status = status

		// A process with no live child — stopped, or crashed and awaiting its restart — has
		// nothing to meter; drop its last reading so the dashboard doesn't show stale CPU/memory
		// for something that's gone.
		if (!isRunning(entry.child)) entry.process.metrics = undefined

		if (status === 'error' && entry.process.workspace.kind === 'package') {
			notifyDependents(ctx, name)
		}

		// A status change coincides with a shift in CPU use; pull a fresh sample.
		if (statusChanged) ctx.meter?.request()

		markChanged(ctx)
	})
}

export function notifyDependents(ctx: StoreContext, failedName: string): void {
	for (const entry of ctx.entries.values()) {
		if (entry.process.workspace.deps.includes(failedName)) {
			note(entry, `warning: dependency ${failedName} entered error state`)
		}
	}
}
