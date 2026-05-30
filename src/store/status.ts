import type { Status } from '../types.js'
import { note, withEntry } from './entry.js'
import { markChanged } from './snapshot.js'
import type { StoreContext } from './types.js'

export function setStatus(ctx: StoreContext, name: string, status: Status): void {
	withEntry(ctx, name, (entry) => {
		const statusChanged = entry.process.status !== status

		entry.process.status = status

		// A stopped process has no child to meter; drop its last reading so the dashboard
		// doesn't show stale CPU/memory for something that's gone.
		if (status === 'stopped') entry.process.metrics = undefined

		if (status === 'error' && entry.process.workspace.kind === 'package') {
			notifyDependents(ctx, name)
		}

		// A status change coincides with a shift in CPU use; pull a fresh sample.
		if (statusChanged) ctx.meter?.request()

		markChanged(ctx)
	})
}

export function notifyDependents(ctx: StoreContext, failedName: string): void {
	for (const workspace of ctx.allWorkspaces) {
		if (!workspace.deps.includes(failedName)) continue

		const entry = ctx.entries.get(workspace.name)

		if (entry) note(entry, `warning: dependency ${failedName} entered error state`)
	}
}
