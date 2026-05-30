import { ERROR_RECOVERY_MS } from './constants.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'

export function scheduleErrorRecovery(ctx: StoreContext, name: string): void {
	clearErrorTimer(ctx, name)

	const entry = ctx.entries.get(name)

	if (!entry) return

	const timer = setTimeout(() => {
		entry.errorTimer = null

		if (entry.process.status === 'error') {
			setStatus(ctx, name, entry.lastGoodStatus ?? 'ready')
		}
	}, ERROR_RECOVERY_MS)

	timer.unref()

	entry.errorTimer = timer
}

export function clearErrorTimer(ctx: StoreContext, name: string): void {
	const entry = ctx.entries.get(name)

	if (entry?.errorTimer) {
		clearTimeout(entry.errorTimer)

		entry.errorTimer = null
	}
}
