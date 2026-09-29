import { Text } from 'ink'
import { useSpinnerFrame } from '../../hooks/index.js'

/** An animated spinner driven by the shared clock. */
export function Spinner() {
	return <Text>{useSpinnerFrame()}</Text>
}
