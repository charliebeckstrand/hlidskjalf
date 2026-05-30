import type { Process, Workspace, WorkspaceKind } from '../src/types.js'

/**
 * Dev-server log lines, one per parser branch plus the dominant "no match" case.
 * Built once so the benchmark measures parsing, not fixture construction.
 */
export const LOG_LINES = {
	/** The dominant case: a line matching no status pattern. */
	plain: '[12:04:51] info  - compiled successfully in 1243 ms (482 modules)',
	/** Vite-style ready line carrying a local URL to extract. */
	ready: '  ➜  Local:   http://localhost:5173/',
	/** Pino-style readiness with an http origin. */
	listening: 'info: server listening on http://localhost:3000',
	/** Error branch — scans past every URL/ready matcher first. */
	error: '[ERROR] Failed to compile: Cannot find module "./missing"',
	/** Vite banner that matches on a regex without a URL capture group. */
	viteReady: '  VITE v5.4.2  ready in 318 ms',
	/** SGR colour codes only — what sanitizeForDisplay must preserve. */
	ansiHeavy: '[32m✓[0m [1m[36msrc/app.tsx[0m [2m(3 modules)[0m [33m1.2kb[0m',
	/** Cursor moves, screen clears and an OSC hyperlink — all stripped on display. */
	ansiControl: '[2K[1G]8;;http://localhost:3000\\open me]8;;\\[0m done',
	/** Oversized line: exceeds MAX_PARSE_LENGTH, forcing truncation + a full miss. */
	long: `${'lorem ipsum dolor sit amet '.repeat(160)}listening on http://localhost:8080`,
} as const

const KINDS: readonly WorkspaceKind[] = ['package', 'app', 'service']

/**
 * Build a deterministic monorepo of `count` workspaces, each depending on a few earlier
 * packages. Determinism keeps successive runs comparable against an identical graph.
 */
export function makeWorkspaces(count: number): Workspace[] {
	const workspaces: Workspace[] = []

	for (let i = 0; i < count; i++) {
		const deps: string[] = []

		for (let d = 1; d <= 3; d++) {
			const j = i - d * 2

			if (j >= 0) deps.push(`pkg-${j}`)
		}

		workspaces.push({ name: `pkg-${i}`, kind: KINDS[i % KINDS.length] as WorkspaceKind, deps })
	}

	return workspaces
}

/**
 * Wrap `count` synthetic workspaces as ready Process records, the shape the
 * dashboard's layout maths consumes each render.
 */
export function makeProcesses(count: number): Process[] {
	return makeWorkspaces(count).map((workspace) => ({
		workspace,
		status: 'ready' as const,
		logs: [],
	}))
}

/**
 * Build deterministic `ps -eo pid,ppid,time,rss` output for `count` processes in
 * a shallow tree, as parsePsOutput consumes in the metrics poll loop. TIME is
 * cumulative CPU time as `MM:SS`.
 */
export function makePsOutput(count: number): string {
	const lines = ['  PID  PPID     TIME   RSS']

	for (let i = 0; i < count; i++) {
		const pid = 1000 + i

		const ppid = i === 0 ? 1 : 1000 + Math.floor(i / 3)

		const totalSec = (i * 7) % 6000

		const time = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`

		const rssKb = 50_000 + ((i * 1024) % 4_000_000)

		lines.push(`${pid} ${ppid} ${time} ${rssKb}`)
	}

	return lines.join('\n')
}

/**
 * A realistic `/proc/<pid>/stat` line whose comm field contains both spaces and
 * parentheses, exercising the lastIndexOf(')') split in parseProcStat.
 */
export const PROC_STAT =
	'1234 (node (worker)) S 1 1234 1234 0 -1 4194560 18452 0 11 0 4521 1832 0 0 20 0 11 0 9876543 1284505600 4096 18446744073709551615'
