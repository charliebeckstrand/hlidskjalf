import { Box, Text, useStdout } from 'ink'

import { formatAge, formatBytes } from '../format.js'
import { useCursor } from '../hooks/use-cursor.js'
import { colors, icons } from '../theme.js'
import type { CacheEntry } from '../types.js'
import { Header } from './header.js'

const HINTS = '↑/↓ j/k scroll  esc back  q quit'

interface Props {
	entry: CacheEntry
	title: string
}

export function EntryDetail({ entry, title }: Props) {
	const { stdout } = useStdout()
	const cols = stdout?.columns ?? 80
	const rows = stdout?.rows ?? 24

	const cursor = useCursor(entry.files.length, entry.files.length > 0)
	const maxVisible = Math.max(3, rows - 14)
	const scrollOffset = Math.max(0, cursor - maxVisible + 1)
	const visibleFiles = entry.files.slice(scrollOffset, scrollOffset + maxVisible)

	return (
		<Box flexDirection="column">
			<Header title={title} columns={cols} hints={HINTS} />

			<Box flexDirection="column" paddingX={2} marginTop={1} gap={0}>
				<Text>
					<Text color={colors.muted}>Hash </Text>
					<Text color={colors.accentBright} bold>
						{entry.hash}
					</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>Size </Text>
					<Text>{formatBytes(entry.sizeBytes)}</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>Created </Text>
					<Text>{formatAge(entry.createdAt)}</Text>
				</Text>
				<Text>
					<Text color={colors.muted}>Files </Text>
					<Text>{entry.files.length}</Text>
				</Text>
			</Box>

			<Box
				flexDirection="column"
				marginX={1}
				marginTop={1}
				borderStyle="round"
				borderColor={colors.separator}
				paddingX={1}
			>
				<Box marginBottom={1}>
					<Text color={colors.accentBright} bold>
						Files
					</Text>
					{entry.files.length > maxVisible && (
						<Text color={colors.dim}>
							{' '}
							({scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, entry.files.length)} of{' '}
							{entry.files.length})
						</Text>
					)}
				</Box>
				{visibleFiles.map((file, i) => {
					const actualIndex = scrollOffset + i
					const selected = actualIndex === cursor
					return (
						<Text key={file} wrap="truncate">
							<Text color={selected ? colors.highlight : colors.dim}>
								{selected ? icons.selected : icons.unselected}
							</Text>{' '}
							<Text color={selected ? colors.highlight : undefined}>{file}</Text>
						</Text>
					)
				})}
				{entry.files.length === 0 && <Text color={colors.muted}>No files in entry.</Text>}
			</Box>
		</Box>
	)
}
