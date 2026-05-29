import { useStdout } from 'ink'
import { useEffect, useState } from 'react'

export interface TerminalSize {
	columns: number
	rows: number
}

/** Dimensions used when stdout isn't a TTY (piped output, tests). */
const FALLBACK: TerminalSize = { columns: 80, rows: 24 }

/**
 * How long the terminal must stop changing size before we reflow. A window drag
 * fires a burst of `resize` events; reflowing on each one repaints mid-drag at
 * intermediate widths, where a row can briefly be wider than the terminal and
 * wrap. Waiting for the size to settle reflows once, against the final size.
 */
const RESIZE_SETTLE_MS = 120

function readSize(stdout: NodeJS.WriteStream | undefined): TerminalSize {
	return {
		columns: stdout?.columns ?? FALLBACK.columns,
		rows: stdout?.rows ?? FALLBACK.rows,
	}
}

/**
 * Current terminal dimensions, kept in sync with the live size. Ink reads
 * `stdout.columns`/`rows` only at render time and doesn't re-render on a resize,
 * so layout computed from those values would stay frozen at the size present on
 * first paint. Subscribing to the stream's `resize` event and storing the size
 * in state forces a re-render whenever the terminal grows or shrinks, so columns
 * and the log viewport reflow to the new size. Reflows are debounced until the
 * size settles (see `RESIZE_SETTLE_MS`) so a window drag reflows once at the end
 * rather than thrashing through every intermediate width.
 */
export function useTerminalSize(): TerminalSize {
	const { stdout } = useStdout()

	const [size, setSize] = useState(() => readSize(stdout))

	useEffect(() => {
		if (!stdout) return

		let timer: ReturnType<typeof setTimeout> | undefined

		const apply = () => {
			setSize((prev) => {
				const next = readSize(stdout)

				// Skip the state update (and re-render) when nothing actually changed.
				return next.columns === prev.columns && next.rows === prev.rows ? prev : next
			})
		}

		const onResize = () => {
			if (timer) clearTimeout(timer)

			timer = setTimeout(apply, RESIZE_SETTLE_MS)
		}

		stdout.on('resize', onResize)

		// The size may have changed between the initial state and this subscription;
		// reconcile once, immediately, so the first paint isn't stuck at a stale size.
		apply()

		return () => {
			if (timer) clearTimeout(timer)

			stdout.off('resize', onResize)
		}
	}, [stdout])

	return size
}
