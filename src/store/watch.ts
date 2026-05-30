import type { Workspace } from '../types.js'
import { discoverFiltered, sortForDisplay } from './discovery.js'
import { beginTeardown, clearTimers, createEntry, withEntry } from './entry.js'
import { markChanged } from './snapshot.js'
import { spawnWorkspace } from './spawn.js'
import type { StoreContext } from './types.js'

/**
 * Re-run discovery after a package.json change: start workspaces that appeared, drop ones
 * that vanished, re-sort the display order.
 */
export function rediscover(ctx: StoreContext): void {
	if (ctx.stopping) return

	const fresh = discoverFiltered(ctx)

	const freshNames = new Set(fresh.map((w) => w.name))

	const currentNames = new Set(ctx.order)

	const added = fresh.filter((w) => !currentNames.has(w.name))

	const removed = [...currentNames].filter((name) => !freshNames.has(name))

	if (added.length === 0 && removed.length === 0) return

	for (const name of removed) removeWorkspace(ctx, name)

	for (const workspace of added) addWorkspace(ctx, workspace)

	ctx.order = sortForDisplay(ctx, fresh).map((w) => w.name)

	markChanged(ctx)
}

/**
 * Register and start a workspace discovered after startup (watch mode). No-op if already
 * tracked or shutting down. Spawned without dependency gating: the packages it may depend
 * on are up by now.
 */
export function addWorkspace(ctx: StoreContext, workspace: Workspace): void {
	if (ctx.stopping) return

	if (ctx.entries.has(workspace.name)) return

	ctx.allWorkspaces.push(workspace)

	ctx.entries.set(workspace.name, createEntry(workspace))

	// Append for immediate display; `rediscover` re-sorts afterward.
	if (!ctx.order.includes(workspace.name)) ctx.order.push(workspace.name)

	spawnWorkspace(ctx, workspace)
}

/**
 * Stop and forget a workspace no longer present in discovery. Cancels timers, tears down
 * the child's process group so its server frees its port, then drops all state so it
 * leaves the dashboard.
 */
export function removeWorkspace(ctx: StoreContext, name: string): void {
	withEntry(ctx, name, (entry) => {
		clearTimers(entry)

		// Deleting the entry next means the spawn close handler can't find it, so the
		// exit isn't treated as a crash.
		beginTeardown(entry, () => {})

		ctx.entries.delete(name)

		ctx.order = ctx.order.filter((n) => n !== name)

		ctx.allWorkspaces = ctx.allWorkspaces.filter((w) => w.name !== name)

		ctx.meter?.reset(name)

		markChanged(ctx)
	})
}
