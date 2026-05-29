import { Box, Text, useStdout } from 'ink'
import Spinner from 'ink-spinner'
import { useMemo } from 'react'

import { useLogScroll } from '../hooks/use-log-scroll.js'
import { nameColumnWidth } from '../layout.js'
import { hyperlink, truncateEnd } from '../links.js'
import { colors, statusDisplay } from '../theme.js'
import type { Metrics, Process, Status, WorkspaceKind } from '../types.js'
import { Header } from './header.js'

const kindLabel = {
	package: 'pkg',
	app: 'app',
	service: 'svc',
} satisfies Record<WorkspaceKind, string>

export const HINTS = '? help   q quit'

/** An animated spinner while building, falling back to the status glyph otherwise. */
function StatusGlyph({ status, icon }: { status: Status; icon: string }) {
	if (status === 'building') return <Spinner type="dots" />

	return <Text>{icon}</Text>
}

function formatCpu(cpu: number): string {
	return `${cpu.toFixed(1)}%`.padStart(6)
}

function formatMem(bytes: number): string {
	let s: string

	if (bytes < 1024 * 1024) s = `${(bytes / 1024).toFixed(0)} K`
	else if (bytes < 1024 * 1024 * 1024) s = `${(bytes / (1024 * 1024)).toFixed(1)} M`
	else s = `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`

	return s.padStart(7)
}

function memColor(bytes: number): string {
	if (bytes > 512 * 1024 * 1024) return colors.error
	if (bytes > 256 * 1024 * 1024) return colors.warning

	return colors.muted
}

interface Props {
	processes: Process[]
	selectedIndex: number
	title: string
	metrics?: boolean
}

function ProcessRow({
	process: proc,
	selected,
	nameWidth,
	showMetrics,
	urlWidth,
}: {
	process: Process
	selected: boolean
	nameWidth: number
	showMetrics: boolean
	urlWidth: number
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
					<StatusGlyph status={proc.status} icon={icon} /> {label}
				</Text>
			</Box>
			{showMetrics && <MetricsCells metrics={proc.metrics} />}
			{proc.url && urlWidth > 0 && (
				<Box width={urlWidth}>
					{/* Pre-truncate the label to the column width and wrap it in an OSC 8
					    hyperlink targeting the full URL, so clicking opens the whole
					    address even when only a shortened segment is shown. Ink's own
					    truncator isn't link-aware and would drop the escapes. */}
					<Text color={colors.url} wrap="truncate">
						{hyperlink(proc.url, truncateEnd(proc.url, urlWidth))}
					</Text>
				</Box>
			)}
		</Box>
	)
}

function MetricsCells({ metrics }: { metrics?: Metrics }) {
	if (!metrics) {
		return (
			<>
				<Box width={8}>
					<Text color={colors.dim}>{'—'}</Text>
				</Box>
				<Box width={9}>
					<Text color={colors.dim}>{'—'}</Text>
				</Box>
			</>
		)
	}

	return (
		<>
			<Box width={8}>
				<Text color={metrics.cpu > 80 ? colors.error : colors.muted}>{formatCpu(metrics.cpu)}</Text>
			</Box>
			<Box width={9}>
				<Text color={memColor(metrics.mem)}>{formatMem(metrics.mem)}</Text>
			</Box>
		</>
	)
}

function LogPanel({
	process: proc,
	height,
	start,
	end,
	atBottom,
}: {
	process: Process
	height: number
	start: number
	end: number
	atBottom: boolean
}) {
	const logLines = proc.logs.slice(start, end)

	const fillCount = height - logLines.length

	const hidden = proc.logs.length - end

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
				{!atBottom && (
					<Text color={colors.warning}>
						{'   '}⏸ scrolled · {hidden} below · End to follow
					</Text>
				)}
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

export function Dashboard({ processes, selectedIndex, title, metrics = false }: Props) {
	const { stdout } = useStdout()

	const cols = stdout?.columns ?? 80
	const rows = stdout?.rows ?? 24

	const allReady = useMemo(
		() =>
			processes.length > 0 &&
			processes.every((p) => p.status === 'ready' || p.status === 'watching'),
		[processes],
	)

	const nameWidth = useMemo(() => nameColumnWidth(processes), [processes])

	// 2 (paddingX) + 2 (indicator + space) + nameWidth + 6 (kind) + 14 (status) + optional 17 (cpu+mem)
	const urlWidth = cols - nameWidth - 24 - (metrics ? 17 : 0)

	const logHeight = Math.max(3, rows - processes.length - 11)

	const safeIndex = Math.min(selectedIndex, Math.max(0, processes.length - 1))

	const selected = processes[safeIndex]

	const scroll = useLogScroll(
		selected?.logs.length ?? 0,
		logHeight,
		selected?.workspace.name ?? '',
		Boolean(selected),
	)

	return (
		// Clamp to one line below the terminal height. Ink only erases the previous
		// frame via log-update while the rendered height stays under `stdout.rows`;
		// once a frame reaches it, Ink falls back to a raw write and stops tracking
		// line counts, which strands the old frame (a duplicated header) in the
		// scrollback. Capping the height here keeps every frame on the log-update
		// path, and `overflow: hidden` clips any transient overshoot (a wrapped row,
		// a short terminal) rather than letting it tip past the threshold.
		<Box flexDirection="column" height={rows - 1} overflow="hidden">
			<Header title={title} ready={allReady} columns={cols} hints={HINTS} />

			{/* Table header */}
			<Box paddingX={1} marginLeft={2} marginTop={1}>
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
				{metrics && (
					<>
						<Box width={8}>
							<Text color={colors.muted} bold>
								CPU
							</Text>
						</Box>
						<Box width={9}>
							<Text color={colors.muted} bold>
								MEM
							</Text>
						</Box>
					</>
				)}
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
					showMetrics={metrics}
					urlWidth={urlWidth}
				/>
			))}

			{/* Log panel */}
			{selected && (
				<LogPanel
					process={selected}
					height={logHeight}
					start={scroll.start}
					end={scroll.end}
					atBottom={scroll.atBottom}
				/>
			)}
		</Box>
	)
}
