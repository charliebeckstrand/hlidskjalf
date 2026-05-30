import { Box } from 'ink'
import type { ComponentProps, ReactNode } from 'react'
import { colors } from '../../ui/index.js'

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
