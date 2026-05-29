import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'

import { appendLog } from './logs.js'
import {
	collectDescendants,
	cpuPercentFromTicks,
	parseProcStat,
	parsePsOutput,
	safeEnv,
	sumTickDeltas,
} from './metrics.js'
import { parseLine, sanitizeForDisplay, stripAnsi } from './parser.js'
import type { Process, Status, Workspace } from './types.js'

const ERROR_RECOVERY_MS = 5000
const MAX_RESTART_RETRIES = 3
const RESTART_DELAY_MS = 1000
const STARTUP_TIMEOUT_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 10_000
const METRICS_INTERVAL_MS = 3_000
// Floor on the gap between two CPU samples. Event-driven sampling can ask for a
// reading sooner than the periodic poll, but a delta measured over too short a
// window is dominated by tick-granularity noise, so never sample faster than this.
const MIN_METRICS_INTERVAL_MS = 1_000
const IDLE_THRESHOLD_MS = 300_000
const MAX_BUFFER_SIZE = 65_536
const MAX_LINE_LENGTH = 8192

interface ProcessEntry {
	process: Process
	child: ChildProcess | null
	errorTimer: ReturnType<typeof setTimeout> | null
	restartTimer: ReturnType<typeof setTimeout> | null
	startupTimer: ReturnType<typeof setTimeout> | null
	lastGoodStatus: Status | null
	restartRetries: number
	lastOutputAt: number
	/** Set when stop/restart deliberately kills the child, so its close event is not treated as a crash. */
	intentionalExit: boolean
	/** True while a deliberate kill is in flight, so a second stop/restart doesn't stack another close handler. */
	teardownStarted: boolean
	/** Action to run once the in-flight teardown's child closes. The latest request wins. */
	onClose: (() => void) | null
}

interface RunnerEvents {
	change: []
}

export interface Runner extends EventEmitter<RunnerEvents> {
	get(name: string): Process | undefined
	start(workspaces: Workspace[]): Promise<void>
	shutdown(): Promise<void>
	stopProcess(name: string): void
	restartProcess(name: string): void
	clearLogs(name: string): void
	addWorkspace(workspace: Workspace): void
	removeWorkspace(name: string): void
}

class ProcessRunner extends EventEmitter<RunnerEvents> implements Runner {
	private entries = new Map<string, ProcessEntry>()
	private pendingRebuilds = new Set<ChildProcess>()
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null
	private metricsTimer: ReturnType<typeof setTimeout> | null = null
	private lastMetricsAt = 0
	private root: string
	private stopping = false
	private allWorkspaces: Workspace[] = []
	private metricsEnabled: boolean
	private prevCpuSnapshot = new Map<string, { time: number; perPid: Map<number, number> }>()
	private numCpus: number

	constructor(root: string, metrics = false) {
		super()

		this.root = root

		this.metricsEnabled = metrics

		this.numCpus = os.availableParallelism()
	}

	private static newEntry(workspace: Workspace): ProcessEntry {
		return {
			process: { workspace, status: 'pending', logs: [] },
			child: null,
			errorTimer: null,
			restartTimer: null,
			startupTimer: null,
			lastGoodStatus: null,
			restartRetries: 0,
			lastOutputAt: 0,
			intentionalExit: false,
			teardownStarted: false,
			onClose: null,
		}
	}

	get(name: string): Process | undefined {
		return this.entries.get(name)?.process
	}

