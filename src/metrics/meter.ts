/**
 * The periodic + event-driven poll loop the store owns. `createMeter` wraps the pure
 * parsers/maths from {@link ./parse.ts} so the store can sample per-workspace CPU and
 * memory without itself touching `/proc` or `ps`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import type { Metrics } from '../types.js'
import {
	collectDescendants,
	cpuPercentFromTicks,
	parseProcStat,
	parsePsOutput,
	sumTickDeltas,
} from './parse.js'

/** Periodic fallback poll interval. */
const METRICS_INTERVAL_MS = 3_000

// Floor on the gap between two CPU samples: a delta over too short a window is dominated
// by tick-granularity noise, so never sample faster than this even when request() asks.
const MIN_METRICS_INTERVAL_MS = 1_000

/** Hard cap on the `ps` call so a wedged process table can't stall the poll. */
const PS_TIMEOUT_MS = 5_000

export interface MeterDeps {
	/** Running root PIDs mapped to workspace name (stopped/dead children excluded). */
	roots(): Map<number, string>
	/** Write a fresh reading onto a tracked process; returns false if it's gone. */
	setMetrics(name: string, metrics: Metrics): boolean
	/** Signal that at least one process's metrics changed, so the UI re-renders. */
	onChange(): void
}

export interface Meter {
	/** Pull a sample sooner than the periodic poll, respecting the minimum spacing. */
	request(): void
	/** Drop a workspace's snapshot when removed, so a later PID reuse starts clean. */
	reset(name: string): void
	/** Cancel the poll; no further samples are taken. */
	stop(): void
}

/**
 * Sample per-workspace CPU and memory. CPU is derived from per-PID cumulative-tick
 * deltas between samples (see `sumTickDeltas`) so a tree that grows mid-startup can't
 * spike. Sampling is event-driven — `request()` pulls a reading sooner than the
 * periodic fallback — but never closer together than `MIN_METRICS_INTERVAL_MS`.
 */
export function createMeter(deps: MeterDeps): Meter {
	const prevCpuSnapshots = new Map<string, { time: number; perPid: Map<number, number> }>()

	const numCpus = os.availableParallelism()

	let timer: ReturnType<typeof setTimeout> | null = null

	let lastSampleAt = 0

	let stopped = false

	/**
	 * Diff a workspace's tree against its previous snapshot to derive CPU% and total
	 * RSS, store the new snapshot, and write the reading. Returns whether it updated.
	 */
	const apply = (
		name: string,
		pids: number[],
		now: number,
		statOf: (pid: number) => { ticks: number; rss: number } | undefined,
	): boolean => {
		const prev = prevCpuSnapshots.get(name)

		const perPid = new Map<number, number>()

		let totalMem = 0

		for (const pid of pids) {
			const stat = statOf(pid)

			if (!stat) continue

			perPid.set(pid, stat.ticks)

			totalMem += stat.rss
		}

		const cpu = prev
			? cpuPercentFromTicks(sumTickDeltas(prev.perPid, perPid), now - prev.time, numCpus)
			: 0

		prevCpuSnapshots.set(name, { time: now, perPid })

		return deps.setMetrics(name, { cpu, mem: totalMem })
	}

	const readProcTree = (): {
		children: Map<number, number[]>
		stats: Map<number, { utime: number; stime: number; rss: number }>
	} => {
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

	const collectProc = (roots: Map<number, string>): void => {
		const tree = readProcTree()

		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of roots) {
			const pids = collectDescendants(rootPid, tree.children)

			const updated = apply(name, pids, now, (pid) => {
				const stat = tree.stats.get(pid)

				return stat ? { ticks: stat.utime + stat.stime, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}

		if (changed) deps.onChange()
	}

	const collectPs = (roots: Map<number, string>): void => {
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

			const updated = apply(name, pids, now, (pid) => {
				const stat = stats.get(pid)

				return stat ? { ticks: stat.cputimeTicks, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}
		if (changed) deps.onChange()
	}

	const collect = (): void => {
		if (stopped) return

		lastSampleAt = Date.now()

		const roots = deps.roots()

		if (roots.size === 0) return

		if (process.platform === 'linux') collectProc(roots)
		else collectPs(roots)
	}

	const schedule = (delay: number): void => {
		if (timer) clearTimeout(timer)

		timer = setTimeout(() => {
			timer = null

			collect()

			if (!stopped) schedule(METRICS_INTERVAL_MS)
		}, delay)

		timer.unref()
	}

	// Seed per-PID baselines (this first sample reports 0% CPU) and arm the poll.
	collect()

	schedule(METRICS_INTERVAL_MS)

	return {
		request() {
			if (stopped) return

			const sinceLast = Date.now() - lastSampleAt

			schedule(Math.max(0, MIN_METRICS_INTERVAL_MS - sinceLast))
		},
		reset(name) {
			prevCpuSnapshots.delete(name)
		},
		stop() {
			stopped = true

			if (timer) {
				clearTimeout(timer)

				timer = null
			}
		},
	}
}
