import { useApp, useInput } from 'ink'
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import { createStore } from './store/index.js'
import type { Options } from './types.js'
import { Help, Loading } from './views/chrome.js'
import { Dashboard } from './views/dashboard/index.js'

interface Props {
	options: Options
}

type Phase = 'loading' | 'running'

export function App({ options }: Props) {
	const { exit } = useApp()

	const [store] = useState(() => createStore(options))

	// Bridge the external store into React. The store notifies per output line; a chatty
	// dev server emits hundreds a second, and `useSyncExternalStore` schedules a
	// synchronous re-render on each. Forwarding every one trips React's nested-update
	// guard ("Maximum update depth exceeded") and pegs the CPU, so coalesce a burst into
	// one React update per event-loop turn. `getSnapshot` still returns the latest state
	// synchronously, so no output is dropped — only the render is batched.
	// (`useDeferredValue` below additionally de-prioritizes rendering that batched value.)
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			let pending: ReturnType<typeof setImmediate> | undefined

			const unsubscribe = store.subscribe(() => {
				if (pending) return

				pending = setImmediate(() => {
					pending = undefined

					onStoreChange()
				})
			})

			return () => {
				if (pending) clearImmediate(pending)

				unsubscribe()
			}
		},
		[store],
	)

	const getSnapshot = useCallback(() => store.getSnapshot(), [store])

	const live = useSyncExternalStore(subscribe, getSnapshot)

	const processes = useDeferredValue(live)

	const [phase, setPhase] = useState<Phase>('loading')

	const [showHelp, setShowHelp] = useState(false)

	const [cursorState, setCursor] = useState(0)

	const stopping = useRef(false)

	const stop = useCallback(() => {
		if (stopping.current) return

		stopping.current = true

		store
			.shutdown()
			.catch(() => {})
			.finally(() => exit())
	}, [store, exit])

	useEffect(() => {
		let active = true

		store
			.start()
			.then((started) => {
				if (!active) return

				if (started) {
					setPhase('running')
				} else {
					console.error('No matching workspaces found.')
					// Exit with an error so the CLI reports a non-zero status to its caller.
					exit(new Error('no matching workspaces'))
				}
			})
			.catch((err) => {
				console.error('Fatal:', err instanceof Error ? err.message : 'unexpected error')
				exit(err instanceof Error ? err : new Error('startup failed'))
			})

		process.on('SIGTERM', stop)

		return () => {
			active = false

			process.off('SIGTERM', stop)

			void store.shutdown()
		}
	}, [store, exit, stop])

	// Clamp to the live list length: a removed workspace shrinks the list under a
	// stationary cursor, so the actionable and highlighted indices can't diverge.
	const cursor = Math.min(cursorState, Math.max(0, processes.length - 1))

	useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) {
			stop()

			return
		}

		if (input === '?') {
			setShowHelp((open) => !open)

			return
		}

		// While help is open it captures all other input; Esc closes it.
		if (showHelp) {
			if (key.escape) setShowHelp(false)

			return
		}

		if (processes.length === 0) return

		if (key.upArrow || input === 'k') {
			setCursor((i) => Math.max(0, i - 1))

			return
		}

		if (key.downArrow || input === 'j') {
			setCursor((i) => Math.min(processes.length - 1, i + 1))

			return
		}

		const selected = processes[cursor]

		if (!selected) return

		const { name } = selected.workspace

		if (input === 's') {
			if (selected.status === 'stopped') store.restartProcess(name)
			else store.stopProcess(name)
		} else if (input === 'p') {
			if (selected.status === 'paused') store.resumeProcess(name)
			else store.pauseProcess(name)
		} else if (input === 'x') {
			store.killProcess(name)
		} else if (input === 'r') {
			store.restartProcess(name)
		} else if (input === 'c') {
			store.clearLogs(name)
		}
	})

	if (phase === 'loading') return <Loading title={options.title} />

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
