import { useApp, useInput } from 'ink'
import { useCallback, useState } from 'react'

import { useCacheData } from './hooks/use-cache-data.js'
import type { Options, View } from './types.js'
import { EntryDetail } from './views/entry-detail.js'
import { Loading } from './views/loading.js'
import { Overview } from './views/overview.js'
import { RunCompare } from './views/run-compare.js'
import { RunDetail } from './views/run-detail.js'
import { RunsList } from './views/runs-list.js'

interface Props {
	options: Options
}

export function App({ options }: Props) {
	const { entries, runs, stats, loading, refresh, removeEntry, clearAll } = useCacheData(options)
	const [view, setView] = useState<View>({ kind: 'overview' })
	const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
	const [marked, setMarked] = useState<Set<string>>(new Set())
	const { exit } = useApp()

	const navigate = useCallback((next: View) => {
		setView(next)
		setConfirmTarget(null)
	}, [])

	const toggleMark = useCallback((id: string) => {
		setMarked((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else if (next.size < 2) {
				next.add(id)
			}
			return next
		})
	}, [])

	const handleDelete = useCallback(
		(hash: string) => {
			removeEntry(hash)
			navigate({ kind: 'overview' })
		},
		[removeEntry, navigate],
	)

	const handleClearAll = useCallback(() => {
		clearAll()
		navigate({ kind: 'overview' })
	}, [clearAll, navigate])

	useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) {
			exit()
			return
		}

		// Confirmation handling
		if (confirmTarget) {
			if (input === 'y') {
				if (confirmTarget === '__all__') handleClearAll()
				else handleDelete(confirmTarget)
				setConfirmTarget(null)
			} else {
				setConfirmTarget(null)
			}
			return
		}

		// Back navigation
		if (key.escape) {
			if (view.kind === 'entry-detail') navigate({ kind: 'overview' })
			else if (view.kind === 'run-detail' || view.kind === 'run-compare')
				navigate({ kind: 'runs-list' })
			else if (view.kind === 'runs-list') navigate({ kind: 'overview' })
		}
	})

	if (loading) return <Loading title={options.title} />

	switch (view.kind) {
		case 'overview':
			return (
				<Overview
					entries={entries}
					stats={stats}
					runs={runs}
					navigate={navigate}
					onRefresh={refresh}
					confirmTarget={confirmTarget}
					setConfirmTarget={setConfirmTarget}
					title={options.title}
				/>
			)

		case 'entry-detail': {
			const entry = entries.find((e) => e.hash === view.hash)
			if (!entry) {
				navigate({ kind: 'overview' })
				return null
			}
			return <EntryDetail entry={entry} title={options.title} />
		}

		case 'runs-list':
			return (
				<RunsList
					runs={runs}
					navigate={navigate}
					marked={marked}
					toggleMark={toggleMark}
					title={options.title}
				/>
			)

		case 'run-detail': {
			const run = runs.find((r) => r.id === view.id)
			if (!run) {
				navigate({ kind: 'runs-list' })
				return null
			}
			return <RunDetail run={run} title={options.title} />
		}

		case 'run-compare': {
			const runA = runs.find((r) => r.id === view.ids[0])
			const runB = runs.find((r) => r.id === view.ids[1])
			if (!runA || !runB) {
				navigate({ kind: 'runs-list' })
				return null
			}
			return <RunCompare runA={runA} runB={runB} title={options.title} />
		}
	}
}
