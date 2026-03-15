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
	const { processes, loading, stop } = useRunner(options)
	const cursor = useCursor(processes.length, !loading)

	useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) stop()
	})

	if (loading) return <Loading />

	return <Dashboard processes={processes} selectedIndex={cursor} />
}
