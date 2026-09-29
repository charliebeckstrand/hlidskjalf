import { useInput, useStdin } from 'ink'
import { useState } from 'react'
import { reconcileScroll, visibleLogRange } from '../logs/index.js'

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
		// Same process, buffer length changed. A scrolled-up viewport that grew stays anchored to
		// the same lines as new output arrives; one that shrank (logs cleared, or oldest lines
		// evicted at the cap) clamps back within bounds instead of stranding above the new bottom,
		// where it could never fall back to follow mode.
		setPrevTotal(total)

		const next = reconcileScroll(scroll, prevTotal, total, height)

		if (next !== scroll) setScroll(next)
	}

	// visibleLogRange owns the bound formula; reuse the value it returns rather than recomputing it.
	const { start, end, maxScroll } = visibleLogRange(total, height, scroll)

	const { isRawModeSupported } = useStdin()

	// Non-TTY stdin (piped/CI) can't enter raw mode; activating any key handler there would
	// throw at mount, so the panel stays read-only. Support is `stdin.isTTY`, undefined rather
	// than false when redirected, so compare explicitly.
	const active = enabled && isRawModeSupported === true

	// Ink wraps this handler in useEffectEvent, so it always reads the latest committed bound —
	// no ref needed to dodge a stale one.
	useInput(
		(_input, key) => {
			if (key.pageUp) {
				setScroll((s) => Math.min(Math.min(s, maxScroll) + height, maxScroll))
			} else if (key.pageDown) {
				setScroll((s) => Math.max(0, Math.min(s, maxScroll) - height))
			} else if (key.home) {
				setScroll(maxScroll)
			} else if (key.end) {
				setScroll(0)
			}
		},
		{ isActive: active },
	)

	return { start, end, atBottom: Math.min(scroll, maxScroll) === 0 }
}
