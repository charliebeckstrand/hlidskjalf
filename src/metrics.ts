/**
 * Pure helpers for collecting per-process resource metrics. Kept free of class
 * state and side effects so the parsing/maths can be unit-tested directly,
 * without spawning processes or reading from /proc.
 */

/** Allowlisted environment variable prefixes/names passed to child processes */
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
		if (ENV_ALLOWLIST.has(key)) {
			filtered[key] = source[key]
		}
	}

	filtered.FORCE_COLOR = '1'

	return filtered
}

/** Collect a root pid and all of its (transitive) descendants from a parent→children map. */
export function collectDescendants(rootPid: number, children: Map<number, number[]>): number[] {
	const result: number[] = []
	const stack = [rootPid]

	while (stack.length > 0) {
		const pid = stack.pop() as number

		result.push(pid)

		const kids = children.get(pid)

		// Push children one at a time rather than spreading: a spread passes every
		// child as a function argument, which throws RangeError on a pathologically
		// wide process tree.
		if (kids) {
			for (const kid of kids) stack.push(kid)
		}
	}

	return result
}

export interface PsStat {
	cpu: number
	rss: number
}

/** Parse the output of `ps -eo pid,ppid,pcpu,rss` into parent→children and pid→stat maps. */
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
		const cpu = Number.parseFloat(parts[2] ?? '')
		const rssKb = Number.parseInt(parts[3] ?? '', 10)

		if (Number.isNaN(pid) || Number.isNaN(ppid)) continue

		stats.set(pid, {
			cpu: Number.isNaN(cpu) ? 0 : cpu,
			rss: (Number.isNaN(rssKb) ? 0 : rssKb) * 1024,
		})

		let kids = children.get(ppid)

		if (!kids) {
			kids = []

			children.set(ppid, kids)
		}

		kids.push(pid)
	}

	return { children, stats }
}

export interface ProcStat {
	ppid: number
	utime: number
	stime: number
	rss: number
}

/**
 * Parse the contents of a `/proc/<pid>/stat` file into its parent pid, CPU
 * ticks, and resident-set size (in bytes). Returns null when the line is
 * malformed or the parent pid cannot be determined.
 */
export function parseProcStat(content: string, pageSize = 4096): ProcStat | null {
	// The comm field (field 2) is wrapped in parens and may itself contain
	// spaces or parens, so split after the final ')'.
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
 * Convert a delta of CPU ticks over an elapsed window into a percentage of
 * total CPU capacity (0–100, clamped at 0). `ticksPerSec` is the kernel's
 * USER_HZ, conventionally 100 on Linux.
 */
export function cpuPercentFromTicks(
	tickDelta: number,
	elapsedMs: number,
	numCpus: number,
	ticksPerSec = 100,
): number {
	if (elapsedMs <= 0 || numCpus <= 0) return 0

	const elapsedSec = elapsedMs / 1000
	const cpuPercent = (tickDelta / ticksPerSec / elapsedSec / numCpus) * 100

	return Math.max(0, cpuPercent)
}
