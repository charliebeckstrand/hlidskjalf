import { Box, Text } from 'ink'
import { memo } from 'react'
import { logRowKeys } from '../../logs/index.js'
import { colors } from '../../ui/index.js'
import { Panel } from '../primitives/index.js'

/** Element-wise compare of two visible windows. The slices hold the same string instances
 * across renders, so an unchanged window compares as a cheap run of reference checks. */
function sameLines(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false

	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false

	return true
}

/**
 * The log scrollback. Presentational — it takes the already-sliced visible lines rather
 * than the process, and is memoized on that content: output from a process other than the
 * selected one re-renders the dashboard but leaves this window's lines untouched, so the
 * panel skips rebuilding its rows. Custom compare because the slice is a fresh array each
 * render; its element strings are stable, so the comparison short-circuits to pointer checks.
 */
export const Log = memo(
	function Log({
		lines,
		height,
		startIndex,
		hiddenCount,
		atBottom,
	}: {
		lines: string[]
		height: number
		startIndex: number
		hiddenCount: number
		atBottom: boolean
	}) {
		const { rows, fills } = logRowKeys(lines, startIndex, height)

		return (
			<Panel height={height + 3} overflow="hidden" marginX={1} marginTop={1}>
				<Box marginBottom={1}>
					<Text color={colors.accentBright} bold>
						Logs
					</Text>
					{!atBottom && (
						<Text color={colors.warning}>
							{'   '}⏸ scrolled · {hiddenCount} below · End to follow
						</Text>
					)}
				</Box>
				{rows.map((row) => (
					<Text key={row.id} wrap="truncate">
						{row.line}
					</Text>
				))}
				{fills.map((id) => (
					<Text key={`fill-${id}`}> </Text>
				))}
			</Panel>
		)
	},
	(prev, next) =>
		prev.height === next.height &&
		prev.startIndex === next.startIndex &&
		prev.hiddenCount === next.hiddenCount &&
		prev.atBottom === next.atBottom &&
		sameLines(prev.lines, next.lines),
)
