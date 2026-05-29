import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

import { useTerminalSize } from '../hooks/use-terminal-size.js'
import { colors } from '../theme.js'
import { Header } from './header.js'

export function Loading({ title }: { title: string }) {
	const { columns: cols } = useTerminalSize()

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} />
			<Box marginTop={1} paddingX={2}>
				<Text color={colors.accent}>
					<Spinner type="dots" />{' '}
				</Text>
				<Text color={colors.muted}>Discovering workspaces...</Text>
			</Box>
		</Box>
	)
}
