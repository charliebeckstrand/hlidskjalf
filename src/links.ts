/**
 * Terminal hyperlink + truncation helpers for the dashboard's URL column. Kept
 * pure so the escape-sequence construction and the truncation maths can be unit
 * tested without rendering Ink.
 */

const ESC = String.fromCharCode(27)
/** OSC 8 hyperlink introducer (no params): ESC ] 8 ; ; */
const OSC8 = `${ESC}]8;;`
/** String Terminator: ESC \ */
const ST = `${ESC}\\`

/**
 * Wrap `label` in an OSC 8 hyperlink pointing at `url`. The clickable target is
 * always the full `url`, while the terminal only renders `label` — so a
 * shortened label still opens the complete address instead of the visible
 * (truncated) segment, which is what a terminal's auto-linkifier would otherwise
 * latch onto. Terminals without OSC 8 support ignore the escapes and show
 * `label` as plain text.
 */
export function hyperlink(url: string, label: string = url): string {
	return `${OSC8}${url}${ST}${label}${OSC8}${ST}`
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