	async start(workspaces: Workspace[]): Promise<void> {
		this.allWorkspaces = workspaces

		const packages = workspaces.filter((w) => w.kind === 'package')
		const apps = workspaces.filter((w) => w.kind !== 'package')

		for (const workspace of workspaces) {
			this.entries.set(workspace.name, ProcessRunner.newEntry(workspace))
		}

		for (const workspace of packages) {
			this.spawn(workspace)
		}

		if (packages.length > 0) {
			await this.waitForPackages(packages.map((p) => p.name))
		}

		const failedPackages = new Set<string>()

		for (const pkg of packages) {
			const s = this.entries.get(pkg.name)?.process.status

			if (s === 'error' || s === 'stopped' || s === 'timeout') {
				failedPackages.add(pkg.name)
			}
		}

		for (const workspace of apps) {
			const failedDeps = workspace.deps.filter((d) => failedPackages.has(d))

			if (failedDeps.length > 0) {
				const entry = this.entries.get(workspace.name)

				if (entry) {
					entry.process.logs.push(
						`[hlidskjalf] warning: dependency ${failedDeps.join(', ')} failed — starting anyway`,
					)

					this.emit('change')
				}
			}

			this.spawn(workspace)
		}

		this.startHeartbeat()

		if (this.metricsEnabled) this.startMetrics()
	}

	async shutdown(): Promise<void> {
		this.stopping = true

		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
		if (this.metricsTimer) clearTimeout(this.metricsTimer)

		for (const entry of this.entries.values()) {
			if (entry.errorTimer) clearTimeout(entry.errorTimer)
			if (entry.restartTimer) clearTimeout(entry.restartTimer)
			if (entry.startupTimer) clearTimeout(entry.startupTimer)
		}

		for (const child of this.pendingRebuilds) child.kill('SIGTERM')

		const waiting: Promise<void>[] = []

		for (const entry of this.entries.values()) {
			const { child } = entry

			if (!child || child.exitCode !== null || child.signalCode !== null) continue

			waiting.push(
				new Promise((resolve) => {
					const escalate = setTimeout(() => {
						if (child.exitCode === null) this.killTree(child, 'SIGKILL')
					}, 5000)

					child.on('close', () => {
						clearTimeout(escalate)
						resolve()
					})

					this.killTree(child, 'SIGTERM')
				}),
			)
		}

		await Promise.all(waiting)
	}

	/**
	 * Terminate a dev child and everything it spawned. Dev processes run in their
	 * own group (see `spawn`), so a negative PID signals the whole group — without
	 * it, `pnpm`'s grandchild (the real server) would be orphaned and keep holding
	 * its port, breaking the next start. Falls back to the bare child if the group
	 * is already gone.
	 */
	private killTree(child: ChildProcess, signal: NodeJS.Signals): void {
		const { pid } = child

		if (pid !== undefined) {
			try {
				process.kill(-pid, signal)

				return
			} catch {
				// Group already exited, or the child never became a leader.
			}
		}

		try {
			child.kill(signal)
		} catch {
			// Already dead.
		}
	}

	private entry(name: string): ProcessEntry | undefined {
		return this.entries.get(name)
	}

	private clearTimers(entry: ProcessEntry): void {
		if (entry.restartTimer) {
			clearTimeout(entry.restartTimer)

			entry.restartTimer = null
		}
		if (entry.errorTimer) {
			clearTimeout(entry.errorTimer)

			entry.errorTimer = null
		}
		if (entry.startupTimer) {
			clearTimeout(entry.startupTimer)

			entry.startupTimer = null
		}
	}

	/**
	 * Kill a live child and run `onClosed` once it exits, escalating to SIGKILL if
	 * it lingers. Calling this again while a teardown is already pending for the
	 * same child just swaps in the latest `onClosed` rather than stacking another
	 * `close` listener — otherwise a rapid stop/restart would fire two handlers and
	 * spawn duplicate dev servers. If the child is already gone, `onClosed` runs
	 * synchronously.
	 */
	private beginTeardown(entry: ProcessEntry, onClosed: () => void): void {
		entry.intentionalExit = true

		const { child } = entry

		if (!child || child.exitCode !== null || child.signalCode !== null) {
			entry.child = null

			onClosed()

			return
		}

		// Latest request wins; the single close handler below reads this at close time.
		entry.onClose = onClosed

		if (!entry.teardownStarted) {
			entry.teardownStarted = true

			const escalate = setTimeout(() => {
				if (child.exitCode === null) this.killTree(child, 'SIGKILL')
			}, 5000)

			escalate.unref()

			child.on('close', () => {
				clearTimeout(escalate)

				entry.child = null

				entry.teardownStarted = false

				const action = entry.onClose

				entry.onClose = null

				action?.()
			})
		}

		this.killTree(child, 'SIGTERM')
	}

