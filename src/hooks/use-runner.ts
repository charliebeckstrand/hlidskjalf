import { useApp } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type Coalescer, createCoalescer } from '../coalesce.js'
import type { Runner } from '../processes.js'
import { createRunner } from '../processes.js'
import type { Options, Process } from '../types.js'
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
	const stoppingRef = useRef(false)

	const stop = useCallback(() => {
		if (stoppingRef.current) return

		stoppingRef.current = true

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
		const run = async () => {
			let workspaces = discover(options.root)

			if (options.filter) {
				workspaces = filterWorkspaces(workspaces, options.filter)
			}

			if (workspaces.length === 0) {
				console.error('No matching workspaces found.')

				exit()

				return
			}

			const startOrder = sortByDeps(workspaces)

			const sorted = options.order === 'run' ? startOrder : sortByName(workspaces)

			const displayOrder = sorted.map((w) => w.name)

			const runner = createRunner(options.root, options.metrics)

			runnerRef.current = runner

			setProcesses(sorted.map((w) => ({ workspace: w, status: 'pending', logs: [] })))

			// Read the latest state at flush time, not when the change fired, so a
			// coalesced burst still renders the most recent output.
			const rebuild = () => {
				setProcesses(
					displayOrder.flatMap((name) => {
						const p = runner.get(name)

						return p ? [p] : []
					}),
				)
			}

			const coalescer = createCoalescer(rebuild, RENDER_THROTTLE_MS)

			coalescerRef.current = coalescer

			runner.on('change', coalescer.schedule)

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

			coalescerRef.current?.cancel()
		}
	}, [exit, options.filter, options.metrics, options.order, options.root, stop])

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
