import { Text } from 'ink'
import type { Status } from '../../types.js'
import { Spinner } from './spinner.js'

/** Animated spinner while building; the status glyph otherwise. */
export function StatusGlyph({ status, glyph }: { status: Status; glyph: string }) {
	if (status === 'building') return <Spinner />

	return <Text>{glyph}</Text>
}
