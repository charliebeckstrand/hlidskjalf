import { useInput } from 'ink'
import { useState } from 'react'
import { visibleLogRange } from '../logs/index.js'

// Home/End aren't surfaced as named keys by Ink's `useInput` (both collapse to an
// empty `key.*`), but the raw decoded bytes still arrive as the `input` argument.
// Match them against the common xterm/vt escape sequences. ESC = \x1b.
const ESC = '\x1b'
const HOME_SEQUENCES = new Set([`${ESC}[H`, `${ESC}[1~`, `${ESC}[7~`, `${ESC}OH`])
const END_SEQUENCES = new Set([`${ESC}[F`, `${ESC}[4~`, `${ESC}[8~`, `${ESC}OF`])

export interface LogScroll {
	/** Inclusive start index into the log buffer. */
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

	const [prevKey, setPrevKey] = useState(selectionKey)

	const [prevTotal, setPrevTotal] = useState(total)

	// These two render-phase adjustments are mutually exclusive: a process switch changes
	// both selectionKey and total in the same render (both derive from the selected process),
	// so the anchor branch must not also run — its setScroll(s => s + delta) would compose on
	// the reset's setScroll(0) and land the new process at `delta` instead of following.
	if (selectionKey !== prevKey) {
		// Switching processes snaps back to follow mode. Adopt the new buffer length too so
		// the anchor branch stays dormant this render.
		setPrevKey(selectionKey)

		setPrevTotal(total)

		setScroll(0)
	} else if (total !== prevTotal) {
		// Same process, buffer grew: keep a scrolled-up viewport anchored to the same lines as
		// new output arrives rather than letting it scroll out from under the reader.
		const delta = total - prevTotal

		setPrevTotal(total)

		if (scroll > 0 && delta > 0) setScroll((s) => s + delta)
	}

	// visibleLogRange owns the bound formula; reuse the value it returns rather than recomputing it.
	const { start, end, maxScroll } = visibleLogRange(total, height, scroll)

	// Ink re-subscribes this handler every render (its inputHandler is in the effect deps), so
	// the closure always reads the latest committed bound — no ref needed to dodge a stale one.
	useInput(
		(input, key) => {
			if (key.pageUp) {
				setScroll((s) => Math.min(Math.min(s, maxScroll) + height, maxScroll))
			} else if (key.pageDown) {
				setScroll((s) => Math.max(0, Math.min(s, maxScroll) - height))
			} else if (HOME_SEQUENCES.has(input)) {
				setScroll(maxScroll)
			} else if (END_SEQUENCES.has(input)) {
				setScroll(0)
			}
		},
		{ isActive: enabled },
	)

	return { start, end, atBottom: Math.min(scroll, maxScroll) === 0 }
}
