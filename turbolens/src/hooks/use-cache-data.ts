import { useCallback, useEffect, useState } from 'react'

import { clearAllEntries, computeStats, deleteEntry, readCacheEntries } from '../cache.js'
import { readRunSummaries } from '../runs.js'
import type { CacheEntry, CacheStats, Options, RunSummary } from '../types.js'

interface CacheData {
	entries: CacheEntry[]
	runs: RunSummary[]
	stats: CacheStats
	loading: boolean
	refresh: () => void
	removeEntry: (hash: string) => void
	clearAll: () => void
}

export function useCacheData(options: Options): CacheData {
	const [entries, setEntries] = useState<CacheEntry[]>([])
	const [runs, setRuns] = useState<RunSummary[]>([])
	const [loading, setLoading] = useState(true)

	const scan = useCallback(() => {
		const cacheEntries = readCacheEntries(options.root, options.cacheDir)
		const runSummaries = readRunSummaries(options.root)
		setEntries(cacheEntries)
		setRuns(runSummaries)
		setLoading(false)
	}, [options.root, options.cacheDir])

	useEffect(() => {
		scan()
	}, [scan])

	const refresh = useCallback(() => {
		setLoading(true)
		scan()
	}, [scan])

	const removeEntry = useCallback(
		(hash: string) => {
			deleteEntry(options.root, hash, options.cacheDir)
			scan()
		},
		[options.root, options.cacheDir, scan],
	)

	const clearAllFn = useCallback(() => {
		clearAllEntries(options.root, options.cacheDir)
		scan()
	}, [options.root, options.cacheDir, scan])

	const stats = computeStats(entries)

	return { entries, runs, stats, loading, refresh, removeEntry, clearAll: clearAllFn }
}
