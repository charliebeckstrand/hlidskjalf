// --- Discovery -----------------------------------------------------------------

import type { Workspace } from '../types.js'
import { discover, filterWorkspaces, sortByDeps, sortByName } from '../workspaces.js'
import type { StoreContext } from './types.js'

export function discoverFiltered(ctx: StoreContext): Workspace[] {
	const found = discover(ctx.root)

	return ctx.filter ? filterWorkspaces(found, ctx.filter) : found
}

export function sortForDisplay(ctx: StoreContext, workspaces: Workspace[]): Workspace[] {
	return ctx.sortOrder === 'run' ? sortByDeps(workspaces) : sortByName(workspaces)
}
