import { Box, Text } from 'ink'
import type { Process } from '../../types.js'
import { colors } from '../../ui/index.js'
import { Panel } from '../primitives.js'

export function Log({
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
		<Panel height={height + 3} overflow="hidden" marginX={1} marginTop={1}>
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
		</Panel>
	)
}