	private waitForPackages(names: string[]): Promise<void> {
		const remaining = new Set(names)

		return new Promise((resolve) => {
			const check = () => {
				for (const name of [...remaining]) {
					const s = this.entry(name)?.process.status

					if (s === 'watching' || s === 'error' || s === 'stopped' || s === 'timeout') {
						remaining.delete(name)
					}
				}

				if (remaining.size === 0) {
					this.off('change', check)

					resolve()
				}
			}

			this.on('change', check)

			check()
		})
	}

	private spawn(workspace: Workspace): void {
		const child = spawn('pnpm', ['--filter', workspace.name, 'run', 'dev'], {
			cwd: this.root,
			stdio: 'pipe',
			env: safeEnv(),
			// Put each dev process in its own process group. Otherwise it shares
			// ours, and when a dev toolchain tears itself down by signalling its
			// whole group (`kill -- -<pgid>`), the signal also lands on hlidskjalf
			// — whose SIGTERM handler then exits the entire UI. A dedicated group
			// also lets us reap the real server under `pnpm` instead of orphaning it.
			detached: true,
		})

		const entry = this.entry(workspace.name)

		if (entry) {
			entry.child = child
			entry.intentionalExit = false
		}

		this.setStatus(workspace.name, 'building')

		const startupTimer = setTimeout(() => {
			const e = this.entry(workspace.name)

			if (e) {
				e.startupTimer = null

				if (e.process.status !== 'watching' && e.process.status !== 'ready') {
					e.process.logs.push(`[hlidskjalf] startup timeout after ${STARTUP_TIMEOUT_MS / 1000}s`)

					this.setStatus(workspace.name, 'timeout')
				}
			}
		}, STARTUP_TIMEOUT_MS)

		startupTimer.unref()

		if (entry) entry.startupTimer = startupTimer

		let buffer = ''

		const onData = (data: Buffer) => {
			buffer += data.toString()

			if (!buffer.includes('\n') && buffer.length > MAX_BUFFER_SIZE) {
				this.handleLine(workspace.name, buffer)

				buffer = ''

				return
			}

			const lines = buffer.split('\n')

			buffer = lines.pop() ?? ''

			for (const raw of lines) {
				const line = raw.trimEnd()

				if (line) this.handleLine(workspace.name, line)
			}
		}

		child.stdout?.on('data', onData)
		child.stderr?.on('data', onData)

		child.on('close', (code, signal) => {
			if (buffer.trim()) this.handleLine(workspace.name, buffer.trimEnd())
			buffer = ''

			if (this.stopping) return

			// A deliberate stop/restart handles its own teardown; don't treat it as a crash.
			if (this.entry(workspace.name)?.intentionalExit) return

			this.handleUnexpectedExit(workspace, code, signal)
		})

		child.on('error', () => {
			const e = this.entry(workspace.name)

			if (e?.startupTimer) {
				clearTimeout(e.startupTimer)

				e.startupTimer = null
			}

			this.setStatus(workspace.name, 'error')
		})
	}

	private handleLine(name: string, raw: string): void {
		if (this.stopping) return

		const entry = this.entry(name)

		if (!entry) return

		const line = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) : raw

		const { process: proc } = entry

		appendLog(proc.logs, sanitizeForDisplay(line))

		entry.lastOutputAt = Date.now()

		const prevStatus = proc.status

		if (proc.status === 'idle') {
			proc.status = entry.lastGoodStatus ?? 'ready'
		}

		const { status, url } = parseLine(stripAnsi(line))

		if (status) {
			if (status === 'error') {
				this.scheduleErrorRecovery(name)
			} else {
				entry.lastGoodStatus = status

				this.clearErrorTimer(name)

				entry.restartRetries = 0

				if (status === 'watching' || status === 'ready') {
					if (entry.startupTimer) {
						clearTimeout(entry.startupTimer)

						entry.startupTimer = null
					}
				}
			}
			proc.status = status
		}

