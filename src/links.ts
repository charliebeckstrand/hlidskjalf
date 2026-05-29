/**
 * Terminal hyperlink + truncation helpers for the dashboard's URL column. Kept
 * pure so the escape-sequence construction and the truncation maths can be unit
 * tested without rendering Ink.
 */

const ESC = String.fromCharCode(27)

/** OSC 8 hyperlink introducer (no params): ESC ] 8 ; ; */
const OSC8 = `${ESC}]8;;`

/**
 * OSC terminator. The spec allows either BEL (`\x07`) or ST (`ESC \`), but these
 * strings are handed to Ink, whose renderer (`@alcalzone/ansi-tokenize`) only
 * recognises the BEL form — it scans for `\x07` to find the link target and
 * re-emits links BEL-terminated. Feeding it an ST-terminated link makes the
 * tokenizer miss the terminator, drop the visible label on narrow columns, and
 * strand the BEL it emits outside a valid OSC sequence, which rings the
 * terminal bell on every re-render. So we terminate with BEL to match it.
 */
const BEL = String.fromCharCode(7)

/**
 * Wrap `label` in an OSC 8 hyperlink pointing at `url`. The clickable target is
 * always the full `url`, while the terminal only renders `label` — so a
 * shortened label still opens the complete address instead of the visible
 * (truncated) segment, which is what a terminal's auto-linkifier would otherwise
 * latch onto. Terminals without OSC 8 support ignore the escapes and show
 * `label` as plain text.
 */
export function hyperlink(url: string, label: string = url): string {
	return `${OSC8}${url}${BEL}${label}${OSC8}${BEL}`
}

/**
 * Truncate `text` to at most `width` display columns, appending a single-column
 * ellipsis when shortened. Used to pre-fit a hyperlink label so Ink never has to
 * truncate it itself — its truncator isn't OSC 8 aware and would strip the link.
 * URLs here are ASCII, so character count maps 1:1 to columns.
 */
export function truncateEnd(text: string, width: number): string {
	if (width <= 0) return ''

	if (text.length <= width) return text

	if (width === 1) return '…'

	return `${text.slice(0, width - 1)}…`
}
