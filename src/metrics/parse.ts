/**
 * Pure parsers and maths for per-workspace CPU/memory sampling. Free of side effects
 * so they can be unit-tested without spawning processes or reading /proc; the poll
 * loop that drives them lives in {@link ./meter.ts}.
 */

/** Collect a root pid and all its (transitive) descendants from a parent→children map. */
export function collectDescendants(rootPid: number, children: Map<number, number[]>): number[] {
	const result: number[] = []

	// A real /proc/ps tree is acyclic (one ppid per pid), but guard anyway: a cyclic or
	// diamond `children` map would otherwise loop forever, hanging the poll. Skipping
	// already-seen pids also keeps a pid from being double-counted in the meter's totals.
	const seen = new Set<number>()

	const stack = [rootPid]

	while (stack.length > 0) {
		const pid = stack.pop() as number

		if (seen.has(pid)) continue

		seen.add(pid)

		result.push(pid)

		const kids = children.get(pid)

		// Push children one at a time, not via spread: spread passes each child as an
		// argument and throws RangeError on a pathologically wide tree.
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

	// A short stat line (a zombie racing collection, a truncated read) leaves the CPU/RSS
	// fields absent. Floor each to 0 so a NaN can't reach the meter, where summed ticks feed
	// sumTickDeltas and summed RSS feeds a workspace total — matching parsePsOutput, whose
	// parseCpuTime already yields 0 on malformed input.
	const utimeRaw = Number.parseInt(fields[11] ?? '', 10)

	const utime = Number.isNaN(utimeRaw) ? 0 : utimeRaw

	const stimeRaw = Number.parseInt(fields[12] ?? '', 10)

	const stime = Number.isNaN(stimeRaw) ? 0 : stimeRaw

	const rssPages = Number.parseInt(fields[21] ?? '', 10)

	const rss = (Number.isNaN(rssPages) ? 0 : rssPages) * pageSize

	if (Number.isNaN(ppid)) return null

	return { ppid, utime, stime, rss }
}

/**
 * Convert a CPU-tick delta over an elapsed window into a percentage of total CPU capacity,
 * clamped to 0–100. `ticksPerSec` is the kernel's USER_HZ, conventionally 100. A negative
 * delta (PID reuse) floors at 0; an overshoot caps at 100. The window can run a touch short
 * of the ticks accrued against it — timer jitter near the meter's sub-second sample floor,
 * or whole-tick granularity over a brief interval — which would otherwise report an
 * impossible >100% of total capacity.
 */
export function cpuPercentFromTicks(
	tickDelta: number,
	elapsedMs: number,
	numCpus: number,
	ticksPerSec = 100,
): number {
	if (elapsedMs <= 0 || numCpus <= 0) return 0

	const elapsedSec = elapsedMs / 1000

	const percent = (tickDelta / ticksPerSec / elapsedSec / numCpus) * 100

	return Math.min(100, Math.max(0, percent))
}
