import { Box, Text } from 'ink'
import { COLUMN_WIDTHS } from '../../layout.js'
import type { Metrics, Process as ProcessInfo, WorkspaceKind } from '../../types.js'
import {
	colors,
	cpuColor,
	formatCpu,
	formatMem,
	hyperlink,
	memColor,
	statusDisplay,
	truncateEnd,
} from '../../ui/index.js'
import { Cell, StatusGlyph } from '../primitives.js'

const kindLabel = {
	package: 'pkg',
	app: 'app',
	service: 'svc',
} satisfies Record<WorkspaceKind, string>

function MetricsCells({ metrics }: { metrics?: Metrics }) {
	if (!metrics) {
		return (
			<>
				<Cell width={COLUMN_WIDTHS.cpu}>
					<Text color={colors.dim}>{'—'}</Text>
				</Cell>
				<Cell width={COLUMN_WIDTHS.mem}>
					<Text color={colors.dim}>{'—'}</Text>
				</Cell>
			</>
		)
	}
	return (
		<>
			<Cell width={COLUMN_WIDTHS.cpu}>
				<Text color={cpuColor(metrics)}>{formatCpu(metrics.cpu)}</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.mem}>
				<Text color={memColor(metrics.mem)}>{formatMem(metrics.mem)}</Text>
			</Cell>
		</>
	)
}

export function Process({
	process: proc,
	selected,
	nameWidth,
	showMetrics,
	urlWidth,
}: {
	process: ProcessInfo
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
			<Cell width={nameWidth}>
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{proc.workspace.name}
				</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.kind}>
				<Text color={colors.muted}>{kindLabel[proc.workspace.kind]}</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.status}>
				<Text color={color}>
					<StatusGlyph status={proc.status} icon={icon} /> {label}
				</Text>
			</Cell>
			{showMetrics && <MetricsCells metrics={proc.metrics} />}
			{proc.url && urlWidth > 0 && (
				<Cell width={urlWidth}>
					{/* Pre-truncate the label to the column width and wrap it in an OSC 8
					    hyperlink targeting the full URL, so clicking opens the whole address
					    even when only a shortened segment is shown. Ink's own truncator isn't
					    link-aware and would drop the escapes. */}
					<Text color={colors.url} wrap="truncate">
						{hyperlink(proc.url, truncateEnd(proc.url, urlWidth))}
					</Text>
				</Cell>
			)}
		</Box>
	)
}
