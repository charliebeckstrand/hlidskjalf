import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'

import { parseLine, sanitizeForDisplay, stripAnsi } from './parser.js'
import type { Process, Status, Workspace } from './types.js'

const MAX_LOGS = 500
const ERROR_RECOVERY_MS = 5000
const MAX_RESTART_RETRIES = 3
const RESTART_DELAY_MS = 1000
const STARTUP_TIMEOUT_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 10_000
const METRICS_INTERVAL_MS = 3_000
const IDLE_THRESHOLD_MS = 300_000
const MAX_BUFFER_SIZE = 65_536
const MAX_LINE_LENGTH = 8192

/** Allowlisted environment variable prefixes/names passed to child processes */
const ENV_ALLOWLIST = new Set([
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

function safeEnv(): Record<string, string | undefined> {
	const filtered: Record<string, string | undefined> = {}

	for (const key of Object.keys(process.env)) {
		if (ENV_ALLOWLIST.has(key)) {
			filtered[key] = process.env[key]
		}
	}

	filtered.FORCE_COLOR = '1'

	return filtered
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
}

class ProcessRunner extends EventEmitter<RunnerEvents> implements Runner {
	private entries = new Map<string, ProcessEntry>()
	private pendingRebuilds = new Set<ChildProcess>()
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null
	private metricsInterval: ReturnType<typeof setInterval> | null = null
	private root: string
	private stopping = false
	private allWorkspaces: Workspace[] = []
	private metricsEnabled: boolean
	private prevCpuSnapshot = new Map<string, { ticks: number; time: number }>()
	private numCpus: number

	constructor(root: string, metrics = false) {
		super()

		this.root = root

		this.metricsEnabled = metrics

		this.numCpus = os.cpus().length
	}

	get(name: string): Process | undefined {
		return this.entries.get(name)?.process
	}

	async start(workspaces: Workspace[]): Promise<void> {
		this.allWorkspaces = workspaces

		const packages = workspaces.filter((w) => w.kind === 'package')
		const apps = workspaces.filter((w) => w.kind !== 'package')

		for (const workspace of workspaces) {
			this.entries.set(workspace.name, {
				process: { workspace, status: 'pending', logs: [] },
				child: null,
				errorTimer: null,
				restartTimer: null,
				startupTimer: null,
				lastGoodStatus: null,
				restartRetries: 0,
				lastOutputAt: 0,
			})
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
		if (this.metricsInterval) clearInterval(this.metricsInterval)

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

	private entry(name: string): ProcessEntry | undefined {
		return this.entries.get(name)
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
		})

		const entry = this.entry(workspace.name)

		if (entry) entry.child = child

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

		proc.logs.push(sanitizeForDisplay(line))

		if (proc.logs.length > MAX_LOGS) proc.logs.splice(0, proc.logs.length - MAX_LOGS)

		entry.lastOutputAt = Date.now()

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
					if (!this.stopping) this.spawn(workspace)
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
						if (alive) {
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
							} else {
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

	private probeUrl(url: string): Promise<boolean> {
		return new Promise((resolve) => {
			const client = url.startsWith('https') ? https : http

			const req = client.get(url, { timeout: 3000 }, (res) => {
				res.resume()

				resolve(true)
			})

			req.on('error', () => resolve(false))

			req.on('timeout', () => {
				req.destroy()

				resolve(false)
			})
		})
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

		entry.process.status = status

		if (status === 'error' && entry.process.workspace.kind === 'package') {
			this.notifyDependents(name)
		}

		this.emit('change')
	}

	stopProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entry(name)

		if (!entry) return

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

		const { child } = entry

		if (!child || child.exitCode !== null || child.signalCode !== null) {
			this.setStatus(name, 'stopped')

			return
		}

		// Prevent handleUnexpectedExit from restarting
		entry.restartRetries = MAX_RESTART_RETRIES + 1

		const escalate = setTimeout(() => {
			if (child.exitCode === null) child.kill('SIGKILL')
		}, 5000)

		escalate.unref()

		child.on('close', () => {
			clearTimeout(escalate)

			entry.child = null

			entry.restartRetries = 0

			this.setStatus(name, 'stopped')
		})

		child.kill('SIGTERM')

		entry.process.logs.push('[hlidskjalf] stopping process...')

		this.emit('change')
	}

	restartProcess(name: string): void {
		if (this.stopping) return

		const entry = this.entry(name)

		if (!entry) return

		const workspace = entry.process.workspace

		const doRestart = () => {
			entry.restartRetries = 0

			entry.process.url = undefined

			entry.process.logs.push('[hlidskjalf] restarting process...')

			this.spawn(workspace)
		}

		const { child } = entry

		if (!child || child.exitCode !== null || child.signalCode !== null) {
			doRestart()

			return
		}

		// Prevent handleUnexpectedExit from restarting
		entry.restartRetries = MAX_RESTART_RETRIES + 1

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

		const escalate = setTimeout(() => {
			if (child.exitCode === null) child.kill('SIGKILL')
		}, 5000)

		escalate.unref()

		child.on('close', () => {
			clearTimeout(escalate)

			entry.child = null

			doRestart()
		})

		child.kill('SIGTERM')

		entry.process.logs.push('[hlidskjalf] stopping process for restart...')

		this.emit('change')
	}

	private startMetrics(): void {
		this.collectMetrics()

		this.metricsInterval = setInterval(() => this.collectMetrics(), METRICS_INTERVAL_MS)

		this.metricsInterval.unref()
	}

	private collectMetrics(): void {
		if (this.stopping) return

		const rootPids = new Map<number, string>()

		for (const [name, entry] of this.entries) {
			const pid = entry.child?.pid

			if (pid && entry.child?.exitCode === null) {
				rootPids.set(pid, name)
			}
		}

		if (rootPids.size === 0) return

		const tree = this.readProcTree()
		const now = Date.now()
		let changed = false

		for (const [rootPid, name] of rootPids) {
			const pids = this.collectDescendants(rootPid, tree.children)
			let totalTicks = 0
			let totalMem = 0

			for (const pid of pids) {
				const stat = tree.stats.get(pid)

				if (stat) {
					totalTicks += stat.utime + stat.stime
					totalMem += stat.rss
				}
			}

			const prev = this.prevCpuSnapshot.get(name)
			let cpuPercent = 0

			if (prev) {
				const elapsedMs = now - prev.time
				if (elapsedMs > 0) {
					const tickDelta = totalTicks - prev.ticks
					const elapsedSec = elapsedMs / 1000
					const ticksPerSec = 100
					cpuPercent = (tickDelta / ticksPerSec / elapsedSec / this.numCpus) * 100
					if (cpuPercent < 0) cpuPercent = 0
				}
			}

			this.prevCpuSnapshot.set(name, { ticks: totalTicks, time: now })

			const entry = this.entry(name)
			if (entry) {
				entry.process.metrics = { cpu: cpuPercent, mem: totalMem }
				changed = true
			}
		}

		if (changed) this.emit('change')
	}

	private readProcTree(): {
		children: Map<number, number[]>
		stats: Map<number, { utime: number; stime: number; rss: number }>
	} {
		const children = new Map<number, number[]>()
		const stats = new Map<number, { utime: number; stime: number; rss: number }>()
		const pageSize = 4096

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
				const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
				const closeParen = stat.lastIndexOf(')')
				if (closeParen === -1) continue
				const fields = stat.slice(closeParen + 2).split(' ')
				const ppid = Number.parseInt(fields[1], 10)
				const utime = Number.parseInt(fields[11], 10)
				const stime = Number.parseInt(fields[12], 10)
				const rss = Number.parseInt(fields[21], 10) * pageSize

				if (Number.isNaN(ppid)) continue
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

	private collectDescendants(rootPid: number, children: Map<number, number[]>): number[] {
		const result: number[] = []
		const stack = [rootPid]

		while (stack.length > 0) {
			const pid = stack.pop() as number
			result.push(pid)
			const kids = children.get(pid)
			if (kids) stack.push(...kids)
		}

		return result
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
