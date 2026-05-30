import { Box, Text } from 'ink'
import { useMemo } from 'react'
import { useLogScroll } from '../../hooks/use-log-scroll.js'
import { useTerminalSize } from '../../hooks/use-terminal-size.js'
import {
	COLUMN_WIDTHS,
	columnWidths,
	logPanelHeight,
	MIN_LOG_PANEL_HEIGHT,
	nameColumnWidth,
	urlContentWidth,
} from '../../layout.js'
import type { Process as ProcessInfo } from '../../types.js'
import { colors, HINTS } from '../../ui/index.js'
import { Header } from '../chrome.js'
import { Cell } from '../primitives.js'
import { Log } from './log.js'
import { Process } from './process.js'

interface Props {
	processes: ProcessInfo[]
	selectedIndex: number
	title: string
	metrics?: boolean
}

export function Dashboard({ processes, selectedIndex, title, metrics = false }: Props) {
	const { columns: cols, rows } = useTerminalSize()

	const allReady = useMemo(
		() =>
			processes.length > 0 &&
			processes.every((p) => p.status === 'ready' || p.status === 'watching'),
		[processes],
	)

	// Natural width fits the longest name; the URL's full width is reserved first, then the
	// name takes what's left (truncating before it can squeeze the URL).
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
		// The frame sizes itself to its content. The log panel is given a hard maximum
		// height (see `logPanelHeight`) that already reserves room for the header and a row
		// of bottom slack, so the panel can't grow tall enough to scroll the header off the
		// top — no frame-level clipping needed (and we avoid it deliberately: Ink's clipper
		// slices lines through a tokenizer that miscounts OSC 8 hyperlinks).
		<Box flexDirection="column">
			<Header title={title} ready={allReady} columns={cols} hints={HINTS} />

			<Box paddingX={1} marginLeft={2} marginTop={1}>
				<Cell width={nameWidth}>
					<Text color={colors.muted} bold>
						Name
					</Text>
				</Cell>
				<Cell width={COLUMN_WIDTHS.kind}>
					<Text color={colors.muted} bold>
						Kind
					</Text>
				</Cell>
				<Cell width={COLUMN_WIDTHS.status}>
					<Text color={colors.muted} bold>
						Status
					</Text>
				</Cell>
				{metrics && (
					<>
						<Cell width={COLUMN_WIDTHS.cpu}>
							<Text color={colors.muted} bold>
								CPU
							</Text>
						</Cell>
						<Cell width={COLUMN_WIDTHS.mem}>
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
					process={proc}
					selected={i === safeIndex}
					nameWidth={nameWidth}
					showMetrics={metrics}
					urlWidth={urlWidth}
				/>
			))}

			{/* Log panel — hidden on a terminal too short to give it a usable height. */}
			{selected && logHeight >= MIN_LOG_PANEL_HEIGHT && (
				<Log
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
