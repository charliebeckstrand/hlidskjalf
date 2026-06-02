import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useTerminalSize } from '../../hooks/index.js'
import { colors } from '../../ui/index.js'
import { Header } from './header.js'

/** Initial discovery screen, shown until the store registers its workspaces. */
export function Loading({ title }: { title: string }) {
	const { columns } = useTerminalSize()

	return (
		<Box flexDirection="column">
			<Header title={title} columns={columns} />
			<Box marginTop={1} paddingX={2}>
				<Text color={colors.accent}>
					<Spinner type="dots" />{' '}
				</Text>
				<Text color={colors.muted}>Discovering workspaces...</Text>
			</Box>
		</Box>
	)
}
