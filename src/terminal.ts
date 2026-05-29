/**
 * Alternate-screen-buffer lifecycle. The dashboard runs on the terminal's
 * alternate screen (the same buffer vim/htop/lazygit use) so its frames can never
 * land in the scrollback: re-renders repaint in place and, on exit, the original
 * screen and scrollback are restored exactly as they were before launch. This
 * also frees the dashboard from clamping its own height to dodge Ink's
 * duplicate-frame stranding — that whole class of bug can't happen off the primary
 * buffer.
 */

/** DECSET 1049: switch to the alternate screen buffer (and save the primary one). */
const ENTER_ALT_SCREEN = '\x1b[?1049h'

/** DECRST 1049: restore the primary screen buffer. */
const EXIT_ALT_SCREEN = '\x1b[?1049l'

/**
 * Switch `stream` to the alternate screen and return an idempotent restore
 * function. A `process.exit` listener guarantees the primary screen comes back
 * even on an abrupt exit (an uncaught throw, a signal that bypasses the app's own
 * shutdown), so the user is never stranded on a blank alternate buffer. On a
 * non-TTY stream (piped output, tests) this is a no-op.
 */
export function enterAltScreen(stream: NodeJS.WriteStream = process.stdout): () => void {
	if (!stream.isTTY) return () => {}

	stream.write(ENTER_ALT_SCREEN)

	let restored = false

	const restore = () => {
		if (restored) return

		restored = true

		stream.write(EXIT_ALT_SCREEN)
	}

	process.once('exit', restore)

	return restore
}
