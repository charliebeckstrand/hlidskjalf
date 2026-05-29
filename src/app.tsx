import { useInput } from 'ink'
import { useState } from 'react'

import { useCursor } from './hooks/use-cursor.js'
import { useRunner } from './hooks/use-runner.js'
import type { Options } from './types.js'
import { Dashboard } from './views/dashboard.js'
import { Help } from './views/help.js'
import { Loading } from './views/loading.js'

interface Props {
	options: Options
}

export function App({ options }: Props) {
	const { processes, loading, stop, stopProcess, restartProcess, clearLogs } = useRunner(options)

	const [showHelp, setShowHelp] = useState(false)

	const cursor = useCursor(processes.length, !loading && !showHelp)

	useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) {
			stop()
			return
		}

		if (input === '?') {
			setShowHelp((open) => !open)
			return
		}

		// While the help overlay is open it captures all other input; Esc closes it.
		if (showHelp) {
			if (key.escape) setShowHelp(false)
			return
		}

		const selected = processes[cursor]

		if (!selected) return

		if (input === 's') {
			if (selected.status === 'stopped') {
				restartProcess(selected.workspace.name)
			} else {
				stopProcess(selected.workspace.name)
			}
		}

		if (input === 'r') restartProcess(selected.workspace.name)

		if (input === 'c') clearLogs(selected.workspace.name)
	})

	if (loading) return <Loading title={options.title} />

	if (showHelp) return <Help title={options.title} />

	return (
		<Dashboard
			processes={processes}
			selectedIndex={cursor}
			title={options.title}
			metrics={options.metrics}
		/>
	)
}
