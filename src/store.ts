import { type ChildProcess, spawn } from 'node:child_process'
import { createHeartbeat, type Heartbeat } from './liveness.js'
import { appendLog } from './logs.js'
import { createMeter, type Meter, safeEnv } from './metrics.js'
import { parseLine, sanitizeForDisplay, stripAnsi } from './parser.js'
import type { Options, Process, SortOrder, Status, Workspace } from './types.js'
import { type Watcher, watchWorkspaces } from './watcher.js'
import { discover, filterWorkspaces, sortByDeps, sortByName } from './workspaces.js'

const ERROR_RECOVERY_MS = 5000
const MAX_RESTART_RETRIES = 3
const RESTART_DELAY_MS = 1000
const STARTUP_TIMEOUT_MS = 120_000
const MAX_BUFFER_SIZE = 65_536
const MAX_LINE_LENGTH = 8192
/** Grace period after SIGTERM before a lingering child is force-killed with SIGKILL. */
const KILL_GRACE_MS = 5000

interface ProcessEntry {
	process: Process
	child: ChildProcess | null
	errorTimer: ReturnType<typeof setTimeout> | null
	restartTimer: ReturnType<typeof setTimeout> | null
	startupTimer: ReturnType<typeof setTimeout> | null
	lastGoodStatus: Status | null
	restartRetries: number
	lastOutputAt: number
	/** Set when stop/restart deliberately kills the child, so its close isn't treated as a crash. */
	intentionalExit: boolean
	/** True while a deliberate kill is in flight, so a second stop/restart doesn't stack a close handler. */
	teardownStarted: boolean
	/** Action to run once the in-flight teardown's child closes. The latest request wins. */
	onClose: (() => void) | null
	/** Status held before a SIGSTOP pause, to restore on resume; null when not paused. */
	pausedFrom: Status | null
}

export interface Store {
	/** Immutable, referentially stable between changes — for `useSyncExternalStore`. */
	getSnapshot(): Process[]
	subscribe(listener: () => void): () => void
	/** Discover, register, and begin spawning. Resolves false if no workspaces matched. */
	start(): Promise<boolean>
	shutdown(): Promise<void>
	stopProcess(name: string): void
	restartProcess(name: string): void
	/** Freeze a running process with SIGSTOP — its child stays alive but consumes no CPU. */
	pauseProcess(name: string): void
	/** Resume a paused process with SIGCONT, restoring the status it held before pausing. */
	resumeProcess(name: string): void
	/** Force-kill a process immediately (SIGKILL), skipping the graceful grace period; no restart. */
	killProcess(name: string): void
	clearLogs(name: string): void
	/** Register and spawn a workspace discovered after startup (watch mode). */
	addWorkspace(workspace: Workspace): void
	/** Stop and forget a workspace that no longer exists in discovery (watch mode). */
	removeWorkspace(name: string): void
}

// --- Child-process helpers (this store is their only consumer) -----------------

/** Whether a spawned child is still running (exists and the OS hasn't reported it exiting). */
function isRunning(child: ChildProcess | null | undefined): child is ChildProcess {
	return !!child && child.exitCode === null && child.signalCode === null
}

/**
 * Terminate a dev child and everything it spawned. Dev processes run in their own
 * process group (see `spawn`), so a negative PID signals the whole group — without it,
 * `pnpm`'s grandchild (the real server) would be orphaned and keep holding its port.
 * Falls back to the bare child if the group is already gone.
 */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
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

/**
 * Arm a force-kill: SIGKILL the group if the child hasn't exited within the grace
 * period after its SIGTERM. Returns the unref'd timer so the caller can cancel it.
 */
function escalateKill(child: ChildProcess): ReturnType<typeof setTimeout> {
	const timer = setTimeout(() => {
		if (child.exitCode === null) killTree(child, 'SIGKILL')
	}, KILL_GRACE_MS)

	timer.unref()

	return timer
}

// --- Store ---------------------------------------------------------------------

class ProcessStore implements Store {
	private entries = new Map<string, ProcessEntry>()
	/** Display order of workspace names; the snapshot is built from this. */
	private order: string[] = []
	private listeners = new Set<() => void>()
	private snapshot: Process[] = []
	private dirty = true

	private pendingRebuilds = new Set<ChildProcess>()
	private heartbeat: Heartbeat | null = null
	private meter: Meter | null = null
	private watcher: Watcher | null = null
	private allWorkspaces: Workspace[] = []
	private stopping = false

	private readonly root: string
	private readonly order_: SortOrder
	private readonly filter?: string[]
	private readonly metricsEnabled: boolean
	private readonly watchEnabled: boolean

	constructor(opts: Options) {
		this.root = opts.root
		this.order_ = opts.order
		this.filter = opts.filter
		this.metricsEnabled = opts.metrics
		this.watchEnabled = opts.watch
	}

