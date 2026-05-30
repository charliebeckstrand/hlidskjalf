// --- Process control (stop / restart / pause / resume / kill / clear) ----------

import { isRunning, killTree } from './children.js'
import { beginTeardown, clearTimers, note } from './entry.js'
import { changed } from './snapshot.js'
import { spawnWorkspace } from './spawn.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'

export function stopProcess(ctx: StoreContext, name: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	clearTimers(entry)

	const wasLive = isRunning(entry.child)

	beginTeardown(entry, () => {
		entry.restartRetries = 0

		setStatus(ctx, name, 'stopped')
	})

	if (wasLive) {
		note(entry, 'stopping process...')

		changed(ctx)
	}
}

export function restartProcess(ctx: StoreContext, name: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	const workspace = entry.process.workspace

	const doRestart = () => {
		// A shutdown may have begun while the child was closing; don't respawn into it.
		if (ctx.stopping) return

		entry.restartRetries = 0

		entry.process.url = undefined

		note(entry, 'restarting process...')

		spawnWorkspace(ctx, workspace)
	}

	clearTimers(entry)

	const wasLive = isRunning(entry.child)

	beginTeardown(entry, doRestart)

	if (wasLive) {
		note(entry, 'stopping process for restart...')

		changed(ctx)
	}
}

export function pauseProcess(ctx: StoreContext, name: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	// Nothing to freeze if there's no live child, and pausing twice is a no-op.
	if (!isRunning(entry.child) || entry.pausedFrom !== null) return

	// Freeze pending timers too: a startup/error/restart timer that fired while the
	// child is suspended would flip the status out from under `paused`.
	clearTimers(entry)

	entry.pausedFrom = entry.process.status

	killTree(entry.child, 'SIGSTOP')

	note(entry, 'paused (SIGSTOP)')

	setStatus(ctx, name, 'paused')
}

export function resumeProcess(ctx: StoreContext, name: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry || entry.pausedFrom === null) return

	const restore = entry.pausedFrom

	entry.pausedFrom = null

	if (isRunning(entry.child)) killTree(entry.child, 'SIGCONT')

	// Reset the idle clock so the just-woken process isn't immediately probed for a
	// stall it never had while suspended.
	entry.lastOutputAt = Date.now()

	note(entry, 'resumed (SIGCONT)')

	setStatus(ctx, name, restore)
}

export function killProcess(ctx: StoreContext, name: string): void {
	if (ctx.stopping) return

	const entry = ctx.entries.get(name)

	if (!entry) return

	clearTimers(entry)

	const wasLive = isRunning(entry.child)

	// SIGKILL straight away — no SIGTERM grace — for a wedged process that ignores
	// a polite stop. Like stop, this doesn't schedule a restart.
	beginTeardown(
		entry,
		() => {
			entry.restartRetries = 0

			setStatus(ctx, name, 'stopped')
		},
		'SIGKILL',
	)

	if (wasLive) {
		note(entry, 'killing process (SIGKILL)...')

		changed(ctx)
	}
}

export function clearLogs(ctx: StoreContext, name: string): void {
	const entry = ctx.entries.get(name)

	if (!entry) return

	// Mutate in place: the snapshot rebuild on `changed()` re-renders the empty panel.
	entry.process.logs.length = 0

	changed(ctx)
}
