/**
 * Terminal escape-sequence helpers: OSC 8 hyperlinks and the alternate screen buffer.
 * No Ink/React imports, so each is unit-testable.
 */

const ESC = String.fromCharCode(27)

/** OSC 8 hyperlink introducer (no params): ESC ] 8 ; ; */
const OSC8 = `${ESC}]8;;`

/**
 * OSC terminator. The spec allows BEL or ST, but Ink's renderer
 * (`@alcalzone/ansi-tokenize`) recognises only BEL — feeding it ST makes the tokenizer
 * miss the terminator, drop the label on narrow columns, and strand a BEL that rings the
 * bell on every re-render. Terminate with BEL.
 */
const BEL = String.fromCharCode(7)

/**
 * Wrap `label` in an OSC 8 hyperlink pointing at `url`. The clickable target is always
 * the full `url` while only `label` renders, so a truncated label still opens the complete
 * address. Terminals without OSC 8 show `label` as plain text.
 */
export function hyperlink(url: string, label: string = url): string {
	return `${OSC8}${url}${BEL}${label}${OSC8}${BEL}`
}

/**
 * Truncate `text` to at most `width` display columns, with a single-column ellipsis when
 * shortened. Pre-fits a hyperlink label so Ink never truncates it itself (its truncator
 * isn't OSC 8 aware). URLs are ASCII, so chars map 1:1 to columns.
 */
export function truncateEnd(text: string, width: number): string {
	if (width <= 0) return ''

	if (text.length <= width) return text

	if (width === 1) return '...'

	return `${text.slice(0, width - 1)}...`
}

/** DECSET/DECRST 1049: switch to / restore the alternate screen buffer. */
const ENTER_ALT_SCREEN = '\x1b[?1049h'
const EXIT_ALT_SCREEN = '\x1b[?1049l'

/**
 * Switch `stream` to the alternate screen (the buffer vim/htop use, so frames never land
 * in scrollback) and return an idempotent restore function. A `process.exit` listener
 * restores the primary screen even on an abrupt exit. No-op on a non-TTY stream (piped
 * output, tests).
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
