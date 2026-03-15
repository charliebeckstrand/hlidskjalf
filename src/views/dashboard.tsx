import { Box, Text, useStdout } from 'ink'

import type { Process, Status, WorkspaceKind } from '../types.js'

const kindLabel: Record<WorkspaceKind, string> = {
	package: 'pkg',
	app: 'app',
}

const statusDisplay: Record<Status, { color: string; label: string }> = {
	pending: { color: 'gray', label: 'pending' },
	building: { color: 'yellow', label: 'building' },
	watching: { color: 'green', label: 'watching' },
	ready: { color: 'green', label: 'ready' },
	error: { color: 'red', label: 'error' },
	stopped: { color: 'gray', label: 'stopped' },
}

const HINTS = '\u2191/\u2193  j/k  select    q  quit'

interface Props {
	processes: Process[]
	selectedIndex: number
}

export function Dashboard({ processes, selectedIndex }: Props) {
	const { stdout } = useStdout()

	const cols = stdout?.columns ?? 80
	const rows = stdout?.rows ?? 24

	const allReady =
		processes.length > 0 && processes.every((p) => p.status === 'ready' || p.status === 'watching')

	// +2 padding so text doesn't butt against the next column
	const nameWidth = Math.max(14, ...processes.map((p) => p.workspace.name.length + 2))

	// Rows consumed by header, separator, table header, process rows, separator, log header
	const logHeight = Math.max(3, rows - processes.length - 5)

	const safeIndex = Math.min(selectedIndex, Math.max(0, processes.length - 1))

	const selected = processes[safeIndex]

	const logLines = selected?.logs.slice(-logHeight) ?? []

	// Only show hints when there's enough room — title is ~10 chars wide
	const showHints = cols >= 10 + HINTS.length + 4

	return (
		<Box flexDirection="column">
			{/* Header */}
			<Box>
				<Box flexGrow={1}>
					<Text color={allReady ? 'yellow' : 'gray'}>{allReady ? '\u{1F3D4}' : '\u25e6'}</Text>
					<Text bold>{allReady ? '  Midgard' : ' Midgard'}</Text>
				</Box>
				{showHints && <Text dimColor>{HINTS}</Text>}
			</Box>

			<Text dimColor>{'─'.repeat(cols)}</Text>

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
			{processes.map((proc, i) => {
				const isSelected = i === safeIndex
				const { color, label } = statusDisplay[proc.status]

				return (
					<Box key={proc.workspace.name}>
						<Text color={isSelected ? 'cyan' : undefined}>{isSelected ? '\u25b8' : ' '}</Text>
						<Box width={nameWidth}>
							<Text color={isSelected ? 'cyan' : undefined} bold={isSelected} wrap="truncate">
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
			})}

			<Text dimColor>{'─'.repeat(cols)}</Text>

			{/* Log panel */}
			{selected && (
				<Box flexDirection="column">
					<Box marginLeft={1}>
						<Text bold>Logs: {selected.workspace.name}</Text>
					</Box>
					{logLines.map((line, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable identity
						<Text key={i} wrap="truncate">
							{' '}
							{line}
						</Text>
					))}
					{Array.from({ length: logHeight - logLines.length }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: fill lines have no stable identity
						<Text key={`fill-${i}`}> </Text>
					))}
				</Box>
			)}
		</Box>
	)
}
