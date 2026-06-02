import { ERROR_RECOVERY_MS } from './constants.js'
import { withEntry } from './entry.js'
import { setStatus } from './status.js'
import type { StoreContext } from './types.js'
import { clearTimer, createUnrefTimer } from './utilities.js'

export function scheduleErrorRecovery(ctx: StoreContext, name: string): void {
	cancelErrorRecovery(ctx, name)

	withEntry(ctx, name, (entry) => {
		entry.errorTimer = createUnrefTimer(ERROR_RECOVERY_MS, () => {
			entry.errorTimer = null

			if (entry.process.status === 'error') {
				setStatus(ctx, name, entry.lastGoodStatus ?? 'ready')
			}
		})
	})
}

export function cancelErrorRecovery(ctx: StoreContext, name: string): void {
	const entry = ctx.entries.get(name)

	if (entry) entry.errorTimer = clearTimer(entry.errorTimer)
}
