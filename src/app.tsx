import { useApp, useInput } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Runner } from './processes.js'
import { createRunner } from './processes.js'
import type { Options, Process } from './types.js'
import { Dashboard } from './views/dashboard.js'
import { Loading } from './views/loading.js'
import { discover, filterWorkspaces, sortByDeps, sortByName } from './workspaces.js'

interface Props {
	options: Options
}

export function App({ options }: Props) {
	const { exit } = useApp()

	const [loading, setLoading] = useState(true)
	const [processes, setProcesses] = useState<Process[]>([])
	const [cursor, setCursor] = useState(0)

	const runnerRef = useRef<Runner | null>(null)
	const stoppingRef = useRef(false)

	const stop = useCallback(() => {
		if (stoppingRef.current) return
		stoppingRef.current = true
		const runner = runnerRef.current
		if (runner) {
			void runner.shutdown().finally(() => exit())
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
			const runner = createRunner(options.root)

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
			console.error('Fatal:', err)
			exit()
		})

		process.on('SIGTERM', stop)

		return () => {
			process.off('SIGTERM', stop)
		}
	}, [exit, options.filter, options.order, options.root, stop])

	useInput((input, key) => {
		if (loading) return

		if (input === 'q' || (key.ctrl && input === 'c')) {
			stop()
			return
		}

		if (key.upArrow || input === 'k') {
			setCursor((i) => Math.max(0, i - 1))
		} else if (key.downArrow || input === 'j') {
			setCursor((i) => Math.min(processes.length - 1, i + 1))
		}
	})

	if (loading) return <Loading />

	return <Dashboard processes={processes} selectedIndex={cursor} />
}
