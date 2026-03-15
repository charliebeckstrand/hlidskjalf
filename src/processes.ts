import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { parseLine, stripAnsi } from './parser.js'
import type { Process, Status, Workspace } from './types.js'

const MAX_LOGS = 500
const ERROR_RECOVERY_MS = 5000
const MAX_CRASH_RETRIES = 3

interface RunnerEvents {
	change: []
}

export interface Runner extends EventEmitter<RunnerEvents> {
	list(): Process[]
	get(name: string): Process | undefined
	start(workspaces: Workspace[]): Promise<void>
	shutdown(): Promise<void>
}

class ProcessRunner extends EventEmitter<RunnerEvents> implements Runner {
	private children = new Map<string, ChildProcess>()
	private state = new Map<string, Process>()
	private errorTimers = new Map<string, ReturnType<typeof setTimeout>>()
	private lastGoodStatus = new Map<string, Status>()
	private crashRetries = new Map<string, number>()
	private pendingRebuilds = new Set<ChildProcess>()
	private root: string
	private stopping = false

	constructor(root: string) {
		super()
		this.root = root
	}

	list(): Process[] {
		return [...this.state.values()]
	}

	get(name: string): Process | undefined {
		return this.state.get(name)
	}

	async start(workspaces: Workspace[]): Promise<void> {
		const packages = workspaces.filter((w) => w.kind === 'package')
		const apps = workspaces.filter((w) => w.kind === 'app')

		for (const workspace of workspaces) {
			this.state.set(workspace.name, { workspace, status: 'pending', logs: [] })
		}

		for (const workspace of packages) {
			this.spawn(workspace)
		}

		if (packages.length > 0) {
			await this.waitForPackages(packages.map((p) => p.name))
		}

		for (const workspace of apps) {
			this.spawn(workspace)
		}
	}

	async shutdown(): Promise<void> {
		this.stopping = true

		for (const timer of this.errorTimers.values()) clearTimeout(timer)
		this.errorTimers.clear()

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
					if (s === 'watching' || s === 'error' || s === 'stopped') remaining.delete(name)
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

		const onData = (data: Buffer) => {
			for (const raw of data.toString().split('\n')) {
				const line = raw.trimEnd()
				if (line) this.handleLine(workspace.name, line)
			}
		}

		child.stdout?.on('data', onData)
		child.stderr?.on('data', onData)

		child.on('close', (code, signal) => {
			if (this.stopping) return

			if (signal === 'SIGABRT') {
				this.handleCrash(workspace)
				return
			}

			this.setStatus(workspace.name, code === 0 ? 'stopped' : 'error')
		})

		child.on('error', () => this.setStatus(workspace.name, 'error'))
	}

	private handleLine(name: string, line: string): void {
		const proc = this.state.get(name)
		if (!proc) return

		proc.logs.push(line)
		if (proc.logs.length > MAX_LOGS) proc.logs.splice(0, proc.logs.length - MAX_LOGS)

		const { status, url } = parseLine(stripAnsi(line))

		if (status) {
			if (status === 'error') {
				this.scheduleErrorRecovery(name)
			} else {
				this.lastGoodStatus.set(name, status)
				this.clearErrorTimer(name)
			}
			proc.status = status
		}

		if (url) proc.url = url

		this.emit('change')
	}

	private handleCrash(workspace: Workspace): void {
		const retries = (this.crashRetries.get(workspace.name) ?? 0) + 1
		this.crashRetries.set(workspace.name, retries)

		const proc = this.state.get(workspace.name)

		if (retries <= MAX_CRASH_RETRIES) {
			if (proc) {
				proc.logs.push(
					`[hlidskjalf] fsevents crash detected (attempt ${retries}/${MAX_CRASH_RETRIES}) — rebuilding...`,
				)
			}
			this.emit('change')
			this.rebuildFsevents().then(() => {
				if (!this.stopping) this.spawn(workspace)
			})
		} else {
			if (proc) {
				proc.logs.push(
					`[hlidskjalf] fsevents still crashing after ${MAX_CRASH_RETRIES} attempts — giving up.`,
				)
			}
			this.setStatus(workspace.name, 'error')
		}
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
		this.emit('change')
	}
}

export function createRunner(root: string): Runner {
	return new ProcessRunner(root)
}
