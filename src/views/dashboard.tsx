import { Box, Text, useStdout } from 'ink'
import { useMemo } from 'react'

import type { Process, Status, WorkspaceKind } from '../types.js'
import { Header } from './header.js'

const kindLabel = {
	package: 'pkg',
	app: 'app',
	service: 'svc',
} satisfies Record<WorkspaceKind, string>

const statusDisplay = {
	pending: { color: 'gray', label: 'pending' },
	building: { color: 'yellow', label: 'building' },
	watching: { color: 'green', label: 'watching' },
	ready: { color: 'green', label: 'watching' },
	error: { color: 'red', label: 'error' },
	stopped: { color: 'gray', label: 'stopped' },
	idle: { color: 'yellow', label: 'idle' },
	timeout: { color: 'red', label: 'timeout' },
} satisfies Record<Status, { color: string; label: string }>

const HINTS = '\u2191/\u2193  j/k  select    q  quit'

interface Props {
	processes: Process[]
	selectedIndex: number
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
	const { color, label } = statusDisplay[proc.status]

	return (
		<Box>
			<Text color={selected ? 'cyan' : undefined}>{selected ? '\u25b8' : ' '}</Text>
			<Box width={nameWidth}>
				<Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">
					{proc.workspace.name}
				</Text>
			</Box>
			<Box width={6}>
				<Text dimColor>{kindLabel[proc.workspace.kind]}</Text>
			</Box>
			<Box width={14}>
				<Text color={color}>
					{'● '}
					{label}
				</Text>
			</Box>
			<Text dimColor>{proc.url ?? ''}</Text>
		</Box>
	)
}

function LogPanel({ process: proc, height }: { process: Process; height: number }) {
	const logLines = proc.logs.slice(-height)
	const fillCount = height - logLines.length

	return (
		<Box flexDirection="column" height={height + 1} overflow="hidden">
			<Box marginLeft={1}>
				<Text bold>Logs: {proc.workspace.name}</Text>
			</Box>
			{logLines.map((line, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable identity
				<Text key={i} wrap="truncate">
					{' '}
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

export function Dashboard({ processes, selectedIndex }: Props) {
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

	const logHeight = Math.max(3, rows - processes.length - 5)
	const safeIndex = Math.min(selectedIndex, Math.max(0, processes.length - 1))
	const selected = processes[safeIndex]

	return (
		<Box flexDirection="column">
			<Header ready={allReady} columns={cols} hints={HINTS} />

			{/* Table header */}
			<Box marginLeft={1}>
				<Box width={nameWidth}>
					<Text dimColor bold>
						Name
					</Text>
				</Box>
				<Box width={6}>
					<Text dimColor bold>
						Kind
					</Text>
				</Box>
				<Box width={14}>
					<Text dimColor bold>
						Status
					</Text>
				</Box>
				<Text dimColor bold>
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

			<Text dimColor>{'─'.repeat(cols)}</Text>

			{/* Log panel */}
			{selected && <LogPanel process={selected} height={logHeight} />}
		</Box>
	)
}
