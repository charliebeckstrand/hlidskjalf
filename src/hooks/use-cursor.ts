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

	// Clamp to the current list length. When a watched workspace is removed the
	// list shrinks under a stationary cursor; returning the raw value would leave
	// the selection pointing past the end (so keypresses target `undefined`) while
	// the dashboard highlights a different, clamped row. Clamp here so the
	// actionable index and the highlighted index can't diverge.
	return Math.min(cursor, Math.max(0, length - 1))
}
