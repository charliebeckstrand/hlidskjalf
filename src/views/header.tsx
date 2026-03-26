import { Box, Text } from 'ink'

import { colors } from '../theme.js'

interface Props {
	title: string
	ready?: boolean
	columns: number
	hints?: string
}

export function Header({ title, ready = false, columns, hints }: Props) {
	const showHints = hints && columns >= 10 + hints.length + 4

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			paddingTop={1}
			paddingBottom={1}
			borderStyle="single"
			borderColor={colors.separator}
			borderTop={false}
			borderLeft={false}
			borderRight={false}
		>
			<Box gap={2}>
				<Box flexShrink={0} gap={1}>
					<Text color={ready ? colors.success : colors.accent}>{'●'}</Text>
					<Text color={colors.accentBright} bold>
						{title}
					</Text>
				</Box>
				{showHints && (
					<Box flexGrow={1} justifyContent="flex-end">
						<Text color={colors.dim} wrap="truncate-end">
							{hints}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	)
}
