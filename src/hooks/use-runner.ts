import { useApp } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Runner } from '../processes.js'
import { createRunner } from '../processes.js'
import type { Options, Process } from '../types.js'
import { discover, filterWorkspaces, sortByDeps, sortByName } from '../workspaces.js'

interface UseRunnerResult {
	processes: Process[]
	loading: boolean
	stop: () => void
	stopProcess: (name: string) => void
	restartProcess: (name: string) => void
}

export function useRunner(options: Options): UseRunnerResult {
	const { exit } = useApp()

	const [loading, setLoading] = useState(true)
	const [processes, setProcesses] = useState<Process[]>([])

	const runnerRef = useRef<Runner | null>(null)
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

			runner.on('change', () => {
				setProcesses(
					displayOrder.flatMap((name) => {
						const p = runner.get(name)

						return p ? [p] : []
					}),
				)
			})

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
		}
	}, [exit, options.filter, options.metrics, options.order, options.root, stop])

	const stopProcess = useCallback((name: string) => {
		runnerRef.current?.stopProcess(name)
	}, [])

	const restartProcess = useCallback((name: string) => {
		runnerRef.current?.restartProcess(name)
	}, [])

	return { processes, loading, stop, stopProcess, restartProcess }
}
