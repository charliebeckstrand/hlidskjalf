import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { appendLog } from './logs.js'
import { Meter } from './meter.js'
import { safeEnv } from './metrics.js'
import { parseLine, sanitizeForDisplay, stripAnsi } from './parser.js'
import type { Process, Status, Workspace } from './types.js'

const ERROR_RECOVERY_MS = 5000
const MAX_RESTART_RETRIES = 3
const RESTART_DELAY_MS = 1000
const STARTUP_TIMEOUT_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 10_000
const IDLE_THRESHOLD_MS = 300_000
const MAX_BUFFER_SIZE = 65_536
const MAX_LINE_LENGTH = 8192
// Grace period after SIGTERM before a lingering child is force-killed with SIGKILL.
const KILL_GRACE_MS = 5000

/**
 * Whether a spawned child is still running — it exists and the OS hasn't reported
 * it exiting (`exitCode`) or being signalled (`signalCode`). Centralizes the
 * three-part check the lifecycle code would otherwise repeat (and risk getting
 * subtly wrong) at every teardown and metrics site.
 */
function isRunning(child: ChildProcess | null | undefined): child is ChildProcess {
	return !!child && child.exitCode === null && child.signalCode === null
}

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
	private meter: Meter | null = null
	private root: string
	private stopping = false
	private allWorkspaces: Workspace[] = []
	private metricsEnabled: boolean

	constructor(root: string, metrics = false) {
		super()

		this.root = root

		this.metricsEnabled = metrics
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
					this.note(entry, `warning: dependency ${failedDeps.join(', ')} failed — starting anyway`)

					this.emit('change')
				}
			}

			this.spawn(workspace)
		}

		this.startHeartbeat()

		if (this.metricsEnabled) {
			this.meter = new Meter({
				roots: () => this.runningRoots(),
				setMetrics: (name, metrics) => {
					const entry = this.entry(name)

					if (!entry) return false

					entry.process.metrics = metrics

					return true
				},
				onChange: () => this.emit('change'),
			})

			this.meter.start()
		}
	}

	/** Running root PIDs mapped to their workspace name, for the meter to sample. */
	private runningRoots(): Map<number, string> {
		const roots = new Map<number, string>()

		for (const [name, entry] of this.entries) {
			if (isRunning(entry.child) && entry.child.pid !== undefined) {
				roots.set(entry.child.pid, name)
			}
		}

		return roots
	}

	async shutdown(): Promise<void> {
		this.stopping = true

		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)

		this.meter?.stop()

		for (const entry of this.entries.values()) {
			if (entry.errorTimer) clearTimeout(entry.errorTimer)
			if (entry.restartTimer) clearTimeout(entry.restartTimer)
			if (entry.startupTimer) clearTimeout(entry.startupTimer)
		}

		for (const child of this.pendingRebuilds) child.kill('SIGTERM')

		const waiting: Promise<void>[] = []

		for (const entry of this.entries.values()) {
			const { child } = entry

			if (!isRunning(child)) continue

			waiting.push(
				new Promise((resolve) => {
					const escalate = this.escalateKill(child)

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

	/**
	 * Arm a force-kill: if the child hasn't exited within the grace period after
	 * its SIGTERM, SIGKILL its group. Returns the (unref'd) timer so the caller can
	 * cancel it from the child's `close` handler.
	 */
	private escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
		const timer = setTimeout(() => {
			if (child.exitCode === null) this.killTree(child, 'SIGKILL')
		}, KILL_GRACE_MS)

		timer.unref()

		return timer
	}

	/** Append an internal hlidskjalf status line to a process's (bounded) log buffer. */
	private note(entry: ProcessEntry, message: string): void {
		appendLog(entry.process.logs, `[hlidskjalf] ${message}`)
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

		if (!isRunning(child)) {
			entry.child = null

			onClosed()

			return
		}

		// Latest request wins; the single close handler below reads this at close time.
		entry.onClose = onClosed

		if (!entry.teardownStarted) {
			entry.teardownStarted = true

			const escalate = this.escalateKill(child)

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
					this.note(e, `startup timeout after ${STARTUP_TIMEOUT_MS / 1000}s`)

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
			this.note(entry, `process exited ${MAX_RESTART_RETRIES} times — giving up.`)

			this.setStatus(workspace.name, 'error')

			return
		}

		const delay = RESTART_DELAY_MS * 2 ** (restartRetries - 1)

		this.note(
			entry,
			`process exited unexpectedly (attempt ${restartRetries}/${MAX_RESTART_RETRIES}) — restarting in ${delay / 1000}s...`,
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

		const wasLive = isRunning(child)

		this.beginTeardown(entry, () => {
			entry.restartRetries = 0

			this.setStatus(name, 'stopped')
		})

		if (wasLive) {
			this.note(entry, 'stopping process...')

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

			this.note(entry, 'restarting process...')

			this.spawn(workspace)
		}

		this.clearTimers(entry)

		const { child } = entry

		const wasLive = isRunning(child)

		this.beginTeardown(entry, doRestart)

		if (wasLive) {
			this.note(entry, 'stopping process for restart...')

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

		this.meter?.reset(name)

		this.emit('change')
	}

	/**
	 * Ask the meter for a CPU/memory sample sooner than its next periodic poll —
	 * used when an event (start, restart, build, idle) likely shifted CPU use. A
	 * no-op unless metrics are enabled.
	 */
	private requestMetricsSample(): void {
		this.meter?.request()
	}

	private notifyDependents(failedName: string): void {
		for (const workspace of this.allWorkspaces) {
			if (!workspace.deps.includes(failedName)) continue

			const entry = this.entry(workspace.name)

			if (entry) {
				this.note(entry, `warning: dependency ${failedName} entered error state`)
			}
		}
	}
}

export function createRunner(root: string, metrics = false): Runner {
	return new ProcessRunner(root, metrics)
}
