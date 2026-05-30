import type { Status } from '../types.js'
import { every } from '../ui/index.js'
import { probe } from './probe.js'

/** How often the health sweep runs. */
const HEARTBEAT_INTERVAL_MS = 10_000

/** Output silence after which a `ready`/`watching` process is probed and, if dead, marked idle. */
const IDLE_THRESHOLD_MS = 300_000

/**
 * The slice of a tracked process the heartbeat reads and updates: current status/URL,
 * the last-output timestamp it refreshes on a successful probe, and the last good
 * status to restore to. A store entry satisfies this structurally, so the store can
 * hand its entries over without exposing the rest of their internals.
 */
export interface Monitored {
	readonly process: { status: Status; url?: string }

	lastOutputAt: number

	readonly lastGoodStatus: Status | null
}

export interface HeartbeatDeps {
	/** The tracked processes, keyed by workspace name. */
	entries(): Iterable<[string, Monitored]>

	/** Transition a process to a new status (drives the idle ↔ ready/watching flips). */
	setStatus(name: string, status: Status): void
}

export interface Heartbeat {
	/** Stop the sweep; no further probes are scheduled. */
	stop(): void
}

/**
 * Periodic health monitor. A dev server gone quiet for a while might be wedged or
 * just idle; the heartbeat probes its URL to tell the difference, marking it `idle`
 * when unreachable and restoring it when output or a successful probe shows it's alive.
 */
export function createHeartbeat(deps: HeartbeatDeps): Heartbeat {
	const tick = () => {
		const now = Date.now()

		for (const [name, entry] of deps.entries()) {
			const { status, url } = entry.process

			if (status === 'idle' && url) {
				probe(url).then((alive) => {
					// The probe is async; bail if the process was stopped/restarted meanwhile
					// so we don't resurrect it to a running status.
					if (alive && entry.process.status === 'idle') {
						entry.lastOutputAt = Date.now()

						deps.setStatus(name, entry.lastGoodStatus ?? 'ready')
					}
				})

				continue
			}

			if (status !== 'watching' && status !== 'ready') continue

			if (entry.lastOutputAt && now - entry.lastOutputAt > IDLE_THRESHOLD_MS) {
				if (url) {
					probe(url).then((alive) => {
						if (alive) {
							entry.lastOutputAt = Date.now()
						} else if (entry.process.status === 'watching' || entry.process.status === 'ready') {
							deps.setStatus(name, 'idle')
						}
					})
				} else {
					deps.setStatus(name, 'idle')
				}
			}
		}
	}

	return { stop: every(HEARTBEAT_INTERVAL_MS, tick) }
}
