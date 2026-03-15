import { Box, Text, useStdout } from 'ink'

import { Header } from './header.js'

export function Loading() {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80

	return (
		<Box flexDirection="column">
			<Header columns={cols} />
			<Box marginTop={1} marginLeft={1}>
				<Text dimColor>Discovering workspaces...</Text>
			</Box>
		</Box>
	)
}
