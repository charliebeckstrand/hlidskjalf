import { describe, expect, it } from 'vitest'

import { hyperlink, truncateEnd } from '../src/links.js'

const ESC = String.fromCharCode(27)
const OSC8 = `${ESC}]8;;`
// Ink's renderer only recognises BEL-terminated OSC 8 links (see links.ts), so
// that's the terminator we emit — ST would be mis-tokenised and ring the bell.
const BEL = String.fromCharCode(7)

describe('hyperlink', () => {
	it('wraps a label in an OSC 8 sequence targeting the full url', () => {
		const url = 'http://localhost:3000'

		expect(hyperlink(url, 'http://localh…')).toBe(`${OSC8}${url}${BEL}http://localh…${OSC8}${BEL}`)
	})

	it('defaults the visible label to the url itself', () => {
		const url = 'http://localhost:5173'

		expect(hyperlink(url)).toBe(`${OSC8}${url}${BEL}${url}${OSC8}${BEL}`)
	})

	it('terminates with BEL, not ST, so Ink keeps the link intact', () => {
		// Ink's tokenizer scans for BEL to find the link target; an ST terminator
		// (ESC \) would make it drop the label and strand a bell-ringing BEL.
		const link = hyperlink('http://localhost:3000', 'http://localh…')

		expect(link).not.toContain(`${ESC}\\`)
		expect(link).toContain(BEL)
	})

	it('keeps the full url as the target even when the label is truncated', () => {
		const url = 'http://localhost:3000'

		const link = hyperlink(url, truncateEnd(url, 10))

		// The clickable target (between the introducer and the first terminator) is the full url.
		const target = link.slice(OSC8.length, link.indexOf(BEL))

		expect(target).toBe(url)
	})
})

describe('truncateEnd', () => {
	it('returns the text unchanged when it fits', () => {
		expect(truncateEnd('http://localhost:3000', 30)).toBe('http://localhost:3000')
	})

	it('returns the text unchanged at exactly the width', () => {
		expect(truncateEnd('abcde', 5)).toBe('abcde')
	})

	it('appends a single-column ellipsis when shortened', () => {
		// Result is exactly `width` columns: 9 chars + the ellipsis = 10.
		expect(truncateEnd('http://localhost:3000', 10)).toBe('http://lo…')
	})

	it('returns just an ellipsis at width 1', () => {
		expect(truncateEnd('http://localhost', 1)).toBe('…')
	})

	it('returns an empty string for a non-positive width', () => {
		expect(truncateEnd('http://localhost', 0)).toBe('')
		expect(truncateEnd('http://localhost', -5)).toBe('')
	})
})
