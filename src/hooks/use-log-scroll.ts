import { useInput } from 'ink'
import { useRef, useState } from 'react'
import { visibleLogRange } from '../logs.js'

// Home/End aren't surfaced as named keys by Ink's `useInput` (both collapse to an
// empty `key.*`), but the raw decoded bytes still arrive as the `input` argument.
// Match them against the common xterm/vt escape sequences. ESC = \x1b.
const ESC = '\x1b'
const HOME_SEQUENCES = new Set([`${ESC}[H`, `${ESC}[1~`, `${ESC}[7~`, `${ESC}OH`])
const END_SEQUENCES = new Set([`${ESC}[F`, `${ESC}[4~`, `${ESC}[8~`, `${ESC}OF`])

export interface LogScroll {
	/** Inclusive start index into the selected process's log buffer. */
	start: number
	/** Exclusive end index into the buffer. */
	end: number
	/** True when the viewport is pinned to the newest line (follow mode). */
	atBottom: boolean
}

/**
 * Drives the log panel's scroll offset, measured in lines above the tail. Offset 0 follows
 * new output; PgUp/PgDn page by a viewport, Home/End jump to the oldest/newest lines.
 * Switching processes (or clearing the buffer) snaps back to follow mode. While paused, the
 * viewport stays anchored to the same lines as fresh output arrives rather than scrolling
 * out from under the reader.
 */
export function useLogScroll(
	total: number,
	height: number,
	selectionKey: string,
	enabled: boolean,
): LogScroll {
	const [scroll, setScroll] = useState(0)

	// Snap to the bottom whenever the selected process changes.
	const [prevKey, setPrevKey] = useState(selectionKey)
	if (selectionKey !== prevKey) {
		setPrevKey(selectionKey)
		setScroll(0)
	}

	// Keep a paused viewport anchored to the same lines as new output arrives.
	const [prevTotal, setPrevTotal] = useState(total)
	if (total !== prevTotal) {
		const delta = total - prevTotal
		setPrevTotal(total)
		if (scroll > 0 && delta > 0) setScroll((s) => s + delta)
	}

	const maxScroll = Math.max(0, total - height)
	// The input handler's closure would otherwise capture a stale bound across renders.
	const maxScrollRef = useRef(maxScroll)
	maxScrollRef.current = maxScroll

	useInput(
		(input, key) => {
			if (key.pageUp) {
				setScroll((s) => Math.min(Math.min(s, maxScroll) + height, maxScroll))
			} else if (key.pageDown) {
				setScroll((s) => Math.max(0, Math.min(s, maxScroll) - height))
			} else if (HOME_SEQUENCES.has(input)) {
				setScroll(maxScrollRef.current)
			} else if (END_SEQUENCES.has(input)) {
				setScroll(0)
			}
		},
		{ isActive: enabled },
	)

	const { start, end } = visibleLogRange(total, height, scroll)
	return { start, end, atBottom: Math.min(scroll, maxScroll) === 0 }
}
