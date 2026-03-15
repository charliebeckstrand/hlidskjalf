import { Box, Text, useStdout } from 'ink'

export function Loading() {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80

	return (
		<Box flexDirection="column">
			<Box>
				<Text color="gray">{'◦ '}</Text>
				<Text bold>Midgard</Text>
			</Box>
			<Text dimColor>{'─'.repeat(cols)}</Text>
			<Box marginTop={1} marginLeft={1}>
				<Text dimColor>Discovering workspaces...</Text>
			</Box>
		</Box>
	)
}
