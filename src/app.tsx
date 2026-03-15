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
	const [message, setMessage] = useState('Starting...')
	const [processes, setProcesses] = useState<Process[]>([])
	const [cursor, setCursor] = useState(0)

	const runnerRef = useRef<Runner | null>(null)
	const stoppingRef = useRef(false)

	const stop = useCallback(() => {
		if (stoppingRef.current) return

		stoppingRef.current = true

		void runnerRef.current?.shutdown().then(() => exit())
	}, [exit])

	useEffect(() => {
		const run = async () => {
			setMessage('Discovering workspaces...')

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

			const displaySort = options.order === 'run' ? sortByDeps : sortByName

			const runner = createRunner(options.root)

			runnerRef.current = runner

			// Show all workspaces as pending immediately
			setProcesses(
				displaySort(workspaces).map((w) => ({ workspace: w, status: 'pending', logs: [] })),
			)

			runner.on('change', () => {
				const sorted = displaySort(runner.list().map((p) => p.workspace))

				setProcesses(
					sorted.flatMap((w) => {
						const p = runner.get(w.name)

						return p ? [p] : []
					}),
				)
			})

			setLoading(false)

			void runner.start(startOrder)
		}

		void run()

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
			setCursor((i) => i + 1)
		}
	})

	if (loading) return <Loading message={message} />

	return <Dashboard processes={processes} selectedIndex={cursor} />
}