	// --- External-store interface ---

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener)

		return () => this.listeners.delete(listener)
	}

	getSnapshot(): Process[] {
		if (this.dirty) {
			this.snapshot = this.order.flatMap((name) => {
				const proc = this.entries.get(name)?.process

				return proc ? [proc] : []
			})

			this.dirty = false
		}

		return this.snapshot
	}

	/** Mark the snapshot stale and notify subscribers (React + internal waiters). */
	private changed(): void {
		this.dirty = true

		for (const listener of this.listeners) listener()
	}

	// --- Discovery ---

	private discoverFiltered(): Workspace[] {
		const found = discover(this.root)

		return this.filter ? filterWorkspaces(found, this.filter) : found
	}

	private sortForDisplay(workspaces: Workspace[]): Workspace[] {
		return this.order_ === 'run' ? sortByDeps(workspaces) : sortByName(workspaces)
	}

	// --- Lifecycle ---

	async start(): Promise<boolean> {
		const workspaces = this.discoverFiltered()

		if (workspaces.length === 0) return false

		const startOrder = sortByDeps(workspaces)

		const sorted = this.sortForDisplay(workspaces)

		this.order = sorted.map((w) => w.name)

		for (const workspace of workspaces) {
			this.entries.set(workspace.name, ProcessStore.newEntry(workspace))
		}

		this.changed()

		if (this.watchEnabled) {
			this.watcher = watchWorkspaces(this.root, () => this.rediscover())
		}

		// Spawn in the background; the dashboard already renders the pending list.
		void this.spawnAll(startOrder)

		return true
	}

	private async spawnAll(workspaces: Workspace[]): Promise<void> {
		this.allWorkspaces = workspaces

		const packages = workspaces.filter((w) => w.kind === 'package')
		const apps = workspaces.filter((w) => w.kind !== 'package')

		for (const workspace of packages) this.spawn(workspace)

		if (packages.length > 0) {
			await this.waitForPackages(packages.map((p) => p.name))
		}

		const failedPackages = new Set<string>()

		for (const pkg of packages) {
			const s = this.entries.get(pkg.name)?.process.status

			if (s === 'error' || s === 'stopped' || s === 'timeout') failedPackages.add(pkg.name)
		}

		for (const workspace of apps) {
			const failedDeps = workspace.deps.filter((d) => failedPackages.has(d))

			if (failedDeps.length > 0) {
				const entry = this.entries.get(workspace.name)

				if (entry) {
					this.note(entry, `warning: dependency ${failedDeps.join(', ')} failed — starting anyway`)

					this.changed()
				}
			}
			this.spawn(workspace)
		}

		this.heartbeat = createHeartbeat({
			entries: () => this.entries,
			setStatus: (name, status) => this.setStatus(name, status),
		})

		if (this.metricsEnabled) {
			this.meter = createMeter({
				roots: () => this.runningRoots(),
				setMetrics: (name, metrics) => {
					const entry = this.entries.get(name)

					if (!entry) return false

					entry.process.metrics = metrics

					return true
				},
				onChange: () => this.changed(),
			})
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

		this.watcher?.close()

		this.heartbeat?.stop()
		this.meter?.stop()

		for (const entry of this.entries.values()) this.clearTimers(entry)

		for (const child of this.pendingRebuilds) child.kill('SIGTERM')

		const waiting: Promise<void>[] = []
		for (const entry of this.entries.values()) {
			const { child } = entry

			if (!isRunning(child)) continue

			waiting.push(
				new Promise((resolve) => {
					const escalate = escalateKill(child)

					child.on('close', () => {
						clearTimeout(escalate)

						resolve()
					})

					killTree(child, 'SIGTERM')
				}),
			)
		}
		await Promise.all(waiting)
	}

	// --- Watch-mode reconciliation ---

	/**
	 * Re-run discovery after a package.json change: start workspaces that appeared, drop
	 * ones that vanished, and re-sort the display order.
	 */
	private rediscover(): void {
		if (this.stopping) return

		const fresh = this.discoverFiltered()

		const freshNames = new Set(fresh.map((w) => w.name))

		const currentNames = new Set(this.order)

		const added = fresh.filter((w) => !currentNames.has(w.name))

		const removed = [...currentNames].filter((name) => !freshNames.has(name))

		if (added.length === 0 && removed.length === 0) return

		for (const name of removed) this.removeWorkspace(name)

		for (const workspace of added) this.addWorkspace(workspace)

		this.order = this.sortForDisplay(fresh).map((w) => w.name)

		this.changed()
	}

	// --- Entry helpers ---

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
			pausedFrom: null,
		}
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
	 * Kill a live child and run `onClosed` once it exits, escalating to SIGKILL if it
	 * lingers. Calling this again while a teardown is already pending for the same child
	 * just swaps in the latest `onClosed` rather than stacking another `close` listener —
	 * otherwise a rapid stop/restart would fire two handlers and spawn duplicate servers.
	 * If the child is already gone, `onClosed` runs synchronously. `signal` is the initial
	 * termination signal (SIGTERM by default; SIGKILL for a force-kill); either way a
	 * lingering child is still escalated to SIGKILL after the grace period.
	 */
	private beginTeardown(
		entry: ProcessEntry,
		onClosed: () => void,
		signal: NodeJS.Signals = 'SIGTERM',
	): void {
		entry.intentionalExit = true

		const { child } = entry

		if (!isRunning(child)) {
			entry.child = null

			entry.pausedFrom = null

			onClosed()

			return
		}

		// A SIGSTOP'd child won't act on SIGTERM until it's continued, so wake it first;
		// otherwise the terminate would only land after the SIGKILL grace period elapsed.
		if (entry.pausedFrom !== null) {
			killTree(child, 'SIGCONT')

			entry.pausedFrom = null
		}

		// Latest request wins; the single close handler below reads this at close time.
		entry.onClose = onClosed

		if (!entry.teardownStarted) {
			entry.teardownStarted = true

			const escalate = escalateKill(child)

			child.on('close', () => {
				clearTimeout(escalate)

				entry.child = null

				entry.teardownStarted = false

				const action = entry.onClose

				entry.onClose = null

				action?.()
			})
		}

		killTree(child, signal)
	}

	private waitForPackages(names: string[]): Promise<void> {
		const remaining = new Set(names)

		return new Promise((resolve) => {
			const check = () => {
				for (const name of [...remaining]) {
					const s = this.entries.get(name)?.process.status

					if (s === 'watching' || s === 'error' || s === 'stopped' || s === 'timeout') {
						remaining.delete(name)
					}
				}

				if (remaining.size === 0) {
					this.listeners.delete(check)

					resolve()
				}
			}

			this.listeners.add(check)

			check()
		})
	}

	private spawn(workspace: Workspace): void {
		const child = spawn('pnpm', ['--filter', workspace.name, 'run', 'dev'], {
			cwd: this.root,
			stdio: 'pipe',
			env: safeEnv(),
			// Put each dev process in its own process group. Otherwise it shares ours, and
			// when a dev toolchain tears itself down by signalling its whole group
			// (`kill -- -<pgid>`), the signal also lands on hlidskjalf — whose SIGTERM
			// handler then exits the entire UI. A dedicated group also lets us reap the
			// real server under `pnpm` instead of orphaning it.
			detached: true,
		})

		const entry = this.entries.get(workspace.name)

		if (entry) {
			entry.child = child

			entry.intentionalExit = false

			entry.pausedFrom = null
		}

		this.setStatus(workspace.name, 'building')

		const startupTimer = setTimeout(() => {
			const e = this.entries.get(workspace.name)

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
			if (this.entries.get(workspace.name)?.intentionalExit) return

			this.handleUnexpectedExit(workspace, code, signal)
		})

		child.on('error', () => {
			const e = this.entries.get(workspace.name)

			if (e?.startupTimer) {
				clearTimeout(e.startupTimer)

				e.startupTimer = null
			}

			this.setStatus(workspace.name, 'error')
		})
	}

	private handleLine(name: string, raw: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

		if (!entry) return

		const line = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) : raw

		const { process: proc } = entry

		appendLog(proc.logs, sanitizeForDisplay(line))

		entry.lastOutputAt = Date.now()

		// A paused child is frozen; any output still draining from the pipe shouldn't
		// flip its status out of `paused`. Keep logging, but leave the status alone.
		if (entry.pausedFrom !== null) {
			this.changed()

			return
		}

		const prevStatus = proc.status

		if (proc.status === 'idle') proc.status = entry.lastGoodStatus ?? 'ready'

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

		// A status shift parsed from output tends to bracket a burst of CPU; refresh
		// metrics promptly rather than on the next poll.
		if (proc.status !== prevStatus) this.meter?.request()

		this.changed()
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

		const entry = this.entries.get(workspace.name)

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
					const e = this.entries.get(workspace.name)
					if (!this.stopping && e && !e.intentionalExit) this.spawn(workspace)
				})
				.catch(() => this.setStatus(workspace.name, 'error'))

			return
		}

		const timer = setTimeout(() => {
			entry.restartTimer = null

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

	private scheduleErrorRecovery(name: string): void {
		this.clearErrorTimer(name)

		const entry = this.entries.get(name)

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
		const entry = this.entries.get(name)

		if (entry?.errorTimer) {
			clearTimeout(entry.errorTimer)

			entry.errorTimer = null
		}
	}

	private setStatus(name: string, status: Status): void {
		const entry = this.entries.get(name)

		if (!entry) return

		const changed = entry.process.status !== status

		entry.process.status = status

		// A stopped process has no child left to meter; drop its last reading so the
		// dashboard doesn't keep showing stale CPU/memory for something that's gone.
		if (status === 'stopped') entry.process.metrics = undefined

		if (status === 'error' && entry.process.workspace.kind === 'package') {
			this.notifyDependents(name)
		}

		// A status change usually coincides with a shift in CPU use; pull a fresh sample.
		if (changed) this.meter?.request()

		this.changed()
	}

	stopProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

		if (!entry) return

		this.clearTimers(entry)

		const wasLive = isRunning(entry.child)

		this.beginTeardown(entry, () => {
			entry.restartRetries = 0

			this.setStatus(name, 'stopped')
		})

		if (wasLive) {
			this.note(entry, 'stopping process...')

			this.changed()
		}
	}

	restartProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

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

		const wasLive = isRunning(entry.child)

		this.beginTeardown(entry, doRestart)

		if (wasLive) {
			this.note(entry, 'stopping process for restart...')

			this.changed()
		}
	}

	pauseProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

		if (!entry) return

		// Nothing to freeze if there's no live child, and pausing twice is a no-op.
		if (!isRunning(entry.child) || entry.pausedFrom !== null) return

		// Freeze pending timers too: a startup/error/restart timer that fired while the
		// child is suspended would flip the status out from under `paused`.
		this.clearTimers(entry)

		entry.pausedFrom = entry.process.status

		killTree(entry.child, 'SIGSTOP')

		this.note(entry, 'paused (SIGSTOP)')

		this.setStatus(name, 'paused')
	}

	resumeProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

		if (!entry || entry.pausedFrom === null) return

		const restore = entry.pausedFrom

		entry.pausedFrom = null

		if (isRunning(entry.child)) killTree(entry.child, 'SIGCONT')

		// Reset the idle clock so the just-woken process isn't immediately probed for a
		// stall it never had while suspended.
		entry.lastOutputAt = Date.now()

		this.note(entry, 'resumed (SIGCONT)')

		this.setStatus(name, restore)
	}

	killProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entries.get(name)

		if (!entry) return

		this.clearTimers(entry)

		const wasLive = isRunning(entry.child)

		// SIGKILL straight away — no SIGTERM grace — for a wedged process that ignores
		// a polite stop. Like stop, this doesn't schedule a restart.
		this.beginTeardown(
			entry,
			() => {
				entry.restartRetries = 0

				this.setStatus(name, 'stopped')
			},
			'SIGKILL',
		)

		if (wasLive) {
			this.note(entry, 'killing process (SIGKILL)...')

			this.changed()
		}
	}

	clearLogs(name: string): void {
		const entry = this.entries.get(name)

		if (!entry) return

		// Mutate in place: the snapshot rebuild on `changed()` re-renders the empty panel.
		entry.process.logs.length = 0

		this.changed()
	}

	/**
	 * Register and start a workspace discovered after startup (watch mode). No-op if
	 * already tracked or shutting down. Spawned directly without startup dependency
	 * gating, since the packages it may depend on are up by now.
	 */
	addWorkspace(workspace: Workspace): void {
		if (this.stopping) return

		if (this.entries.has(workspace.name)) return

		this.allWorkspaces.push(workspace)

		this.entries.set(workspace.name, ProcessStore.newEntry(workspace))

		// Append so it shows immediately; `rediscover` re-sorts the order afterward.
		if (!this.order.includes(workspace.name)) this.order.push(workspace.name)

		this.spawn(workspace)
	}

	/**
	 * Stop and forget a workspace that no longer exists in discovery. Cancels pending
	 * timers and tears down the child's process group so its server frees its port, then
	 * drops all state so it disappears from the dashboard.
	 */
	removeWorkspace(name: string): void {
		const entry = this.entries.get(name)

		if (!entry) return

		this.clearTimers(entry)

		// Tear the child's group down so its server frees its port. Deleting the entry
		// also means the spawn close handler can't find it, so the exit is non-crashing.
		this.beginTeardown(entry, () => {})

		this.entries.delete(name)

		this.order = this.order.filter((n) => n !== name)

		this.allWorkspaces = this.allWorkspaces.filter((w) => w.name !== name)

		this.meter?.reset(name)

		this.changed()
	}

	private notifyDependents(failedName: string): void {
		for (const workspace of this.allWorkspaces) {
			if (!workspace.deps.includes(failedName)) continue

			const entry = this.entries.get(workspace.name)

			if (entry) this.note(entry, `warning: dependency ${failedName} entered error state`)
		}
	}
}

export function createStore(opts: Options): Store {
	return new ProcessStore(opts)
}
