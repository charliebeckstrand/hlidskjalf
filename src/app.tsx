import { useInput } from 'ink'

import { useCursor } from './hooks/use-cursor.js'
import { useRunner } from './hooks/use-runner.js'
import type { Options } from './types.js'
import { Dashboard } from './views/dashboard.js'
import { Loading } from './views/loading.js'

interface Props {
	options: Options
}

export function App({ options }: Props) {
	const { processes, loading, stop, stopProcess, restartProcess } = useRunner(options)

	const cursor = useCursor(processes.length, !loading)

	useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) stop()

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
	})

	if (loading) return <Loading title={options.title} />

	return (
		<Dashboard
			processes={processes}
			selectedIndex={cursor}
			title={options.title}
			metrics={options.metrics}
		/>
	)
}
