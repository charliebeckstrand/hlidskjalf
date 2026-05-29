import { Box, Text } from 'ink'

import { useTerminalSize } from '../hooks/use-terminal-size.js'
import { colors } from '../theme.js'
import { HINTS } from './dashboard.js'
import { Header } from './header.js'

/** Every keybinding the app responds to, paired with its description. */
const BINDINGS: ReadonlyArray<readonly [keys: string, action: string]> = [
	['↑/↓', 'Select process'],
	['s', 'Stop / start process'],
	['r', 'Restart process'],
	['c', 'Clear logs'],
	['PgUp/PgDn', 'Scroll logs'],
	['Home/End', 'Jump to oldest / newest'],
	['?', 'Toggle help'],
	['q', 'Quit'],
]

export function Help({ title }: { title: string }) {
	const { columns: cols } = useTerminalSize()

	const keyWidth = Math.max(...BINDINGS.map(([keys]) => keys.length))

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />

			<Box
				flexDirection="column"
				alignSelf="flex-start"
				marginX={1}
				marginTop={1}
				paddingX={2}
				paddingY={1}
				borderStyle="round"
				borderColor={colors.separator}
			>
				<Box marginBottom={1}>
					<Text color={colors.accentBright} bold>
						Keybindings
					</Text>
				</Box>

				{BINDINGS.map(([keys, action]) => (
					<Box key={keys} gap={2}>
						<Box width={keyWidth}>
							<Text color={colors.highlight}>{keys}</Text>
						</Box>
						<Text color={colors.muted}>{action}</Text>
					</Box>
				))}

				<Box marginTop={1}>
					<Text color={colors.dim}>Press ? or Esc to close</Text>
				</Box>
			</Box>
		</Box>
	)
}
