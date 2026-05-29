import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

import {
	collectDescendants,
	cpuPercentFromTicks,
	parseProcStat,
	parsePsOutput,
	sumTickDeltas,
} from './metrics.js'
import type { Metrics } from './types.js'

/** Periodic fallback poll interval. */
const METRICS_INTERVAL_MS = 3_000
// Floor on the gap between two CPU samples. Event-driven sampling can ask for a
// reading sooner than the periodic poll, but a delta measured over too short a
// window is dominated by tick-granularity noise, so never sample faster than this.
const MIN_METRICS_INTERVAL_MS = 1_000
/** Hard cap on the `ps` call so a wedged process table can't stall the poll. */
const PS_TIMEOUT_MS = 5_000

export interface MeterDeps {
	/** Running root PIDs mapped to their workspace name (stopped/dead children excluded). */
	roots(): Map<number, string>
	/** Write a fresh reading onto a tracked process; returns false if it's gone. */
	setMetrics(name: string, metrics: Metrics): boolean
	/** Signal that at least one process's metrics changed, so the UI re-renders. */
	onChange(): void
}

/**
 * Samples per-workspace CPU and memory for the runner. CPU is derived from
 * per-PID cumulative-tick deltas between samples (see `sumTickDeltas`) so a
 * process tree that grows mid-startup can't spike. Sampling is event-driven —
 * `request()` pulls a reading sooner than the periodic fallback when something
 * likely shifted CPU use — but never closer together than
 * `MIN_METRICS_INTERVAL_MS`, so the diff window stays wide enough to be accurate.
 */
export class Meter {
	private prevCpuSnapshot = new Map<string, { time: number; perPid: Map<number, number> }>()
	private timer: ReturnType<typeof setTimeout> | null = null
	private lastSampleAt = 0
	private stopped = false
	private readonly numCpus = os.availableParallelism()

	constructor(private deps: MeterDeps) {}

	/** Seed per-PID baselines (this first sample reports 0% CPU) and arm the periodic poll. */
	start(): void {
		this.collect()

		this.schedule(METRICS_INTERVAL_MS)
	}

	/** Cancel the poll; no further samples are taken. */
	stop(): void {
		this.stopped = true

		if (this.timer) {
			clearTimeout(this.timer)

			this.timer = null
		}
	}

	/** Pull a sample sooner than the periodic poll, respecting the minimum spacing. */
	request(): void {
		if (this.stopped) return

		const sinceLast = Date.now() - this.lastSampleAt

		this.schedule(Math.max(0, MIN_METRICS_INTERVAL_MS - sinceLast))
	}

	/** Drop a workspace's snapshot when it's removed, so a later PID reuse starts clean. */
	reset(name: string): void {
		this.prevCpuSnapshot.delete(name)
	}

	private schedule(delay: number): void {
		if (this.timer) clearTimeout(this.timer)

		this.timer = setTimeout(() => {
			this.timer = null

			this.collect()

			if (!this.stopped) this.schedule(METRICS_INTERVAL_MS)
		}, delay)

		this.timer.unref()
	}

	private collect(): void {
		if (this.stopped) return

		this.lastSampleAt = Date.now()

		const roots = this.deps.roots()

		if (roots.size === 0) return

		if (process.platform === 'linux') {
			this.collectProc(roots)
		} else {
			this.collectPs(roots)
		}
	}

	private collectProc(roots: Map<number, string>): void {
		const tree = this.readProcTree()

		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of roots) {
			const pids = collectDescendants(rootPid, tree.children)

			const updated = this.apply(name, pids, now, (pid) => {
				const stat = tree.stats.get(pid)

				return stat ? { ticks: stat.utime + stat.stime, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}

		if (changed) this.deps.onChange()
	}

	private collectPs(roots: Map<number, string>): void {
		let output: string

		try {
			output = execFileSync('ps', ['-eo', 'pid,ppid,time,rss'], {
				encoding: 'utf8',
				timeout: PS_TIMEOUT_MS,
			})
		} catch {
			return
		}

		const { children, stats } = parsePsOutput(output)

		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of roots) {
			const pids = collectDescendants(rootPid, children)

			const updated = this.apply(name, pids, now, (pid) => {
				const stat = stats.get(pid)

				return stat ? { ticks: stat.cputimeTicks, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}

		if (changed) this.deps.onChange()
	}

	/**
	 * Diff a workspace's process tree against its previous snapshot to derive CPU%
	 * and total RSS, then store the new snapshot. Returns whether a tracked process
	 * was updated.
	 */
	private apply(
		name: string,
		pids: number[],
		now: number,
		statOf: (pid: number) => { ticks: number; rss: number } | undefined,
	): boolean {
		const prev = this.prevCpuSnapshot.get(name)

		const perPid = new Map<number, number>()

		let totalMem = 0

		for (const pid of pids) {
			const stat = statOf(pid)

			if (!stat) continue

			perPid.set(pid, stat.ticks)

			totalMem += stat.rss
		}

		const cpu = prev
			? cpuPercentFromTicks(sumTickDeltas(prev.perPid, perPid), now - prev.time, this.numCpus)
			: 0

		this.prevCpuSnapshot.set(name, { time: now, perPid })

		return this.deps.setMetrics(name, { cpu, mem: totalMem })
	}

	private readProcTree(): {
		children: Map<number, number[]>
		stats: Map<number, { utime: number; stime: number; rss: number }>
	} {
		const children = new Map<number, number[]>()

		const stats = new Map<number, { utime: number; stime: number; rss: number }>()

		let entries: string[]

		try {
			entries = fs.readdirSync('/proc')
		} catch {
			return { children, stats }
		}

		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) continue

			const pid = Number.parseInt(entry, 10)

			try {
				const parsed = parseProcStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'))

				if (!parsed) continue

				const { ppid, utime, stime, rss } = parsed

				stats.set(pid, { utime, stime, rss })

				let kids = children.get(ppid)

				if (!kids) {
					kids = []

					children.set(ppid, kids)
				}

				kids.push(pid)
			} catch {
				// process vanished between readdir and readFile
			}
		}

		return { children, stats }
	}
}
