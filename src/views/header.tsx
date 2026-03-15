import { Box, Text } from 'ink'

interface Props {
	ready?: boolean
	columns: number
	hints?: string
}

export function Header({ ready = false, columns, hints }: Props) {
	const showHints = hints && columns >= 10 + hints.length + 4

	return (
		<>
			<Box>
				<Box flexGrow={1}>
					<Text color={ready ? 'green' : 'gray'}>{'● '}</Text>
					<Text bold>Hlidskjalf</Text>
				</Box>
				{showHints && <Text dimColor>{hints}</Text>}
			</Box>
			<Text dimColor>{'─'.repeat(columns)}</Text>
		</>
	)
}