		if (url) proc.url = url

		// A status shift parsed from output (e.g. an in-process rebuild going
		// building → watching, or output resuming from idle) tends to bracket a
		// burst of CPU; refresh metrics promptly rather than on the next poll.
		if (proc.status !== prevStatus) this.requestMetricsSample()

		this.emit('change')
	}

	private handleUnexpectedExit(
		workspace: Workspace,
		code: number | null,
		signal: string | null,
	): void {
		if (code === 0) {
			this.setStatus(workspace.name, 'stopped')

			return
		}

		const entry = this.entry(workspace.name)
		if (!entry) return

		entry.restartRetries += 1

		const { restartRetries } = entry

		if (restartRetries > MAX_RESTART_RETRIES) {
			entry.process.logs.push(
				`[hlidskjalf] process exited ${MAX_RESTART_RETRIES} times — giving up.`,
			)

			this.setStatus(workspace.name, 'error')

			return
		}

		const delay = RESTART_DELAY_MS * 2 ** (restartRetries - 1)

		entry.process.logs.push(
			`[hlidskjalf] process exited unexpectedly (attempt ${restartRetries}/${MAX_RESTART_RETRIES}) — restarting in ${delay / 1000}s...`,
		)
		this.setStatus(workspace.name, 'error')

		if (signal === 'SIGABRT') {
			this.rebuildFsevents()
				.then(() => {
					// The workspace may have been stopped or removed while the rebuild ran;
					// only respawn if it's still tracked and no deliberate exit intervened.
					const e = this.entry(workspace.name)

					if (!this.stopping && e && !e.intentionalExit) this.spawn(workspace)
				})
				.catch(() => this.setStatus(workspace.name, 'error'))

			return
		}

		const timer = setTimeout(() => {
			if (entry) entry.restartTimer = null

			if (!this.stopping) this.spawn(workspace)
		}, delay)

		timer.unref()

		entry.restartTimer = timer
	}

	private rebuildFsevents(): Promise<void> {
		return new Promise((resolve) => {
			const child = spawn('pnpm', ['rebuild', 'fsevents'], {
				cwd: this.root,
				stdio: 'pipe',
				env: safeEnv(),
			})

			this.pendingRebuilds.add(child)

			const done = () => {
				this.pendingRebuilds.delete(child)

				resolve()
			}

			child.on('close', done)
			child.on('error', done)
		})
	}

	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			const now = Date.now()

			for (const [name, entry] of this.entries) {
				const { status } = entry.process

				const url = entry.process.url

				if (status === 'idle' && url) {
					this.probeUrl(url).then((alive) => {
						// The probe is async; bail if the process was stopped/restarted in
						// the meantime so we don't resurrect it to a running status.
						if (alive && entry.process.status === 'idle') {
							entry.lastOutputAt = Date.now()

							this.setStatus(name, entry.lastGoodStatus ?? 'ready')
						}
					})

					continue
				}

				if (status !== 'watching' && status !== 'ready') continue

				if (entry.lastOutputAt && now - entry.lastOutputAt > IDLE_THRESHOLD_MS) {
					if (url) {
						this.probeUrl(url).then((alive) => {
							if (alive) {
								entry.lastOutputAt = Date.now()
							} else if (entry.process.status === 'watching' || entry.process.status === 'ready') {
								this.setStatus(name, 'idle')
							}
						})
					} else {
						this.setStatus(name, 'idle')
					}
				}
			}
		}, HEARTBEAT_INTERVAL_MS)
		this.heartbeatInterval.unref()
	}

	private async probeUrl(url: string): Promise<boolean> {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(3000) })

			// Any response means the server is alive; drain the body so the socket frees.
			await res.body?.cancel()

			return true
		} catch {
			return false
		}
	}

	private scheduleErrorRecovery(name: string): void {
		this.clearErrorTimer(name)
		const entry = this.entry(name)

		if (!entry) return

		const timer = setTimeout(() => {
			entry.errorTimer = null

			if (entry.process.status === 'error') {
				this.setStatus(name, entry.lastGoodStatus ?? 'ready')
			}
		}, ERROR_RECOVERY_MS)

		timer.unref()

		entry.errorTimer = timer
	}

	private clearErrorTimer(name: string): void {
		const entry = this.entry(name)

		if (entry?.errorTimer) {
			clearTimeout(entry.errorTimer)

			entry.errorTimer = null
		}
	}

	private setStatus(name: string, status: Status): void {
		const entry = this.entry(name)

		if (!entry) return

		const changed = entry.process.status !== status

		entry.process.status = status

		// A stopped process has no child left to meter; drop its last reading so the
		// dashboard doesn't keep showing stale CPU/memory for something that's gone.
		if (status === 'stopped') entry.process.metrics = undefined

		if (status === 'error' && entry.process.workspace.kind === 'package') {
			this.notifyDependents(name)
		}

		// A status change (start/restart/stop/build/idle) usually coincides with a
		// shift in CPU use; pull a fresh sample so it shows up without waiting for
		// the next periodic poll.
		if (changed) this.requestMetricsSample()

		this.emit('change')
	}

	stopProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entry(name)

		if (!entry) return

		this.clearTimers(entry)

		const { child } = entry

		const wasLive = !!child && child.exitCode === null && child.signalCode === null

		this.beginTeardown(entry, () => {
			entry.restartRetries = 0

			this.setStatus(name, 'stopped')
		})

		if (wasLive) {
			entry.process.logs.push('[hlidskjalf] stopping process...')

			this.emit('change')
		}
	}

	restartProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entry(name)

		if (!entry) return

		const workspace = entry.process.workspace

		const doRestart = () => {
			// A shutdown may have begun while the child was closing; don't respawn into it.
			if (this.stopping) return

			entry.restartRetries = 0

			entry.process.url = undefined

			entry.process.logs.push('[hlidskjalf] restarting process...')

			this.spawn(workspace)
		}

		this.clearTimers(entry)

		const { child } = entry

		const wasLive = !!child && child.exitCode === null && child.signalCode === null

		this.beginTeardown(entry, doRestart)

		if (wasLive) {
			entry.process.logs.push('[hlidskjalf] stopping process for restart...')

			this.emit('change')
		}
	}

	clearLogs(name: string): void {
		const entry = this.entry(name)

		if (!entry) return

		// Mutate in place: the UI reads this same array each frame, and emitting
		// `change` rebuilds the process list so React re-renders the empty panel.
		entry.process.logs.length = 0

		this.emit('change')
	}

	/**
	 * Register and start a workspace discovered after startup (e.g. when a new
	 * `package.json` appears). No-op if it's already tracked or we're shutting
	 * down. Spawned directly without the startup dependency gating, since the
	 * already-running packages it may depend on are up by now.
	 */
	addWorkspace(workspace: Workspace): void {
		if (this.stopping) return

		if (this.entries.has(workspace.name)) return

		this.allWorkspaces.push(workspace)

		this.entries.set(workspace.name, ProcessRunner.newEntry(workspace))

		this.spawn(workspace)
	}

	/**
	 * Stop and forget a workspace that no longer exists in discovery. Cancels any
	 * pending timers and tears down the child's process group so its server frees
	 * its port, then drops all state so it disappears from the dashboard.
	 */
	removeWorkspace(name: string): void {
		const entry = this.entry(name)

		if (!entry) return

		this.clearTimers(entry)

		// Tear the child's group down so its server frees its port. Deleting the
		// entry below also means the spawn close handler can't find it, so the exit
		// is treated as non-crashing.
		this.beginTeardown(entry, () => {})

		this.entries.delete(name)

		this.allWorkspaces = this.allWorkspaces.filter((w) => w.name !== name)

		this.prevCpuSnapshot.delete(name)

		this.emit('change')
	}

	private startMetrics(): void {
		// Seed per-PID baselines immediately (this sample reports 0% CPU since it
		// has nothing to diff against) and arm the periodic fallback poll.
		this.collectMetrics()

		this.scheduleMetrics(METRICS_INTERVAL_MS)
	}

	/** (Re)arm the single metrics timer to fire after `delay`, then resume the periodic cadence. */
	private scheduleMetrics(delay: number): void {
		if (this.metricsTimer) clearTimeout(this.metricsTimer)

		this.metricsTimer = setTimeout(() => {
			this.metricsTimer = null

			this.collectMetrics()

			if (!this.stopping) this.scheduleMetrics(METRICS_INTERVAL_MS)
		}, delay)

		this.metricsTimer.unref()
	}

	/**
	 * Ask for a CPU/memory sample sooner than the next periodic poll — used when an
	 * event (start, restart, build, idle) likely shifted CPU use. Pulled no sooner
	 * than `MIN_METRICS_INTERVAL_MS` after the last sample so the diff window stays
	 * wide enough to be accurate; a no-op unless metrics are enabled.
	 */
	private requestMetricsSample(): void {
		if (!this.metricsEnabled || this.stopping) return

		const sinceLast = Date.now() - this.lastMetricsAt

		this.scheduleMetrics(Math.max(0, MIN_METRICS_INTERVAL_MS - sinceLast))
	}

	private collectMetrics(): void {
		if (this.stopping) return

		this.lastMetricsAt = Date.now()

		const rootPids = new Map<number, string>()

		for (const [name, entry] of this.entries) {
			const pid = entry.child?.pid

			if (pid && entry.child?.exitCode === null) {
				rootPids.set(pid, name)
			}
		}

		if (rootPids.size === 0) return

		if (process.platform === 'linux') {
			this.collectMetricsProc(rootPids)
		} else {
			this.collectMetricsPs(rootPids)
		}
	}

	private collectMetricsProc(rootPids: Map<number, string>): void {
		const tree = this.readProcTree()

		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of rootPids) {
			const pids = collectDescendants(rootPid, tree.children)

			const updated = this.applyMetrics(name, pids, now, (pid) => {
				const stat = tree.stats.get(pid)

				return stat ? { ticks: stat.utime + stat.stime, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}

		if (changed) this.emit('change')
	}

	private collectMetricsPs(rootPids: Map<number, string>): void {
		let output: string

		try {
			output = execFileSync('ps', ['-eo', 'pid,ppid,time,rss'], {
				encoding: 'utf8',
				timeout: 5000,
			})
		} catch {
			return
		}

		const { children, stats } = parsePsOutput(output)

		const now = Date.now()

		let changed = false

		for (const [rootPid, name] of rootPids) {
			const pids = collectDescendants(rootPid, children)

			const updated = this.applyMetrics(name, pids, now, (pid) => {
				const stat = stats.get(pid)

				return stat ? { ticks: stat.cputimeTicks, rss: stat.rss } : undefined
			})

			changed = changed || updated
		}

		if (changed) this.emit('change')
	}

	/**
	 * Diff a workspace's process tree against its previous snapshot to derive CPU%
	 * and total RSS, then store the new snapshot. CPU is summed per-PID (see
	 * `sumTickDeltas`) so a child that appears mid-startup can't dump its
	 * since-birth ticks into one interval. Returns whether a tracked process was
	 * updated.
	 */
	private applyMetrics(
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

		const entry = this.entry(name)

		if (!entry) return false

		entry.process.metrics = { cpu, mem: totalMem }

		return true
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

	private notifyDependents(failedName: string): void {
		for (const workspace of this.allWorkspaces) {
			if (!workspace.deps.includes(failedName)) continue

			const entry = this.entry(workspace.name)

			if (entry) {
				entry.process.logs.push(
					`[hlidskjalf] warning: dependency ${failedName} entered error state`,
				)
			}
		}
	}
}

export function createRunner(root: string, metrics = false): Runner {
	return new ProcessRunner(root, metrics)
}
