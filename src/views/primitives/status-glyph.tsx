import { Text } from 'ink'
import Spinner from 'ink-spinner'
import type { Status } from '../../types.js'

/** An animated spinner while building, falling back to the status glyph otherwise. */
export function StatusGlyph({ status, glyph }: { status: Status; glyph: string }) {
	if (status === 'building') return <Spinner type="dots" />

	return <Text>{glyph}</Text>
}
