import { describe, expect, it } from 'vitest'
import { parseLine, sanitizeForDisplay, stripAnsi } from '../src/parser.js'

describe('parseLine', () => {
	describe('ready status', () => {
		it.each([
			['Server running on http://localhost:3000', 'http://localhost:3000'],
			['App listening on https://localhost:8080', 'https://localhost:8080'],
			['Server started at http://localhost:4000', 'http://localhost:4000'],
			['  ➜  Local:   http://localhost:5173/', 'http://localhost:5173'],
			['Server listening at http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
		])('detects a ready URL in %j', (line, url) => {
			expect(parseLine(line)).toEqual({ status: 'ready', url })
		})

		it.each([
			'  VITE v5.0.0  ready in 320 ms',
			'  vite v5.0.0  ready in 200 ms',
			'[11:31:59.315] INFO: bifrost listening',
			'Listening',
		])('detects ready without a URL in %j', (line) => {
			expect(parseLine(line)).toEqual({ status: 'ready' })
		})
	})

	describe('watching status', () => {
		it.each([
			'⚡ Build success',
			'⚡️ Build success',
			'Watching for changes...',
		])('detects watching in %j', (line) => {
			expect(parseLine(line)).toEqual({ status: 'watching' })
		})
	})

	it('detects "Build start" as building', () => {
		expect(parseLine('Build start')).toEqual({ status: 'building' })
	})

	describe('error status', () => {
		it.each([
			'[ERROR] Something went wrong',
			'Error: module not found',
			'error TS2304: Cannot find name',
			'process exit with code 1',
			'ERROR: boom',
			'Error: address already in use, not listening',
		])('detects an error in %j', (line) => {
			expect(parseLine(line)).toEqual({ status: 'error' })
		})

		it.each([
			'TypeError: undefined is not a function',
			'ReferenceError: x is not defined',
		])('detects a suffixed *Error in %j', (line) => {
			expect(parseLine(line)).toEqual({ status: 'error' })
		})

		it.each([
			'GET /error 200 12ms',
			'127.0.0.1 - GET /error 304',
		])('does not flag a /error url path in an access log: %j', (line) => {
			expect(parseLine(line)).toEqual({})
		})
	})

	describe('URL extraction', () => {
		it.each([
			'http://localhost:3000',
			'http://127.0.0.1:8080',
			'http://[::1]:5000',
			'http://0.0.0.0:9000',
		])('accepts loopback host %j', (url) => {
			expect(parseLine(`running on ${url}`).url).toBe(url)
		})

		it('strips trailing punctuation from a URL', () => {
			expect(parseLine('running on http://localhost:3000.').url).toBe('http://localhost:3000')
		})

		it('rejects non-loopback URLs', () => {
			expect(parseLine('running on http://example.com:3000').url).toBeUndefined()
		})

		it('keeps the ready status but drops an unparseable URL capture', () => {
			expect(parseLine('Server running on http://[bad')).toEqual({ status: 'ready' })
		})
	})

	describe('DTS lines', () => {
		it('skips lines containing DTS', () => {
			expect(parseLine('DTS Build start')).toEqual({})
		})

		it('skips DTS even with error-like content', () => {
			expect(parseLine('[ERROR] DTS generation failed')).toEqual({})
		})
	})

	describe('edge cases', () => {
		it('returns empty for unrecognized and empty lines', () => {
			expect(parseLine('just some regular log output')).toEqual({})

			expect(parseLine('')).toEqual({})
		})

		it('still classifies a very long line (after truncation)', () => {
			expect(parseLine(`Error: ${'x'.repeat(10_000)}`).status).toBe('error')
		})
	})
})

describe('sanitizeForDisplay', () => {
	it('preserves plain text and SGR colour codes', () => {
		expect(sanitizeForDisplay('hello world')).toBe('hello world')

		const colored = '\x1b[31mred text\x1b[0m'

		expect(sanitizeForDisplay(colored)).toBe(colored)
	})

	it.each([
		['\x1b[2Ahello', 'hello'],
		['\x1b[2Jhello', 'hello'],
		['\x1b]0;My Title\x07hello', 'hello'],
		['\x1b]0;My Title\x1b\\hello', 'hello'],
		['\x1bchello', 'hello'],
		['\x1b(Bhello', 'hello'],
	])('strips non-SGR escapes from %j', (input, expected) => {
		expect(sanitizeForDisplay(input)).toBe(expected)
	})

	it('keeps SGR while dropping surrounding non-SGR escapes', () => {
		expect(sanitizeForDisplay('\x1b[2J\x1b[31mcolored\x1b[0m\x1b[Hrest')).toBe(
			'\x1b[31mcolored\x1b[0mrest',
		)
	})

	it('strips bare control bytes (BEL, backspace, CR, form feed) but keeps tabs', () => {
		expect(sanitizeForDisplay('build done\x07')).toBe('build done')

		expect(sanitizeForDisplay('\x07')).toBe('')

		expect(sanitizeForDisplay('a\x08b\rc\x0cd')).toBe('abcd')

		expect(sanitizeForDisplay('\x1b[31mred\x1b[0m\tdone\x07')).toBe('\x1b[31mred\x1b[0m\tdone')
	})
})

describe('stripAnsi', () => {
	it('strips all ANSI codes including SGR', () => {
		expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text')
	})

	it('returns plain text unchanged', () => {
		expect(stripAnsi('hello')).toBe('hello')
	})
})
