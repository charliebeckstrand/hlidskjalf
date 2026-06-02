import { Box, Text } from 'ink'
import { useTerminalSize } from '../../hooks/use-terminal-size.js'
import { colors, HINTS } from '../../ui/index.js'
import { Cell, Panel } from '../primitives/index.js'
import { Header } from './header.js'

/** Keybindings, each paired with its description. */
const BINDINGS: ReadonlyArray<readonly [keys: string, action: string]> = [
	['↑/↓ · j/k', 'Navigate processes'],
	['s', 'Stop / start process'],
	['p', 'Pause / resume process'],
	['x', 'Kill process'],
	['r', 'Restart process'],
	['c', 'Clear logs'],
	['PgUp/PgDn', 'Scroll logs'],
	['Home/End', 'Jump to oldest / newest logs'],
	['?', 'Toggle help'],
	['q', 'Quit'],
]

/** Keybindings overlay, toggled with `?`. */
export function Help({ title }: { title: string }) {
	const { columns } = useTerminalSize()

	const keyWidth = Math.max(...BINDINGS.map(([keys]) => keys.length))

	return (
		<Box flexDirection="column">
			<Header title={title} columns={columns} hints={HINTS} />
			<Panel alignSelf="flex-start" marginX={1} marginTop={1} paddingX={2} paddingY={1}>
				<Box marginBottom={1}>
					<Text color={colors.accentBright} bold>
						Keybindings
					</Text>
				</Box>
				{BINDINGS.map(([keys, action]) => (
					<Box key={keys} gap={2}>
						<Cell width={keyWidth}>
							<Text color={colors.highlight}>{keys}</Text>
						</Cell>
						<Text color={colors.muted}>{action}</Text>
					</Box>
				))}
				<Box marginTop={1}>
					<Text color={colors.dim}>Press ? or Esc to close</Text>
				</Box>
			</Panel>
		</Box>
	)
}
