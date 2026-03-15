import { Box, Text, useStdout } from 'ink'

interface Props {
	message: string
}

export function Loading({ message }: Props) {
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
				<Text dimColor>{message}</Text>
			</Box>
		</Box>
	)
}
