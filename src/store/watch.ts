// --- Watch-mode reconciliation -------------------------------------------------

import type { Workspace } from '../types.js'
import { discoverFiltered, sortForDisplay } from './discovery.js'
import { beginTeardown, clearTimers, newEntry } from './entry.js'
import { changed } from './snapshot.js'
import { spawnWorkspace } from './spawn.js'
import type { StoreContext } from './types.js'

/**
 * Re-run discovery after a package.json change: start workspaces that appeared, drop
 * ones that vanished, and re-sort the display order.
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

	changed(ctx)
}

/**
 * Register and start a workspace discovered after startup (watch mode). No-op if
 * already tracked or shutting down. Spawned directly without startup dependency
 * gating, since the packages it may depend on are up by now.
 */
export function addWorkspace(ctx: StoreContext, workspace: Workspace): void {
	if (ctx.stopping) return

	if (ctx.entries.has(workspace.name)) return

	ctx.allWorkspaces.push(workspace)

	ctx.entries.set(workspace.name, newEntry(workspace))

	// Append so it shows immediately; `rediscover` re-sorts the order afterward.
	if (!ctx.order.includes(workspace.name)) ctx.order.push(workspace.name)

	spawnWorkspace(ctx, workspace)
}

/**
 * Stop and forget a workspace that no longer exists in discovery. Cancels pending
 * timers and tears down the child's process group so its server frees its port, then
 * drops all state so it disappears from the dashboard.
 */
export function removeWorkspace(ctx: StoreContext, name: string): void {
	const entry = ctx.entries.get(name)

	if (!entry) return

	clearTimers(entry)

	// Tear the child's group down so its server frees its port. Deleting the entry
	// also means the spawn close handler can't find it, so the exit is non-crashing.
	beginTeardown(entry, () => {})

	ctx.entries.delete(name)

	ctx.order = ctx.order.filter((n) => n !== name)

	ctx.allWorkspaces = ctx.allWorkspaces.filter((w) => w.name !== name)

	ctx.meter?.reset(name)

	changed(ctx)
}
