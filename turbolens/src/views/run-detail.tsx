import { Box, Text, useStdout } from 'ink'

import { formatAge, formatDuration, truncateHash } from '../format.js'
import { useCursor } from '../hooks/use-cursor.js'
import { colors, icons } from '../theme.js'
import type { RunSummary } from '../types.js'
import { Header } from './header.js'

const HINTS = '↑/↓ j/k scroll  esc back  q quit'

interface Props {
	run: RunSummary
	title: string
}

function TaskRow({
	task,
	selected,
	idWidth,
}: {
	task: { taskId: string; hash: string; cacheHit: boolean; durationMs: number; command: string }
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
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{task.taskId}
				</Text>
			</Box>
			<Box width={14}>
				<Text color={colors.muted}>{truncateHash(task.hash)}</Text>
			</Box>
			<Box width={10}>
				<Text color={task.cacheHit ? colors.hit : colors.miss}>
					{task.cacheHit ? `${icons.hit} hit` : `${icons.miss} miss`}
				</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.dim}>{formatDuration(task.durationMs)}</Text>
			</Box>
			<Text color={colors.dim} wrap="truncate">
				{task.command}
			</Text>
		</Box>
	)
}

export function RunDetail({ run, title }: Props) {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80
	const cursor = useCursor(run.tasks.length, run.tasks.length > 0)

	const idWidth = Math.max(16, ...run.tasks.map((t) => t.taskId.length + 2))
	const total = run.cacheHitCount + run.cacheMissCount
	const hitRate = total > 0 ? Math.round((run.cacheHitCount / total) * 100) : 0

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />

			<Box flexDirection="column" paddingX={2} marginTop={1} gap={0}>
				<Text>
					<Text color={colors.muted}>Run </Text>
					<Text color={colors.accentBright} bold>
						{run.id}
					</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>When </Text>
					<Text>{formatAge(run.startedAt)}</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>Duration </Text>
					<Text>{formatDuration(run.durationMs)}</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>Cache </Text>
					<Text color={colors.hit}>{run.cacheHitCount} hits</Text>
					<Text color={colors.dim}> / </Text>
					<Text color={colors.miss}>{run.cacheMissCount} misses</Text>
					<Text color={colors.dim}> ({hitRate}%)</Text>
				</Text>
			</Box>

			{/* Task table header */}
			<Box paddingX={1} marginLeft={1} marginTop={1}>
				<Box width={idWidth}>
					<Text color={colors.muted} bold>
						Task
					</Text>
				</Box>
				<Box width={14}>
					<Text color={colors.muted} bold>
						Hash
					</Text>
				</Box>
				<Box width={10}>
					<Text color={colors.muted} bold>
						Cache
					</Text>
				</Box>
				<Box width={10}>
					<Text color={colors.muted} bold>
						Duration
					</Text>
				</Box>
				<Text color={colors.muted} bold>
					Command
				</Text>
			</Box>

			{run.tasks.map((task, i) => (
				<TaskRow key={task.taskId} task={task} selected={i === cursor} idWidth={idWidth} />
			))}
		</Box>
	)
}
