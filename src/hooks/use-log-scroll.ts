import { useInput, useStdin } from 'ink'
import { useEffect, useRef, useState } from 'react'

import { visibleLogRange } from '../logs.js'

// Home/End are not surfaced as named keys by Ink's `useInput` — both collapse to
// an empty `input` — so they are matched against the raw escape sequences Ink
// emits on its stdin event emitter. These cover the common xterm/vt variants.
const ESC = String.fromCharCode(27)
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
 * Drives the log panel's scroll offset, measured in lines above the tail. Offset
 * 0 follows new output; PgUp/PgDn page by a viewport and Home/End jump to the
 * oldest/newest lines. Switching processes (or clearing the buffer) snaps back to
 * follow mode, and while paused the viewport stays anchored to the same lines as
 * fresh output arrives rather than scrolling out from under the reader.
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

	// Read by the stdin listener, whose closure would otherwise capture a stale
	// bound when the buffer or viewport size changes between renders.
	const maxScrollRef = useRef(maxScroll)
	maxScrollRef.current = maxScroll

	useInput(
		(_input, key) => {
			if (key.pageUp) {
				setScroll((s) => Math.min(Math.min(s, maxScroll) + height, maxScroll))
			} else if (key.pageDown) {
				setScroll((s) => Math.max(0, Math.min(s, maxScroll) - height))
			}
		},
		{ isActive: enabled },
	)

	const { internal_eventEmitter: emitter } = useStdin()

	useEffect(() => {
		if (!enabled || !emitter) return

		const onInput = (data: string) => {
			if (HOME_SEQUENCES.has(data)) setScroll(maxScrollRef.current)
			else if (END_SEQUENCES.has(data)) setScroll(0)
		}

		emitter.on('input', onInput)

		return () => {
			emitter.off('input', onInput)
		}
	}, [enabled, emitter])

	const { start, end } = visibleLogRange(total, height, scroll)

	return { start, end, atBottom: Math.min(scroll, maxScroll) === 0 }
}
