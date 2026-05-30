import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useTerminalSize } from '../hooks/use-terminal-size.js'
import { colors, HINTS } from '../ui.js'
import { Cell, Panel } from './primitives.js'

interface HeaderProps {
	title: string
	ready?: boolean
	columns: number
	hints?: string
}

/** Top bar shared by every screen: status dot, title, and (space permitting) key hints. */
export function Header({ title, ready = false, columns, hints }: HeaderProps) {
	const showHints = hints && columns >= 10 + hints.length + 4

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			paddingTop={1}
			paddingBottom={1}
			borderStyle="single"
			borderColor={colors.separator}
			borderTop={false}
			borderLeft={false}
			borderRight={false}
		>
			<Box gap={2}>
				<Box flexShrink={0} gap={1}>
					<Text color={ready ? colors.success : colors.dim}>{ready ? '●' : '○'}</Text>
					<Text color={colors.accentBright} bold>
						{title}
					</Text>
				</Box>
				{showHints && (
					<Box flexGrow={1} justifyContent="flex-end">
						<Text color={colors.dim} wrap="truncate-end">
							{hints}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	)
}

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

/** Every keybinding the app responds to, paired with its description. */
const BINDINGS: ReadonlyArray<readonly [keys: string, action: string]> = [
	['↑/↓ · j/k', 'Navigate processes'],
	['s', 'Stop / start process'],
	['p', 'Pause / resume process'],
	['x', 'Kill process (no restart)'],
	['r', 'Restart process'],
	['c', 'Clear logs'],
	['PgUp/PgDn', 'Scroll logs'],
	['Home/End', 'Jump to oldest / newest'],
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
