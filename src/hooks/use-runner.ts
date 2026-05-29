import { useApp } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type Coalescer, createCoalescer } from '../coalesce.js'
import type { Runner } from '../processes.js'
import { createRunner } from '../processes.js'
import type { Options, Process } from '../types.js'
import { type Watcher, watchWorkspaces } from '../watcher.js'
import { discover, filterWorkspaces, sortByDeps, sortByName } from '../workspaces.js'

/**
 * Upper bound on how often the process list is re-rendered. The runner emits a
 * change per log line, so coalescing keeps React reconciliation to ~60fps no
 * matter how chatty the child processes are. State is always read fresh at
 * flush time, so the latest output still lands within one frame.
 */
const RENDER_THROTTLE_MS = 16

interface UseRunnerResult {
	processes: Process[]
	loading: boolean
	stop: () => void
	stopProcess: (name: string) => void
	restartProcess: (name: string) => void
	clearLogs: (name: string) => void
}

export function useRunner(options: Options): UseRunnerResult {
	const { exit } = useApp()

	const [loading, setLoading] = useState(true)
	const [processes, setProcesses] = useState<Process[]>([])

	const runnerRef = useRef<Runner | null>(null)
	const coalescerRef = useRef<Coalescer | null>(null)
	const watcherRef = useRef<Watcher | null>(null)
	// Display-order names and the workspaces currently tracked. Held in refs so
	// the watcher's re-discovery can mutate them without re-running the effect.
	const displayOrderRef = useRef<string[]>([])
	const stoppingRef = useRef(false)

	const stop = useCallback(() => {
		if (stoppingRef.current) return

		stoppingRef.current = true

		watcherRef.current?.close()

		const runner = runnerRef.current

		if (runner) {
			runner
				.shutdown()
				.catch(() => {})
				.finally(() => exit())
		} else {
			exit()
		}
	}, [exit])

	useEffect(() => {
		const discoverWorkspaces = () => {
			const found = discover(options.root)

			return options.filter ? filterWorkspaces(found, options.filter) : found
		}

		const sortForDisplay = (workspaces: ReturnType<typeof discoverWorkspaces>) =>
			options.order === 'run' ? sortByDeps(workspaces) : sortByName(workspaces)

		const run = async () => {
			const workspaces = discoverWorkspaces()

			if (workspaces.length === 0) {
				console.error('No matching workspaces found.')

				exit()

				return
			}

			const startOrder = sortByDeps(workspaces)

			const sorted = sortForDisplay(workspaces)

			displayOrderRef.current = sorted.map((w) => w.name)

			const runner = createRunner(options.root, options.metrics)

			runnerRef.current = runner

			setProcesses(sorted.map((w) => ({ workspace: w, status: 'pending', logs: [] })))

			// Read the latest state at flush time, not when the change fired, so a
			// coalesced burst still renders the most recent output.
			const rebuild = () => {
				setProcesses(
					displayOrderRef.current.flatMap((name) => {
						const p = runner.get(name)

						return p ? [p] : []
					}),
				)
			}

			const coalescer = createCoalescer(rebuild, RENDER_THROTTLE_MS)

			coalescerRef.current = coalescer

			runner.on('change', coalescer.schedule)

			// Re-run discovery when a package.json changes and reconcile the runner:
			// start workspaces that appeared, drop ones that vanished, and re-sort.
			if (options.watch) {
				const rediscover = () => {
					if (stoppingRef.current) return

					const fresh = discoverWorkspaces()

					const freshNames = new Set(fresh.map((w) => w.name))

					const currentNames = new Set(displayOrderRef.current)

					const added = fresh.filter((w) => !currentNames.has(w.name))

					const removed = [...currentNames].filter((name) => !freshNames.has(name))

					if (added.length === 0 && removed.length === 0) return

					for (const name of removed) runner.removeWorkspace(name)

					for (const workspace of added) runner.addWorkspace(workspace)

					displayOrderRef.current = sortForDisplay(fresh).map((w) => w.name)

					coalescer.schedule()
				}

				watcherRef.current = watchWorkspaces(options.root, rediscover)
			}

			setLoading(false)

			await runner.start(startOrder)
		}

		run().catch((err) => {
			console.error('Fatal:', err instanceof Error ? err.message : 'unexpected error')

			exit()
		})

		process.on('SIGTERM', stop)

		return () => {
			process.off('SIGTERM', stop)

			watcherRef.current?.close()

			coalescerRef.current?.cancel()
		}
	}, [exit, options.filter, options.metrics, options.order, options.root, options.watch, stop])

	const stopProcess = useCallback((name: string) => {
		runnerRef.current?.stopProcess(name)
	}, [])

	const restartProcess = useCallback((name: string) => {
		runnerRef.current?.restartProcess(name)
	}, [])

	const clearLogs = useCallback((name: string) => {
		runnerRef.current?.clearLogs(name)
	}, [])

	return { processes, loading, stop, stopProcess, restartProcess, clearLogs }
}
