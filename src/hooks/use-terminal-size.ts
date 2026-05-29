import { useStdout } from 'ink'
import { useEffect, useState } from 'react'

export interface TerminalSize {
	columns: number
	rows: number
}

/** Dimensions used when stdout isn't a TTY (piped output, tests). */
const FALLBACK: TerminalSize = { columns: 80, rows: 24 }

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
 * and the log viewport reflow to the new size.
 */
export function useTerminalSize(): TerminalSize {
	const { stdout } = useStdout()

	const [size, setSize] = useState(() => readSize(stdout))

	useEffect(() => {
		if (!stdout) return

		const onResize = () => {
			setSize((prev) => {
				const next = readSize(stdout)

				// Skip the state update (and re-render) when nothing actually changed.
				return next.columns === prev.columns && next.rows === prev.rows ? prev : next
			})
		}

		stdout.on('resize', onResize)

		// The size may have changed between the initial state and this subscription;
		// reconcile once so we never miss an early resize.
		onResize()

		return () => {
			stdout.off('resize', onResize)
		}
	}, [stdout])

	return size
}
