import { useInput } from 'ink'
import { useState } from 'react'

export function useCursor(length: number, enabled: boolean): number {
	const [cursor, setCursor] = useState(0)

	useInput(
		(input, key) => {
			if (key.upArrow || input === 'k') {
				setCursor((i) => Math.max(0, i - 1))
			} else if (key.downArrow || input === 'j') {
				setCursor((i) => Math.min(length - 1, i + 1))
			}
		},
		{ isActive: enabled },
	)

	return cursor
}
