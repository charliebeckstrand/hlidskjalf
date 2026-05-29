import { useInput } from 'ink'
import { useState } from 'react'

import type { Process } from '../types.js'
import { useCursor } from './use-cursor.js'

interface ControlsParams {
	processes: Process[]
	loading: boolean
	stop: () => void
	stopProcess: (name: string) => void
	restartProcess: (name: string) => void
	clearLogs: (name: string) => void
}

export interface Controls {
	/** Index of the highlighted workspace. */
	cursor: number
	/** Whether the help overlay is open. */
	showHelp: boolean
}

/**
 * Owns the app's keyboard-driven UI state and global key handling: workspace
 * selection (arrow keys, via `useCursor`), the help overlay toggle, and the
 * action keys (quit, stop/start, restart, clear logs). Selection is gated while
 * help is open or still loading, which is why the cursor lives here alongside
 * the toggle. Kept out of `App` so the component stays a thin composition of
 * runner state and views.
 */
export function useControls({
	processes,
	loading,
	stop,
	stopProcess,
	restartProcess,
	clearLogs,
}: ControlsParams): Controls {
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

	return { cursor, showHelp }
}
