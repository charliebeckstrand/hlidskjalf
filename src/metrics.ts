/**
 * Per-workspace CPU/memory sampling. The pure parsers/maths are free of side
 * effects so they can be unit-tested without spawning processes or reading /proc;
 * `createMeter` wraps them in the periodic + event-driven poll loop the store owns.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import type { Metrics } from './types.js'

// --- Pure helpers --------------------------------------------------------------

/** Allowlisted environment variable names passed to child processes. */
export const ENV_ALLOWLIST = new Set([
	'HOME',
	'USER',
	'LOGNAME',
	'SHELL',
	'PATH',
	'LANG',
	'LC_ALL',
	'LC_CTYPE',
	'TERM',
	'TERM_PROGRAM',
	'COLORTERM',
	'NODE_ENV',
	'NODE_OPTIONS',
	'NODE_PATH',
	'NPM_CONFIG_REGISTRY',
	'PNPM_HOME',
	'COREPACK_HOME',
	'XDG_CONFIG_HOME',
	'XDG_DATA_HOME',
	'XDG_CACHE_HOME',
	'TMPDIR',
	'TMP',
	'TEMP',
	'EDITOR',
	'DISPLAY',
	'HOSTNAME',
])

/** Build a child-process environment containing only allowlisted variables. */
export function safeEnv(
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
	const filtered: Record<string, string | undefined> = {}
	for (const key of Object.keys(source)) {
		if (ENV_ALLOWLIST.has(key)) filtered[key] = source[key]
	}
	filtered.FORCE_COLOR = '1'
	return filtered
}

/** Collect a root pid and all its (transitive) descendants from a parent→children map. */
export function collectDescendants(rootPid: number, children: Map<number, number[]>): number[] {
	const result: number[] = []
	const stack = [rootPid]
	while (stack.length > 0) {
		const pid = stack.pop() as number
		result.push(pid)
		const kids = children.get(pid)
		// Push children one at a time rather than spreading: a spread passes every child
		// as a function argument, which throws RangeError on a pathologically wide tree.
		if (kids) {
			for (const kid of kids) stack.push(kid)
		}
	}
	return result
}

export interface PsStat {
	/** Cumulative CPU time in USER_HZ ticks (100/s). */
	cputimeTicks: number
	rss: number
}

/**
 * Parse a `ps` cumulative CPU time field (`[[dd-]hh:]mm:ss[.frac]`) into USER_HZ
 * ticks, so it diffs against the same unit as `/proc` utime+stime. Returns 0 for an
 * empty or malformed value.
 */
export function parseCpuTime(raw: string): number {
	let rest = raw.trim()
	if (!rest) return 0

	let days = 0
	const dash = rest.indexOf('-')
	if (dash !== -1) {
		days = Number.parseInt(rest.slice(0, dash), 10)
		if (Number.isNaN(days)) return 0
		rest = rest.slice(dash + 1)
	}

	const parts = rest.split(':')
	let seconds = 0
	let multiplier = 1
	// Walk colon-separated fields right-to-left (seconds, minutes, hours).
	for (let i = parts.length - 1; i >= 0; i--) {
		const value = Number.parseFloat(parts[i] ?? '')
		if (Number.isNaN(value)) return 0
		seconds += value * multiplier
		multiplier *= 60
	}
	seconds += days * 86_400
	return Math.round(seconds * 100)
}

/** Parse `ps -eo pid,ppid,time,rss` output into parent→children and pid→stat maps. */
export function parsePsOutput(output: string): {
	children: Map<number, number[]>
	stats: Map<number, PsStat>
} {
	const children = new Map<number, number[]>()
	const stats = new Map<number, PsStat>()

	for (const line of output.trim().split('\n').slice(1)) {
		const parts = line.trim().split(/\s+/)
		if (parts.length < 4) continue
		const pid = Number.parseInt(parts[0] ?? '', 10)
		const ppid = Number.parseInt(parts[1] ?? '', 10)
		const cputimeTicks = parseCpuTime(parts[2] ?? '')
		const rssKb = Number.parseInt(parts[3] ?? '', 10)
		if (Number.isNaN(pid) || Number.isNaN(ppid)) continue

		stats.set(pid, { cputimeTicks, rss: (Number.isNaN(rssKb) ? 0 : rssKb) * 1024 })
		let kids = children.get(ppid)
		if (!kids) {
			kids = []
			children.set(ppid, kids)
		}
		kids.push(pid)
	}
	return { children, stats }
}

/**
 * Sum the positive per-PID CPU-tick deltas between two snapshots. A PID absent from
 * `prev` (one that appeared since the last sample) contributes nothing, so a tree
 * that grows between samples doesn't dump a child's since-birth ticks into a single
 * interval. A PID whose ticks went backwards (PID reuse) is likewise ignored.
 */
export function sumTickDeltas(
	prev: Map<number, number> | undefined,
	curr: Map<number, number>,
): number {
	if (!prev) return 0
	let delta = 0
	for (const [pid, ticks] of curr) {
		const before = prev.get(pid)
		if (before !== undefined && ticks > before) delta += ticks - before
	}
	return delta
}

export interface ProcStat {
	ppid: number
	utime: number
	stime: number
	rss: number
}

/**
 * Parse `/proc/<pid>/stat` into parent pid, CPU ticks, and RSS (bytes). Returns null
 * when the line is malformed or the parent pid can't be determined.
 */
export function parseProcStat(content: string, pageSize = 4096): ProcStat | null {
	// The comm field (field 2) is wrapped in parens and may contain spaces/parens, so
	// split after the final ')'.
	const closeParen = content.lastIndexOf(')')
	if (closeParen === -1) return null

	const fields = content.slice(closeParen + 2).split(' ')
	const ppid = Number.parseInt(fields[1] ?? '', 10)
	const utime = Number.parseInt(fields[11] ?? '', 10)
	const stime = Number.parseInt(fields[12] ?? '', 10)
	const rss = Number.parseInt(fields[21] ?? '', 10) * pageSize
	if (Number.isNaN(ppid)) return null
	return { ppid, utime, stime, rss }
}

/**
 * Convert a CPU-tick delta over an elapsed window into a percentage of total CPU
 * capacity (0–100, clamped at 0). `ticksPerSec` is the kernel's USER_HZ, conventionally 100.
 */
export function cpuPercentFromTicks(
	tickDelta: number,
	elapsedMs: number,
	numCpus: number,
	ticksPerSec = 100,
): number {
	if (elapsedMs <= 0 || numCpus <= 0) return 0
	const elapsedSec = elapsedMs / 1000
	return Math.max(0, (tickDelta / ticksPerSec / elapsedSec / numCpus) * 100)
}

// --- Meter (poll loop) ---------------------------------------------------------

/** Periodic fallback poll interval. */
const METRICS_INTERVAL_MS = 3_000
// Floor on the gap between two CPU samples. Event-driven sampling can ask sooner than
// the periodic poll, but a delta over too short a window is dominated by tick-granularity
// noise, so never sample faster than this.
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
	const prevCpuSnapshot = new Map<string, { time: number; perPid: Map<number, number> }>()
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
		const prev = prevCpuSnapshot.get(name)
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
		prevCpuSnapshot.set(name, { time: now, perPid })
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
			prevCpuSnapshot.delete(name)
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
