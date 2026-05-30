import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { ComponentProps, ReactNode } from 'react'
import type { Status } from '../types.js'
import { colors } from '../ui/index.js'

/** A fixed-width table cell. */
export function Cell({ width, children }: { width: number; children: ReactNode }) {
	return <Box width={width}>{children}</Box>
}

/** A rounded, separator-bordered column box. Shared frame for the log panel and help. */
export function Panel({ children, ...box }: ComponentProps<typeof Box> & { children: ReactNode }) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={colors.separator}
			paddingX={1}
			{...box}
		>
			{children}
		</Box>
	)
}

/** An animated spinner while building, falling back to the status glyph otherwise. */
export function StatusGlyph({ status, glyph }: { status: Status; glyph: string }) {
	if (status === 'building') return <Spinner type="dots" />

	return <Text>{glyph}</Text>
}
