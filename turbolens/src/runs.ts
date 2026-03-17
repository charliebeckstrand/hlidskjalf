import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RunSummary, RunSummaryTask } from './types.js'

function parseTask(raw: Record<string, unknown>): RunSummaryTask | null {
	const taskId = typeof raw.taskId === 'string' ? raw.taskId : ''
	if (!taskId) return null

	const parts = taskId.split('#')
	const pkg = parts.length > 1 ? parts.slice(0, -1).join('#') : ''
	const task = parts.at(-1) ?? ''

	const cacheState = raw.cache ?? raw.cacheState
	let cacheHit = false
	if (cacheState && typeof cacheState === 'object') {
		const cs = cacheState as Record<string, unknown>
		cacheHit = cs.local === true || cs.remote === true
	}

	const execution = raw.execution as Record<string, unknown> | undefined

	return {
		taskId,
		package: pkg,
		task,
		hash: typeof raw.hash === 'string' ? raw.hash : '',
		cacheHit,
		durationMs:
			typeof execution?.exitCode === 'number'
				? Number(execution?.duration ?? 0)
				: typeof raw.duration === 'number'
					? raw.duration
					: 0,
		command: typeof raw.command === 'string' ? raw.command : '',
		outputs: Array.isArray(raw.outputs) ? (raw.outputs as string[]) : [],
	}
}

export function readRunSummaries(root: string): RunSummary[] {
	const runsDir = join(root, '.turbo', 'runs')

	let files: string[]
	try {
		files = readdirSync(runsDir).filter((f) => f.endsWith('.json'))
	} catch {
		return []
	}

	const summaries: RunSummary[] = []

	for (const file of files) {
		try {
			const raw = JSON.parse(readFileSync(join(runsDir, file), 'utf-8'))
			const tasks: RunSummaryTask[] = []

			const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : []
			for (const t of rawTasks) {
				const parsed = parseTask(t)
				if (parsed) tasks.push(parsed)
			}

			const cacheHitCount = tasks.filter((t) => t.cacheHit).length
			const cacheMissCount = tasks.filter((t) => !t.cacheHit).length

			const startTime = raw.startedAt ?? raw.monorepo?.startedAt ?? raw.executionSummary?.startedAt
			const duration = raw.executionSummary?.duration ?? raw.duration ?? raw.monorepo?.duration ?? 0

			summaries.push({
				id: file.replace(/\.json$/, ''),
				startedAt: startTime ? new Date(startTime) : new Date(0),
				durationMs: typeof duration === 'number' ? duration : 0,
				tasks,
				cacheHitCount,
				cacheMissCount,
			})
		} catch {
			// skip malformed files
		}
	}

	summaries.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
	return summaries
}
