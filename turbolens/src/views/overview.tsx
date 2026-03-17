import { Box, Text, useInput, useStdout } from 'ink'
import { useMemo } from 'react'

import { formatAge, formatBytes, truncateHash } from '../format.js'
import { useCursor } from '../hooks/use-cursor.js'
import { colors, icons } from '../theme.js'
import type { CacheEntry, CacheStats, RunSummary, View } from '../types.js'
import { Header } from './header.js'

const HINTS = '↑/↓ j/k select  enter inspect  r runs  d delete  D clear all  q quit'

interface Props {
	entries: CacheEntry[]
	stats: CacheStats
	runs: RunSummary[]
	navigate: (view: View) => void
	onRefresh: () => void
	confirmTarget: string | null
	setConfirmTarget: (target: string | null) => void
	title: string
}

function StatsBar({ stats, runs }: { stats: CacheStats; runs: RunSummary[] }) {
	const latestRun = runs[0]
	const hitRate = latestRun
		? latestRun.cacheHitCount + latestRun.cacheMissCount > 0
			? Math.round(
					(latestRun.cacheHitCount / (latestRun.cacheHitCount + latestRun.cacheMissCount)) * 100,
				)
			: 0
		: null

	return (
		<Box paddingX={2} marginTop={1} gap={2}>
			<Text>
				<Text color={colors.accentBright} bold>
					{stats.entryCount}
				</Text>
				<Text color={colors.muted}> entries</Text>
			</Text>
			<Text>
				<Text color={colors.accentBright} bold>
					{formatBytes(stats.totalSizeBytes)}
				</Text>
				<Text color={colors.muted}> total</Text>
			</Text>
			{hitRate !== null && (
				<Text>
					<Text color={hitRate >= 80 ? colors.hit : hitRate >= 50 ? colors.warning : colors.miss}>
						{hitRate}%
					</Text>
					<Text color={colors.muted}> hit rate (latest run)</Text>
				</Text>
			)}
		</Box>
	)
}

function EntryRow({
	entry,
	selected,
	hashWidth,
}: {
	entry: CacheEntry
	selected: boolean
	hashWidth: number
}) {
	return (
		<Box paddingX={1}>
			<Text color={selected ? colors.highlight : colors.dim}>
				{selected ? icons.selected : icons.unselected}
			</Text>
			<Text> </Text>
			<Box width={hashWidth}>
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{truncateHash(entry.hash)}
				</Text>
			</Box>
			<Box width={12}>
				<Text color={colors.muted}>{formatBytes(entry.sizeBytes)}</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.dim}>{entry.files.length} files</Text>
			</Box>
			<Text color={colors.dim}>{formatAge(entry.createdAt)}</Text>
		</Box>
	)
}

export function Overview({
	entries,
	stats,
	runs,
	navigate,
	onRefresh,
	confirmTarget,
	setConfirmTarget,
	title,
}: Props) {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80
	const cursor = useCursor(entries.length, entries.length > 0 && !confirmTarget)

	const hashWidth = useMemo(
		() => Math.max(14, ...entries.map((e) => truncateHash(e.hash).length + 2)),
		[entries],
	)

	const safeIndex = Math.min(cursor, Math.max(0, entries.length - 1))

	useInput((input, key) => {
		if (confirmTarget) return

		if (key.return && entries.length > 0) {
			navigate({ kind: 'entry-detail', hash: entries[safeIndex].hash })
		} else if (input === 'r') {
			navigate({ kind: 'runs-list' })
		} else if (input === 'R') {
			onRefresh()
		} else if (input === 'd' && entries.length > 0) {
			setConfirmTarget(entries[safeIndex].hash)
		} else if (input === 'D' && entries.length > 0) {
			setConfirmTarget('__all__')
		}
	})

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />
			<StatsBar stats={stats} runs={runs} />

			{entries.length === 0 ? (
				<Box paddingX={2} marginTop={1}>
					<Text color={colors.muted}>No cache entries found.</Text>
				</Box>
			) : (
				<>
					{/* Table header */}
					<Box paddingX={1} marginLeft={1} marginTop={1}>
						<Box width={hashWidth}>
							<Text color={colors.muted} bold>
								Hash
							</Text>
						</Box>
						<Box width={12}>
							<Text color={colors.muted} bold>
								Size
							</Text>
						</Box>
						<Box width={10}>
							<Text color={colors.muted} bold>
								Files
							</Text>
						</Box>
						<Text color={colors.muted} bold>
							Age
						</Text>
					</Box>

					{entries.map((entry, i) => (
						<EntryRow
							key={entry.hash}
							entry={entry}
							selected={i === safeIndex}
							hashWidth={hashWidth}
						/>
					))}
				</>
			)}

			{confirmTarget && (
				<Box paddingX={2} marginTop={1}>
					<Text color={colors.warning}>
						{icons.confirm}{' '}
						{confirmTarget === '__all__'
							? 'Clear all cache entries?'
							: `Delete ${truncateHash(confirmTarget)}?`}{' '}
						<Text bold>y</Text>/<Text bold>n</Text>
					</Text>
				</Box>
			)}
		</Box>
	)
}
