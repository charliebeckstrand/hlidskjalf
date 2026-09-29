/**
 * The periodic + event-driven poll loop the store owns. `createMeter` wraps the pure
 * parsers/maths from {@link ./parse.ts} so the store can sample per-workspace CPU and
 * memory without itself touching `/proc` or `ps`.
 */

import { execFile, execFileSync } from 'node:child_process'
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

/** Default page size assumed when the kernel's can't be read. */
const DEFAULT_PAGE_SIZE = 4096

/**
 * The kernel page size in bytes, for converting `/proc/<pid>/stat`'s RSS (reported in
 * pages) to bytes. Hardcoding 4096 is wrong on ARM64 Linux configured with 16K/64K pages,
 * where RSS would be under-reported by 4x/16x. Read it once via `getconf`, falling back to
 * 4096 if that's unavailable.
 */
function resolvePageSize(): number {
	try {
		const out = execFileSync('getconf', ['PAGE_SIZE'], { encoding: 'utf8', timeout: 1_000 })

		const parsed = Number.parseInt(out.trim(), 10)

		return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_PAGE_SIZE : parsed
	} catch {
		return DEFAULT_PAGE_SIZE
	}
}

/** Parent→children links and per-pid CPU/RSS, as read from `/proc`. */
interface ProcTree {
	children: Map<number, number[]>
	stats: Map<number, { utime: number; stime: number; rss: number }>
}

/**
 * Whether the kernel exposes `/proc/<pid>/task/<tid>/children` (CONFIG_PROC_CHILDREN, on in
 * mainstream distro kernels), probed once against this process.
 */
function hasChildrenFiles(): boolean {
	try {
		fs.readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8')

		return true
	} catch {
		return false
	}
}

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

	const linux = process.platform === 'linux'

	// Only the Linux `/proc` reader converts pages to bytes; elsewhere `ps` already reports KB.
	const pageSize = linux ? resolvePageSize() : DEFAULT_PAGE_SIZE

	const childrenFiles = linux && hasChildrenFiles()

	let timer: ReturnType<typeof setTimeout> | null = null

	let lastSampleAt = 0

	let stopped = false

	// True while a sample is draining, so an async `ps` poll can't overlap the next tick.
	let sampling = false

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

	/** Record one pid's stat line in `tree` and return its ppid, or null if it's gone. */
	const readStat = (pid: number, tree: ProcTree): number | null => {
		try {
			const parsed = parseProcStat(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), pageSize)

			if (!parsed) return null

			const { ppid, utime, stime, rss } = parsed

			tree.stats.set(pid, { utime, stime, rss })

			return ppid
		} catch {
			// process vanished mid-read
			return null
		}
	}

	/**
	 * Fallback reader: every process on the system, linked by ppid. Thousands of synchronous
	 * reads on a busy host, so it only runs where the kernel lacks per-task `children` files.
	 */
	const readWholeProcTree = (): ProcTree => {
		const tree: ProcTree = { children: new Map(), stats: new Map() }

		let entries: string[]

		try {
			entries = fs.readdirSync('/proc')
		} catch {
			return tree
		}

		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) continue

			const pid = Number.parseInt(entry, 10)

			const ppid = readStat(pid, tree)

			if (ppid === null) continue

			let kids = tree.children.get(ppid)

			if (!kids) {
				kids = []

				tree.children.set(ppid, kids)
			}

			kids.push(pid)
		}
		return tree
	}

	/**
	 * Read only the trees under `roots`, walking down through each thread's
	 * `/proc/<pid>/task/<tid>/children` list: a few dozen reads for a handful of dev servers
	 * instead of one per process on the machine, on the event loop every poll.
	 */
	const readOwnedProcTrees = (roots: Iterable<number>): ProcTree => {
		const tree: ProcTree = { children: new Map(), stats: new Map() }

		const stack = [...roots]

		while (stack.length > 0) {
			const pid = stack.pop() as number

			if (tree.stats.has(pid) || readStat(pid, tree) === null) continue

			let tids: string[]

			try {
				tids = fs.readdirSync(`/proc/${pid}/task`)
			} catch {
				continue
			}

			const kids: number[] = []

			for (const tid of tids) {
				try {
					for (const raw of fs
						.readFileSync(`/proc/${pid}/task/${tid}/children`, 'utf8')
						.split(' ')) {
						const kid = Number.parseInt(raw, 10)

						if (kid > 0) kids.push(kid)
					}
				} catch {
					// thread exited mid-walk
				}
			}

			if (kids.length === 0) continue

			tree.children.set(pid, kids)

			for (const kid of kids) stack.push(kid)
		}
		return tree
	}

	/**
	 * Sample every root's tree against a parent→children map and per-PID stat lookup,
	 * then notify on any change. The two sources (Linux `/proc`, `ps` elsewhere) differ
	 * only in how they build `children`/`statOf`; the diff-and-dispatch loop is shared.
	 */
	const collectFrom = (
		roots: Map<number, string>,
		children: Map<number, number[]>,
		statOf: (pid: number) => { ticks: number; rss: number } | undefined,
	): void => {
		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of roots) {
			const pids = collectDescendants(rootPid, children)

			const updated = apply(name, pids, now, statOf)

			changed = changed || updated
		}

		if (changed) deps.onChange()
	}

	const collectProc = (roots: Map<number, string>): void => {
		const tree = childrenFiles ? readOwnedProcTrees(roots.keys()) : readWholeProcTree()

		collectFrom(roots, tree.children, (pid) => {
			const stat = tree.stats.get(pid)

			return stat ? { ticks: stat.utime + stat.stime, rss: stat.rss } : undefined
		})
	}

	// `ps` runs async (unlike the Linux `/proc` reader's fast in-memory syscalls): shelling out
	// synchronously would block the event loop — freezing input, rendering, and child output —
	// for as long as a wedged process table takes to answer, up to PS_TIMEOUT_MS every poll.
	const collectPs = (roots: Map<number, string>): Promise<void> =>
		new Promise((resolve) => {
			execFile(
				'ps',
				['-eo', 'pid,ppid,time,rss'],
				{ encoding: 'utf8', timeout: PS_TIMEOUT_MS },
				(error, output) => {
					// Bail on a failed sample or a meter stopped while ps was in flight.
					if (error || stopped) {
						resolve()

						return
					}

					const { children, stats } = parsePsOutput(output)

					collectFrom(roots, children, (pid) => {
						const stat = stats.get(pid)

						return stat ? { ticks: stat.cputimeTicks, rss: stat.rss } : undefined
					})

					resolve()
				},
			)
		})

	const collect = async (): Promise<void> => {
		// Skip if a previous sample is still draining (a slow ps): overlapping polls would
		// double-count and race the CPU-tick snapshots.
		if (stopped || sampling) return

		sampling = true

		try {
			lastSampleAt = Date.now()

			const roots = deps.roots()

			if (roots.size === 0) return

			if (process.platform === 'linux') collectProc(roots)
			else await collectPs(roots)
		} finally {
			sampling = false
		}
	}

	const schedule = (delay: number): void => {
		if (timer) clearTimeout(timer)

		timer = setTimeout(() => {
			timer = null

			// Re-arm only once the sample settles, so a slow ps can't stack overlapping polls.
			void collect().finally(() => {
				if (!stopped) schedule(METRICS_INTERVAL_MS)
			})
		}, delay)

		timer.unref()
	}

	// Seed per-PID baselines (this first sample reports 0% CPU) and arm the poll.
	void collect()

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
