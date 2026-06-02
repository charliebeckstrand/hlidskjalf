import { Box, Text } from 'ink'
import { memo } from 'react'
import type { Activity } from '../../layout.js'
import { colors } from '../../ui/index.js'

interface HeaderProps {
	title: string
	activity?: Activity
	columns: number
	hints?: string
}

/**
 * Top bar shared by every screen: status dot, title, and (space permitting) key hints.
 * Memoized on its all-primitive props so a dashboard re-render driven by log output — which
 * leaves title/activity/columns untouched — doesn't re-render the bordered header subtree.
 */
export const Header = memo(function Header({
	title,
	activity = 'down',
	columns,
	hints,
}: HeaderProps) {
	const showHints = hints && columns >= 10 + hints.length + 4

	// Fill marks fully-up vs not; colour marks health. Only ● and ○ are used — the terminal
	// pulls the half-circle glyphs from an oversized fallback font that breaks the baseline.
	// Amber when paused, green otherwise, grey when nothing runs.
	const dotGlyph = activity === 'up' ? '●' : '○'

	const dotColor =
		activity === 'paused' ? colors.warning : activity === 'down' ? colors.dim : colors.success

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
					<Text color={dotColor}>{dotGlyph}</Text>
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
})
