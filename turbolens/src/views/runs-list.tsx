import { Box, Text, useInput, useStdout } from 'ink'

import { formatAge, formatDuration } from '../format.js'
import { useCursor } from '../hooks/use-cursor.js'
import { colors, icons } from '../theme.js'
import type { RunSummary, View } from '../types.js'
import { Header } from './header.js'

const HINTS = '↑/↓ j/k select  enter detail  space mark  c compare  esc back  q quit'

interface Props {
	runs: RunSummary[]
	navigate: (view: View) => void
	marked: Set<string>
	toggleMark: (id: string) => void
	title: string
}

function RunRow({
	run,
	selected,
	isMarked,
}: {
	run: RunSummary
	selected: boolean
	isMarked: boolean
}) {
	const total = run.cacheHitCount + run.cacheMissCount
	const hitRate = total > 0 ? Math.round((run.cacheHitCount / total) * 100) : 0

	return (
		<Box paddingX={1}>
			<Text color={selected ? colors.highlight : colors.dim}>
				{isMarked ? icons.marked : selected ? icons.selected : icons.unselected}
			</Text>
			<Text> </Text>
			<Box width={20}>
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{formatAge(run.startedAt)}
				</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.muted}>{formatDuration(run.durationMs)}</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.muted}>{total} tasks</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.hit}>
					{icons.hit} {run.cacheHitCount}
				</Text>
			</Box>
			<Box width={10}>
				<Text color={colors.miss}>
					{icons.miss} {run.cacheMissCount}
				</Text>
			</Box>
			<Text color={hitRate >= 80 ? colors.hit : hitRate >= 50 ? colors.warning : colors.miss}>
				{hitRate}%
			</Text>
		</Box>
	)
}

export function RunsList({ runs, navigate, marked, toggleMark, title }: Props) {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80
	const cursor = useCursor(runs.length, runs.length > 0)

	const safeIndex = Math.min(cursor, Math.max(0, runs.length - 1))

	useInput((input, key) => {
		if (key.return && runs.length > 0) {
			navigate({ kind: 'run-detail', id: runs[safeIndex].id })
		} else if (input === ' ' && runs.length > 0) {
			toggleMark(runs[safeIndex].id)
		} else if (input === 'c' && marked.size === 2) {
			const ids = [...marked] as [string, string]
			navigate({ kind: 'run-compare', ids })
		}
	})

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />

			{runs.length === 0 ? (
				<Box paddingX={2} marginTop={1}>
					<Text color={colors.muted}>
						No run summaries found. Run tasks with --summarize to generate them.
					</Text>
				</Box>
			) : (
				<>
					<Box paddingX={1} marginLeft={1} marginTop={1}>
						<Box width={20}>
							<Text color={colors.muted} bold>
								When
							</Text>
						</Box>
						<Box width={10}>
							<Text color={colors.muted} bold>
								Duration
							</Text>
						</Box>
						<Box width={10}>
							<Text color={colors.muted} bold>
								Tasks
							</Text>
						</Box>
						<Box width={10}>
							<Text color={colors.muted} bold>
								Hits
							</Text>
						</Box>
						<Box width={10}>
							<Text color={colors.muted} bold>
								Misses
							</Text>
						</Box>
						<Text color={colors.muted} bold>
							Rate
						</Text>
					</Box>

					{runs.map((run, i) => (
						<RunRow
							key={run.id}
							run={run}
							selected={i === safeIndex}
							isMarked={marked.has(run.id)}
						/>
					))}
				</>
			)}

			{marked.size === 2 && (
				<Box paddingX={2} marginTop={1}>
					<Text color={colors.accent}>Press c to compare the 2 marked runs</Text>
				</Box>
			)}
		</Box>
	)
}
