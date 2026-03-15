import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { parseLine, stripAnsi } from './parser.js'
import type { Process, Status, Workspace } from './types.js'

const MAX_LOGS = 500
const ERROR_RECOVERY_MS = 5000
const MAX_RESTART_RETRIES = 3
const RESTART_DELAY_MS = 1000
const STARTUP_TIMEOUT_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 10_000
const STALE_THRESHOLD_MS = 60_000

interface RunnerEvents {
	change: []
}

export interface Runner extends EventEmitter<RunnerEvents> {
	get(name: string): Process | undefined
	start(workspaces: Workspace[]): Promise<void>
	shutdown(): Promise<void>
}

class ProcessRunner extends EventEmitter<RunnerEvents> implements Runner {
	private children = new Map<string, ChildProcess>()
	private state = new Map<string, Process>()
	private errorTimers = new Map<string, ReturnType<typeof setTimeout>>()
	private lastGoodStatus = new Map<string, Status>()
	private restartRetries = new Map<string, number>()
	private restartTimers = new Map<string, ReturnType<typeof setTimeout>>()
	private startupTimers = new Map<string, ReturnType<typeof setTimeout>>()
	private lastOutputAt = new Map<string, number>()
	private pendingRebuilds = new Set<ChildProcess>()
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null
	private root: string
	private stopping = false
	private allWorkspaces: Workspace[] = []

	constructor(root: string) {
		super()
		this.root = root
	}

	get(name: string): Process | undefined {
		return this.state.get(name)
	}

	async start(workspaces: Workspace[]): Promise<void> {
		this.allWorkspaces = workspaces

		const packages = workspaces.filter((w) => w.kind === 'package')
		const apps = workspaces.filter((w) => w.kind !== 'package')

		for (const workspace of workspaces) {
			this.state.set(workspace.name, { workspace, status: 'pending', logs: [] })
		}

		for (const workspace of packages) {
			this.spawn(workspace)
		}

		if (packages.length > 0) {
			await this.waitForPackages(packages.map((p) => p.name))
		}

		// Warn apps about failed package dependencies before spawning
		const failedPackages = new Set<string>()
		for (const pkg of packages) {
			const s = this.state.get(pkg.name)?.status
			if (s === 'error' || s === 'stopped' || s === 'timeout') {
				failedPackages.add(pkg.name)
			}
		}

		for (const workspace of apps) {
			const failedDeps = workspace.deps.filter((d) => failedPackages.has(d))
			if (failedDeps.length > 0) {
				const proc = this.state.get(workspace.name)
				if (proc) {
					proc.logs.push(
						`[hlidskjalf] warning: dependency ${failedDeps.join(', ')} failed — starting anyway`,
					)
					this.emit('change')
				}
			}
			this.spawn(workspace)
		}

		this.startHeartbeat()
	}

	async shutdown(): Promise<void> {
		this.stopping = true

		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
		for (const timer of this.errorTimers.values()) clearTimeout(timer)
		for (const timer of this.restartTimers.values()) clearTimeout(timer)
		for (const timer of this.startupTimers.values()) clearTimeout(timer)
		this.errorTimers.clear()
		this.restartTimers.clear()
		this.startupTimers.clear()

		for (const child of this.pendingRebuilds) child.kill('SIGTERM')

		const waiting: Promise<void>[] = []

		for (const [, child] of this.children) {
			if (child.exitCode !== null || child.signalCode !== null) continue

			waiting.push(
				new Promise((resolve) => {
					const escalate = setTimeout(() => {
						if (child.exitCode === null) child.kill('SIGKILL')
					}, 5000)

					child.on('close', () => {
						clearTimeout(escalate)
						resolve()
					})

					child.kill('SIGTERM')
				}),
			)
		}

		await Promise.all(waiting)
	}

