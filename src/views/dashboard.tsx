import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useMemo } from 'react'

import { useLogScroll } from '../hooks/use-log-scroll.js'
import { useTerminalSize } from '../hooks/use-terminal-size.js'
import {
	COLUMN_WIDTHS,
	columnWidths,
	logPanelHeight,
	MIN_LOG_PANEL_HEIGHT,
	nameColumnWidth,
	urlContentWidth,
} from '../layout.js'
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
			<Box width={COLUMN_WIDTHS.kind}>
				<Text color={colors.muted}>{kindLabel[proc.workspace.kind]}</Text>
			</Box>
			<Box width={COLUMN_WIDTHS.status}>
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
				<Box width={COLUMN_WIDTHS.cpu}>
					<Text color={colors.dim}>{'—'}</Text>
				</Box>
				<Box width={COLUMN_WIDTHS.mem}>
					<Text color={colors.dim}>{'—'}</Text>
				</Box>
			</>
		)
	}

	return (
		<>
			<Box width={COLUMN_WIDTHS.cpu}>
				<Text color={metrics.cpu > 80 ? colors.error : colors.muted}>{formatCpu(metrics.cpu)}</Text>
			</Box>
			<Box width={COLUMN_WIDTHS.mem}>
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
	const { columns: cols, rows } = useTerminalSize()

	const allReady = useMemo(
		() =>
			processes.length > 0 &&
			processes.every((p) => p.status === 'ready' || p.status === 'watching'),
		[processes],
	)

	// Natural width fits the longest name; the URL's full width is reserved first,
	// then the name takes what's left (truncating before it can squeeze the URL).
	const naturalNameWidth = useMemo(() => nameColumnWidth(processes), [processes])

	const urlContent = useMemo(() => urlContentWidth(processes), [processes])

	const { name: nameWidth, url: urlWidth } = columnWidths(
		cols,
		naturalNameWidth,
		urlContent,
		metrics,
	)

	const logHeight = logPanelHeight(rows, processes.length)

	const safeIndex = Math.min(selectedIndex, Math.max(0, processes.length - 1))

	const selected = processes[safeIndex]

	const scroll = useLogScroll(
		selected?.logs.length ?? 0,
		logHeight,
		selected?.workspace.name ?? '',
		Boolean(selected),
	)

	return (
		// The frame sizes itself to its content. The log panel is given a hard
		// maximum height (see `logPanelHeight`) that already reserves room for the
		// header and a row of bottom slack, so the panel can't grow tall enough to
		// scroll the header off the top — no frame-level clipping needed (and we
		// avoid it deliberately: Ink's clipper slices lines through a tokenizer that
		// miscounts OSC 8 hyperlinks and would truncate the URL column's links).
		<Box flexDirection="column">
			<Header title={title} ready={allReady} columns={cols} hints={HINTS} />

			{/* Table header */}
			<Box paddingX={1} marginLeft={2} marginTop={1}>
				<Box width={nameWidth}>
					<Text color={colors.muted} bold>
						Name
					</Text>
				</Box>
				<Box width={COLUMN_WIDTHS.kind}>
					<Text color={colors.muted} bold>
						Kind
					</Text>
				</Box>
				<Box width={COLUMN_WIDTHS.status}>
					<Text color={colors.muted} bold>
						Status
					</Text>
				</Box>
				{metrics && (
					<>
						<Box width={COLUMN_WIDTHS.cpu}>
							<Text color={colors.muted} bold>
								CPU
							</Text>
						</Box>
						<Box width={COLUMN_WIDTHS.mem}>
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

			{/* Log panel — hidden on a terminal too short to give it a usable height,
			    rather than rendered as a cramped box that would crowd out the table. */}
			{selected && logHeight >= MIN_LOG_PANEL_HEIGHT && (
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
