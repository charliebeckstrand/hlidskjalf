import { Box, Text } from 'ink'
import { useLogScroll } from '../../hooks/use-log-scroll.js'
import { useTerminalSize } from '../../hooks/use-terminal-size.js'
import {
	columnWidths,
	FIXED_COLUMN_WIDTHS,
	logPanelHeight,
	MIN_LOG_PANEL_HEIGHT,
	nameColumnWidth,
	overallActivity,
	urlContentWidth,
} from '../../layout.js'
import type { WorkspaceProcess } from '../../types.js'
import { colors, HINTS } from '../../ui/index.js'
import { clampIndex } from '../../util.js'
import { Header } from '../chrome/index.js'
import { Cell } from '../primitives.js'
import { Log } from './log.js'
import { Process } from './process.js'

interface Props {
	processes: WorkspaceProcess[]
	selectedIndex: number
	title: string
	showMetrics?: boolean
}

export function Dashboard({ processes, selectedIndex, title, showMetrics = false }: Props) {
	const { columns, rows } = useTerminalSize()

	// Header dot: green (full when all up, half when partly up), amber only when something is
	// paused, grey when nothing is running.
	const activity = overallActivity(processes)

	// Natural width fits the longest name; the URL's full width is reserved first, then the
	// name takes what's left (truncating before it can squeeze the URL). These are cheap O(n)
	// passes recomputed each render — not worth memoizing for the dashboard's process counts.
	const naturalNameWidth = nameColumnWidth(processes)

	const naturalUrlWidth = urlContentWidth(processes)

	const { name: nameWidth, url: urlWidth } = columnWidths(
		columns,
		naturalNameWidth,
		naturalUrlWidth,
		showMetrics,
	)

	const logHeight = logPanelHeight(rows, processes.length)

	const safeIndex = clampIndex(selectedIndex, processes.length)

	const selected = processes[safeIndex]

	const logScroll = useLogScroll(
		selected?.logs.length ?? 0,
		logHeight,
		selected?.workspace.name ?? '',
		Boolean(selected),
	)

	return (
		// The frame sizes itself to its content. The log panel is given a hard maximum
		// height (see `logPanelHeight`) that already reserves room for the header and a row
		// of bottom slack, so the panel can't grow tall enough to scroll the header off the
		// top — no frame-level clipping needed (and we avoid it deliberately: Ink's clipper
		// slices lines through a tokenizer that miscounts OSC 8 hyperlinks).
		<Box flexDirection="column">
			<Header title={title} activity={activity} columns={columns} hints={HINTS} />

			<Box paddingX={1} marginLeft={2} marginTop={1}>
				<Cell width={nameWidth}>
					<Text color={colors.muted} bold>
						Name
					</Text>
				</Cell>
				<Cell width={FIXED_COLUMN_WIDTHS.kind}>
					<Text color={colors.muted} bold>
						Kind
					</Text>
				</Cell>
				<Cell width={FIXED_COLUMN_WIDTHS.status}>
					<Text color={colors.muted} bold>
						Status
					</Text>
				</Cell>
				{showMetrics && (
					<>
						<Cell width={FIXED_COLUMN_WIDTHS.cpu}>
							<Text color={colors.muted} bold>
								CPU
							</Text>
						</Cell>
						<Cell width={FIXED_COLUMN_WIDTHS.mem}>
							<Text color={colors.muted} bold>
								MEM
							</Text>
						</Cell>
					</>
				)}
				<Text color={colors.muted} bold>
					URL
				</Text>
			</Box>

			{processes.map((proc, i) => (
				<Process
					key={proc.workspace.name}
					name={proc.workspace.name}
					kind={proc.workspace.kind}
					status={proc.status}
					url={proc.url}
					cpu={proc.metrics?.cpu}
					mem={proc.metrics?.mem}
					selected={i === safeIndex}
					nameWidth={nameWidth}
					showMetrics={showMetrics}
					urlWidth={urlWidth}
				/>
			))}

			{/* Log panel — hidden on a terminal too short to give it a usable height. */}
			{selected && logHeight >= MIN_LOG_PANEL_HEIGHT && (
				<Log
					lines={selected.logs.slice(logScroll.start, logScroll.end)}
					height={logHeight}
					hiddenCount={selected.logs.length - logScroll.end}
					atBottom={logScroll.atBottom}
				/>
			)}
		</Box>
	)
}
