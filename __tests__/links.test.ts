import { describe, expect, it } from 'vitest'

import { hyperlink, truncateEnd } from '../src/links.js'

const ESC = String.fromCharCode(27)
const OSC8 = `${ESC}]8;;`
const ST = `${ESC}\\`

describe('hyperlink', () => {
	it('wraps a label in an OSC 8 sequence targeting the full url', () => {
		const url = 'http://localhost:3000'

		expect(hyperlink(url, 'http://localh…')).toBe(`${OSC8}${url}${ST}http://localh…${OSC8}${ST}`)
	})

	it('defaults the visible label to the url itself', () => {
		const url = 'http://localhost:5173'

		expect(hyperlink(url)).toBe(`${OSC8}${url}${ST}${url}${OSC8}${ST}`)
	})

	it('keeps the full url as the target even when the label is truncated', () => {
		const url = 'http://localhost:3000'

		const link = hyperlink(url, truncateEnd(url, 10))

		// The clickable target (between the introducer and the first ST) is the full url.
		const target = link.slice(OSC8.length, link.indexOf(ST))

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