	private waitForPackages(names: string[]): Promise<void> {
		const remaining = new Set(names)

		return new Promise((resolve) => {
			const check = () => {
				for (const name of [...remaining]) {
					const s = this.state.get(name)?.status
					if (s === 'watching' || s === 'error' || s === 'stopped' || s === 'timeout')
						remaining.delete(name)
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
			env: { ...process.env, FORCE_COLOR: '1' },
		})

		this.children.set(workspace.name, child)
		this.setStatus(workspace.name, 'building')

		// Set startup timeout
		const startupTimer = setTimeout(() => {
			this.startupTimers.delete(workspace.name)
			const proc = this.state.get(workspace.name)
			if (proc && proc.status !== 'watching' && proc.status !== 'ready') {
				proc.logs.push(
					`[hlidskjalf] startup timeout after ${STARTUP_TIMEOUT_MS / 1000}s`,
				)
				this.setStatus(workspace.name, 'timeout')
			}
		}, STARTUP_TIMEOUT_MS)
		startupTimer.unref()
		this.startupTimers.set(workspace.name, startupTimer)

		let buffer = ''

		const onData = (data: Buffer) => {
			buffer += data.toString()
			const lines = buffer.split('\n')
			buffer = lines.pop()!
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

			this.handleUnexpectedExit(workspace, code, signal)
		})

		child.on('error', () => this.setStatus(workspace.name, 'error'))
	}

	private handleLine(name: string, line: string): void {
		const proc = this.state.get(name)
		if (!proc) return

		proc.logs.push(line)
		if (proc.logs.length > MAX_LOGS) proc.logs.splice(0, proc.logs.length - MAX_LOGS)

		this.lastOutputAt.set(name, Date.now())

		const { status, url } = parseLine(stripAnsi(line))

		if (status) {
			if (status === 'error') {
				this.scheduleErrorRecovery(name)
			} else {
				this.lastGoodStatus.set(name, status)
				this.clearErrorTimer(name)
				this.restartRetries.delete(name)

				// Clear startup timer on successful status
				if (status === 'watching' || status === 'ready') {
					const timer = this.startupTimers.get(name)
					if (timer) {
						clearTimeout(timer)
						this.startupTimers.delete(name)
					}
				}
			}
			proc.status = status
		}

		if (url) proc.url = url

		this.emit('change')
	}

	private handleUnexpectedExit(workspace: Workspace, code: number | null, signal: string | null): void {
		if (code === 0) {
			this.setStatus(workspace.name, 'stopped')
			return
		}

		const retries = (this.restartRetries.get(workspace.name) ?? 0) + 1
		this.restartRetries.set(workspace.name, retries)

		const proc = this.state.get(workspace.name)

		if (retries > MAX_RESTART_RETRIES) {
			if (proc) {
				proc.logs.push(
					`[hlidskjalf] process exited ${MAX_RESTART_RETRIES} times — giving up.`,
				)
			}
			this.setStatus(workspace.name, 'error')
			return
		}

		const delay = RESTART_DELAY_MS * 2 ** (retries - 1)

		if (proc) {
			proc.logs.push(
				`[hlidskjalf] process exited unexpectedly (attempt ${retries}/${MAX_RESTART_RETRIES}) — restarting in ${delay / 1000}s...`,
			)
		}
		this.setStatus(workspace.name, 'error')

		// For SIGABRT (fsevents), rebuild before restarting
		if (signal === 'SIGABRT') {
			this.rebuildFsevents()
				.then(() => {
					if (!this.stopping) this.spawn(workspace)
				})
				.catch(() => this.setStatus(workspace.name, 'error'))
			return
		}

		const timer = setTimeout(() => {
			this.restartTimers.delete(workspace.name)
			if (!this.stopping) this.spawn(workspace)
		}, delay)
		timer.unref()
		this.restartTimers.set(workspace.name, timer)
	}

	private rebuildFsevents(): Promise<void> {
		return new Promise((resolve) => {
			const child = spawn('pnpm', ['rebuild', 'fsevents'], {
				cwd: this.root,
				stdio: 'pipe',
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
			for (const [name, proc] of this.state) {
				if (proc.status !== 'watching' && proc.status !== 'ready') continue
				const lastOutput = this.lastOutputAt.get(name)
				if (lastOutput && now - lastOutput > STALE_THRESHOLD_MS) {
					this.setStatus(name, 'stale')
				}
			}
		}, HEARTBEAT_INTERVAL_MS)
		this.heartbeatInterval.unref()
	}

	private scheduleErrorRecovery(name: string): void {
		this.clearErrorTimer(name)

		const timer = setTimeout(() => {
			this.errorTimers.delete(name)
			const proc = this.state.get(name)
			if (proc?.status === 'error') {
				this.setStatus(name, this.lastGoodStatus.get(name) ?? 'ready')
			}
		}, ERROR_RECOVERY_MS)

		timer.unref()
		this.errorTimers.set(name, timer)
	}

	private clearErrorTimer(name: string): void {
		const timer = this.errorTimers.get(name)
		if (timer) {
			clearTimeout(timer)
			this.errorTimers.delete(name)
		}
	}

	private setStatus(name: string, status: Status): void {
		const proc = this.state.get(name)
		if (!proc) return
		proc.status = status

		// Notify dependents when a package enters error state
		if (status === 'error' && proc.workspace.kind === 'package') {
			this.notifyDependents(name)
		}

		this.emit('change')
	}

	private notifyDependents(failedName: string): void {
		for (const workspace of this.allWorkspaces) {
			if (!workspace.deps.includes(failedName)) continue
			const proc = this.state.get(workspace.name)
			if (proc) {
				proc.logs.push(`[hlidskjalf] warning: dependency ${failedName} entered error state`)
			}
		}
	}
}

export function createRunner(root: string): Runner {
	return new ProcessRunner(root)
}
