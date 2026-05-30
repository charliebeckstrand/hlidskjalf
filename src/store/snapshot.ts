import type { WorkspaceProcess } from '../types.js'
import type { StoreContext } from './types.js'

export function subscribe(ctx: StoreContext, listener: () => void): () => void {
	ctx.listeners.add(listener)

	return () => ctx.listeners.delete(listener)
}

export function getSnapshot(ctx: StoreContext): WorkspaceProcess[] {
	if (ctx.dirty) {
		ctx.snapshot = ctx.order.flatMap((name) => {
			const proc = ctx.entries.get(name)?.process

			return proc ? [proc] : []
		})

		ctx.dirty = false
	}

	return ctx.snapshot
}

/** Mark the snapshot stale and notify subscribers (React + internal waiters). */
export function markChanged(ctx: StoreContext): void {
	ctx.dirty = true

	for (const listener of ctx.listeners) listener()
}
