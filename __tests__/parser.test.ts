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

	describe('matcher precedence', () => {
		it('classifies a line with an error keyword and a URL as error, attaching no URL', () => {
			// The error matcher sits above the bare `listening` fallback but below the
			// URL-bearing `running on`/`listening on` matchers. A line with an error word but
			// none of those URL phrases lands on error; the error matcher captures no group,
			// so no URL surfaces.
			expect(parseLine('error: failed to bind http://localhost:3000')).toEqual({
				status: 'error',
			})
		})

		it('lets a URL-bearing readiness phrase win over the bare listening fallback', () => {
			// "failed" is not an error keyword (only `error[\s:]`/`[ERROR]`/`process exit`
			// are), so the `listening on <url>` matcher fires first and surfaces the URL.
			expect(parseLine('failed, not listening on http://localhost:3000')).toEqual({
				status: 'ready',
				url: 'http://localhost:3000',
			})
		})

		it('keeps an error keyword above the bare listening fallback', () => {
			// The comment in parser.ts promises a failure line mentioning "listening" stays
			// an error; here the error matcher must beat the bare `\blistening\b` matcher.
			expect(parseLine('error: server not listening')).toEqual({ status: 'error' })
		})
	})

	describe('URL host and port edges', () => {
		it('drops a URL with no port while keeping the ready status', () => {
			// localOrigin requires an explicit port, so a portless URL classifies as ready
			// but surfaces nothing clickable.
			expect(parseLine('running on http://localhost')).toEqual({ status: 'ready' })
		})

		it('does not recognize a loopback IP after "started at" (localhost name only)', () => {
			// The `started.*?(https?://localhost:\d+)` matcher is literal-localhost; a
			// loopback IP matches no matcher and falls through to no classification.
			expect(parseLine('Server started at http://127.0.0.1:4000')).toEqual({})

			expect(parseLine('Server started at http://localhost:4000')).toEqual({
				status: 'ready',
				url: 'http://localhost:4000',
			})
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

		it('classifies a keyword that ends within the parse-length cap', () => {
			// `error: boom` ends at offset 4101; with the cap at 4096 the keyword's start
			// (4090) and the `error[\s:]` match both survive truncation.
			expect(parseLine(`${'x'.repeat(4090)}error: boom`).status).toBe('error')
		})

		it('ignores a keyword pushed entirely past the parse-length cap', () => {
			// Starting the keyword at offset 4096 puts it beyond the 4096-char slice, so the
			// truncated line carries no classifiable token.
			expect(parseLine(`${'x'.repeat(4096)}error: boom`)).toEqual({})
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
