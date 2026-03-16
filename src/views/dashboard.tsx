import { Box, Text, useStdout } from 'ink'
import { useMemo } from 'react'

import { colors, statusDisplay } from '../theme.js'
import type { Process, WorkspaceKind } from '../types.js'
import { Header } from './header.js'

const kindLabel = {
	package: 'pkg',
	app: 'app',
	service: 'svc',
} satisfies Record<WorkspaceKind, string>

const HINTS = '↑/↓  j/k  select    q  quit'

interface Props {
	processes: Process[]
	selectedIndex: number
	title: string
}

function ProcessRow({
	process: proc,
	selected,
	nameWidth,
}: {
	process: Process
	selected: boolean
	nameWidth: number
}) {
	const { color, label, icon } = statusDisplay[proc.status]

	return (
		<Box paddingX={1}>
			<Text color={selected ? colors.highlight : colors.dim}>{selected ? '▸' : ' '}</Text>
			<Text> </Text>
			<Box width={nameWidth}>
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{proc.workspace.name}
				</Text>
			</Box>
			<Box width={6}>
				<Text color={colors.muted}>{kindLabel[proc.workspace.kind]}</Text>
			</Box>
			<Box width={14}>
				<Text color={color}>
					{icon} {label}
				</Text>
			</Box>
			<Text color={colors.url}>{proc.url ?? ''}</Text>
		</Box>
	)
}

function LogPanel({ process: proc, height }: { process: Process; height: number }) {
	const logLines = proc.logs.slice(-height)
	const fillCount = height - logLines.length

	return (
		<Box
			flexDirection="column"
			height={height + 3}
			overflow="hidden"
			marginX={1}
			marginTop={1}
			borderStyle="round"
			borderColor={colors.separator}
			paddingX={1}
		>
			<Box marginBottom={1}>
				<Text color={colors.accentBright} bold>
					Logs
				</Text>
				<Text color={colors.dim}>{' › '}</Text>
				<Text bold>{proc.workspace.name}</Text>
			</Box>
			{logLines.map((line, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable identity
				<Text key={i} wrap="truncate">
					{line}
				</Text>
			))}
			{Array.from({ length: fillCount }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fill lines have no stable identity
				<Text key={`fill-${i}`}> </Text>
			))}
		</Box>
	)
}

export function Dashboard({ processes, selectedIndex, title }: Props) {
	const { stdout } = useStdout()

	const cols = stdout?.columns ?? 80
	const rows = stdout?.rows ?? 24

	const allReady = useMemo(
		() =>
			processes.length > 0 &&
			processes.every((p) => p.status === 'ready' || p.status === 'watching'),
		[processes],
	)

	const nameWidth = useMemo(
		() => Math.max(14, ...processes.map((p) => p.workspace.name.length + 2)),
		[processes],
	)

	const logHeight = Math.max(3, rows - processes.length - 10)
	const safeIndex = Math.min(selectedIndex, Math.max(0, processes.length - 1))
	const selected = processes[safeIndex]

	return (
		<Box flexDirection="column">
			<Header title={title} ready={allReady} columns={cols} hints={HINTS} />

			{/* Table header */}
			<Box paddingX={1} marginLeft={1} marginTop={1}>
				<Box width={nameWidth}>
					<Text color={colors.muted} bold>
						Name
					</Text>
				</Box>
				<Box width={6}>
					<Text color={colors.muted} bold>
						Kind
					</Text>
				</Box>
				<Box width={14}>
					<Text color={colors.muted} bold>
						Status
					</Text>
				</Box>
				<Text color={colors.muted} bold>
					URL
				</Text>
			</Box>

			{/* Process rows */}
			{processes.map((proc, i) => (
				<ProcessRow
					key={proc.workspace.name}
					process={proc}
					selected={i === safeIndex}
					nameWidth={nameWidth}
				/>
			))}

			{/* Log panel */}
			{selected && <LogPanel process={selected} height={logHeight} />}
		</Box>
	)
}
