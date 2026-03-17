import { Box, Text } from 'ink'

import { colors } from '../theme.js'

interface Props {
	title: string
	columns: number
	hints?: string
}

export function Header({ title, columns, hints }: Props) {
	const showHints = hints && columns >= 10 + hints.length + 4

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			paddingTop={1}
			borderStyle="single"
			borderColor={colors.separator}
			borderTop={false}
			borderLeft={false}
			borderRight={false}
		>
			<Box>
				<Box flexGrow={1} gap={1}>
					<Text color={colors.accent}>{'●'}</Text>
					<Text color={colors.accentBright} bold>
						{title}
					</Text>
				</Box>
				{showHints && <Text color={colors.dim}>{hints}</Text>}
			</Box>
		</Box>
	)
}
