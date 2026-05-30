import { Box } from 'ink'
import type { ReactNode } from 'react'

/** A fixed-width table cell. */
export function Cell({ width, children }: { width: number; children: ReactNode }) {
	return <Box width={width}>{children}</Box>
}
