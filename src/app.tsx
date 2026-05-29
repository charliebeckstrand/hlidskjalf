import { useControls } from './hooks/use-controls.js'
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

	const { cursor, showHelp } = useControls({
		processes,
		loading,
		stop,
		stopProcess,
		restartProcess,
		clearLogs,
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
