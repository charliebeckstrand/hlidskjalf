import { Box, Text } from 'ink'
import { memo } from 'react'
import { COLUMN_WIDTHS } from '../../layout.js'
import type { Status, WorkspaceKind } from '../../types.js'
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

function MetricsCells({ cpu, mem }: { cpu?: number; mem?: number }) {
	// A reading of 0 is real, so distinguish "no sample yet" by undefined, not falsiness.
	if (cpu === undefined || mem === undefined) {
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
				<Text color={cpuColor(cpu)}>{formatCpu(cpu)}</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.mem}>
				<Text color={memColor(mem)}>{formatMem(mem)}</Text>
			</Cell>
		</>
	)
}

/**
 * One table row. Memoized on primitive props rather than the WorkspaceProcess object: the
 * store mutates each process in place, so the object reference is stable across renders and
 * a reference (or field) comparison would never see a status/url/metric change. Passing the
 * displayed fields as primitives lets memo skip the rows a store update didn't touch — the
 * common case, since a log line for one process leaves every row's visible state unchanged.
 */
export const Process = memo(function Process({
	name,
	kind,
	status,
	url,
	cpu,
	mem,
	selected,
	nameWidth,
	showMetrics,
	urlWidth,
}: {
	name: string
	kind: WorkspaceKind
	status: Status
	url?: string
	cpu?: number
	mem?: number
	selected: boolean
	nameWidth: number
	showMetrics: boolean
	urlWidth: number
}) {
	const { color, label, icon } = statusDisplay[status]

	return (
		<Box paddingX={1}>
			<Text color={selected ? colors.highlight : colors.dim}>{selected ? '▸' : ' '}</Text>
			<Text> </Text>
			<Cell width={nameWidth}>
				<Text color={selected ? colors.highlight : undefined} bold={selected} wrap="truncate">
					{name}
				</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.kind}>
				<Text>{kindLabel[kind]}</Text>
			</Cell>
			<Cell width={COLUMN_WIDTHS.status}>
				<Text color={color}>
					<StatusGlyph status={status} icon={icon} /> {label}
				</Text>
			</Cell>
			{showMetrics && <MetricsCells cpu={cpu} mem={mem} />}
			{url && urlWidth > 0 && (
				<Cell width={urlWidth}>
					{/* Pre-truncate before wrapping in OSC 8: Ink's truncator isn't link-aware
					    and would drop the escapes. The link still targets the full URL. */}
					<Text color={colors.url} wrap="truncate">
						{hyperlink(url, truncateEnd(url, urlWidth))}
					</Text>
				</Cell>
			)}
		</Box>
	)
})
