import { Box, Text, useStdout } from 'ink'
import { useMemo } from 'react'

import { truncateHash } from '../format.js'
import { useCursor } from '../hooks/use-cursor.js'
import { colors, icons } from '../theme.js'
import type { RunSummary } from '../types.js'
import { Header } from './header.js'

const HINTS = '↑/↓ j/k scroll  esc back  q quit'

interface ComparisonRow {
	taskId: string
	hashA: string
	hashB: string
	cacheHitA: boolean
	cacheHitB: boolean
	changed: boolean
}

function buildComparison(a: RunSummary, b: RunSummary): ComparisonRow[] {
	const taskMap = new Map<string, ComparisonRow>()

	for (const task of a.tasks) {
		taskMap.set(task.taskId, {
			taskId: task.taskId,
			hashA: task.hash,
			hashB: '',
			cacheHitA: task.cacheHit,
			cacheHitB: false,
			changed: true,
		})
	}

	for (const task of b.tasks) {
		const existing = taskMap.get(task.taskId)
		if (existing) {
			existing.hashB = task.hash
			existing.cacheHitB = task.cacheHit
			existing.changed = existing.hashA !== task.hash
		} else {
			taskMap.set(task.taskId, {
				taskId: task.taskId,
				hashA: '',
				hashB: task.hash,
				cacheHitA: false,
				cacheHitB: task.cacheHit,
				changed: true,
			})
		}
	}

	const rows = [...taskMap.values()]
	rows.sort((a, b) => {
		if (a.changed !== b.changed) return a.changed ? -1 : 1
		return a.taskId.localeCompare(b.taskId)
	})
	return rows
}

function CompareRow({
	row,
	selected,
	idWidth,
}: {
	row: ComparisonRow
	selected: boolean
	idWidth: number
}) {
	return (
		<Box paddingX={1}>
			<Text color={selected ? colors.highlight : colors.dim}>
				{selected ? icons.selected : icons.unselected}
			</Text>
			<Text> </Text>
			<Box width={idWidth}>
				<Text
					color={selected ? colors.highlight : row.changed ? colors.warning : undefined}
					bold={selected || row.changed}
					wrap="truncate"
				>
					{row.taskId}
				</Text>
			</Box>
			<Box width={14}>
				<Text color={row.hashA ? colors.muted : colors.dim}>
					{row.hashA ? truncateHash(row.hashA) : '—'}
				</Text>
			</Box>
			<Box width={3}>
				<Text color={row.changed ? colors.warning : colors.dim}>{row.changed ? '≠' : '='}</Text>
			</Box>
			<Box width={14}>
				<Text color={row.hashB ? colors.muted : colors.dim}>
					{row.hashB ? truncateHash(row.hashB) : '—'}
				</Text>
			</Box>
			<Text color={row.changed ? colors.warning : colors.success}>
				{row.changed ? 'changed' : 'same'}
			</Text>
		</Box>
	)
}

interface Props {
	runA: RunSummary
	runB: RunSummary
	title: string
}

export function RunCompare({ runA, runB, title }: Props) {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80

	const rows = useMemo(() => buildComparison(runA, runB), [runA, runB])
	const cursor = useCursor(rows.length, rows.length > 0)
	const changedCount = rows.filter((r) => r.changed).length

	const idWidth = Math.max(16, ...rows.map((r) => r.taskId.length + 2))

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />

			<Box paddingX={2} marginTop={1} gap={2}>
				<Text>
					<Text color={colors.muted}>Comparing </Text>
					<Text color={colors.accentBright} bold>
						{runA.id.slice(0, 12)}
					</Text>
					<Text color={colors.dim}> vs </Text>
					<Text color={colors.accentBright} bold>
						{runB.id.slice(0, 12)}
					</Text>
				</Text>
				<Text>
					<Text color={changedCount > 0 ? colors.warning : colors.success} bold>
						{changedCount}
					</Text>
					<Text color={colors.muted}> changed</Text>
				</Text>
			</Box>

			{/* Column headers */}
			<Box paddingX={1} marginLeft={1} marginTop={1}>
				<Box width={idWidth}>
					<Text color={colors.muted} bold>
						Task
					</Text>
				</Box>
				<Box width={14}>
					<Text color={colors.muted} bold>
						Hash A
					</Text>
				</Box>
				<Box width={3}>
					<Text> </Text>
				</Box>
				<Box width={14}>
					<Text color={colors.muted} bold>
						Hash B
					</Text>
				</Box>
				<Text color={colors.muted} bold>
					Status
				</Text>
			</Box>

			{rows.map((row, i) => (
				<CompareRow key={row.taskId} row={row} selected={i === cursor} idWidth={idWidth} />
			))}
		</Box>
	)
}
