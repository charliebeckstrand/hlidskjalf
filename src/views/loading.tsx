import { Box, Text, useStdout } from 'ink'

import { colors } from '../theme.js'
import { Header } from './header.js'

export function Loading() {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80

	return (
		<Box flexDirection="column">
			<Header columns={cols} />
			<Box marginTop={1} paddingX={2}>
				<Text color={colors.accent}>◑ </Text>
				<Text color={colors.muted}>Discovering workspaces...</Text>
			</Box>
		</Box>
	)
}
