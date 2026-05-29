import type { Status } from './types.js'

/** How often the liveness sweep runs. */
const HEARTBEAT_INTERVAL_MS = 10_000
/** Output silence after which a `ready`/`watching` process is probed and, if dead, marked idle. */
const IDLE_THRESHOLD_MS = 300_000
/** Per-probe HTTP timeout. */
const PROBE_TIMEOUT_MS = 3000

/**
 * The slice of a tracked process the heartbeat reads and updates: the current
 * status/URL, the last-output timestamp it refreshes on a successful probe, and
 * the last good status to restore to. A `ProcessEntry` satisfies this
 * structurally, so the runner can hand its entries over without exposing the
 * rest of their internals.
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

/**
 * Periodic liveness monitor. A dev server that has gone quiet for a while might
 * be wedged or might just be idle; the heartbeat probes its URL to tell the
 * difference, marking it `idle` when unreachable and restoring it when output or
 * a successful probe shows it's alive. Kept off the runner so the lifecycle code
 * stays focused on spawning and teardown.
 */
export class Heartbeat {
	private interval: ReturnType<typeof setInterval> | null = null

	constructor(private deps: HeartbeatDeps) {}

	start(): void {
		this.interval = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS)

		this.interval.unref()
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval)

			this.interval = null
		}
	}

	private tick(): void {
		const now = Date.now()

		for (const [name, entry] of this.deps.entries()) {
			const { status } = entry.process

			const url = entry.process.url

			if (status === 'idle' && url) {
				this.probe(url).then((alive) => {
					// The probe is async; bail if the process was stopped/restarted in the
					// meantime so we don't resurrect it to a running status.
					if (alive && entry.process.status === 'idle') {
						entry.lastOutputAt = Date.now()

						this.deps.setStatus(name, entry.lastGoodStatus ?? 'ready')
					}
				})

				continue
			}

			if (status !== 'watching' && status !== 'ready') continue

			if (entry.lastOutputAt && now - entry.lastOutputAt > IDLE_THRESHOLD_MS) {
				if (url) {
					this.probe(url).then((alive) => {
						if (alive) {
							entry.lastOutputAt = Date.now()
						} else if (entry.process.status === 'watching' || entry.process.status === 'ready') {
							this.deps.setStatus(name, 'idle')
						}
					})
				} else {
					this.deps.setStatus(name, 'idle')
				}
			}
		}
	}

	private async probe(url: string): Promise<boolean> {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })

			// Any response means the server is alive; drain the body so the socket frees.
			await res.body?.cancel()

			return true
		} catch {
			return false
		}
	}
}
