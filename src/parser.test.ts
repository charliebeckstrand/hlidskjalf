import { describe, expect, it } from 'vitest'

import { parseLine, sanitizeForDisplay, stripAnsi } from './parser.js'

describe('parseLine', () => {
	describe('ready status', () => {
		it('detects "running on" with URL', () => {
			const result = parseLine('Server running on http://localhost:3000')
			expect(result).toEqual({ status: 'ready', url: 'http://localhost:3000' })
		})

		it('detects "listening on" with URL', () => {
			const result = parseLine('App listening on https://localhost:8080')
			expect(result).toEqual({ status: 'ready', url: 'https://localhost:8080' })
		})

		it('detects "started" with localhost URL', () => {
			const result = parseLine('Server started at http://localhost:4000')
			expect(result).toEqual({ status: 'ready', url: 'http://localhost:4000' })
		})

		it('detects Vite ready message', () => {
			const result = parseLine('  VITE v5.0.0  ready in 320 ms')
			expect(result).toEqual({ status: 'ready' })
		})

		it('detects Vite ready case-insensitive', () => {
			const result = parseLine('  vite v5.0.0  ready in 200 ms')
			expect(result).toEqual({ status: 'ready' })
		})

		it('detects "Local:" URL (Vite-style)', () => {
			const result = parseLine('  ➜  Local:   http://localhost:5173/')
			expect(result).toEqual({ status: 'ready', url: 'http://localhost:5173' })
		})
	})

	describe('watching status', () => {
		it('detects esbuild build success with lightning emoji', () => {
			const result = parseLine('⚡ Build success')
			expect(result).toEqual({ status: 'watching' })
		})

		it('detects esbuild build success with variation selector', () => {
			const result = parseLine('⚡\uFE0F Build success')
			expect(result).toEqual({ status: 'watching' })
		})

		it('detects "Watching for changes"', () => {
			const result = parseLine('Watching for changes...')
			expect(result).toEqual({ status: 'watching' })
		})
	})

	describe('building status', () => {
		it('detects "Build start"', () => {
			const result = parseLine('Build start')
			expect(result).toEqual({ status: 'building' })
		})
	})

	describe('error status', () => {
		it('detects [ERROR] tag', () => {
			const result = parseLine('[ERROR] Something went wrong')
			expect(result).toEqual({ status: 'error' })
		})

		it('detects "Error:" with capital E', () => {
			const result = parseLine('Error: module not found')
			expect(result).toEqual({ status: 'error' })
		})

		it('detects "error " with lowercase e', () => {
			const result = parseLine('error TS2304: Cannot find name')
			expect(result).toEqual({ status: 'error' })
		})

		it('detects "process exit"', () => {
			const result = parseLine('process exit with code 1')
			expect(result).toEqual({ status: 'error' })
		})
	})

	describe('URL extraction', () => {
		it('extracts localhost URL', () => {
			const result = parseLine('running on http://localhost:3000')
			expect(result.url).toBe('http://localhost:3000')
		})

		it('extracts 127.0.0.1 URL', () => {
			const result = parseLine('running on http://127.0.0.1:8080')
			expect(result.url).toBe('http://127.0.0.1:8080')
		})

		it('extracts [::1] URL', () => {
			const result = parseLine('running on http://[::1]:5000')
			expect(result.url).toBe('http://[::1]:5000')
		})

		it('extracts 0.0.0.0 URL', () => {
			const result = parseLine('running on http://0.0.0.0:9000')
			expect(result.url).toBe('http://0.0.0.0:9000')
		})

		it('strips trailing punctuation from URL', () => {
			const result = parseLine('running on http://localhost:3000.')
			expect(result.url).toBe('http://localhost:3000')
		})

		it('rejects non-localhost URLs', () => {
			const result = parseLine('running on http://example.com:3000')
			expect(result.url).toBeUndefined()
		})
	})

	describe('DTS lines', () => {
		it('skips lines containing DTS', () => {
			const result = parseLine('DTS Build start')
			expect(result).toEqual({})
		})

		it('skips DTS even with error-like content', () => {
			const result = parseLine('[ERROR] DTS generation failed')
			expect(result).toEqual({})
		})
	})

	describe('edge cases', () => {
		it('returns empty for unrecognized lines', () => {
			const result = parseLine('just some regular log output')
			expect(result).toEqual({})
		})

		it('returns empty for empty string', () => {
			expect(parseLine('')).toEqual({})
		})

		it('truncates very long lines', () => {
			const longLine = 'Error: ' + 'x'.repeat(10000)
			const result = parseLine(longLine)
			expect(result.status).toBe('error')
		})
	})
})

describe('sanitizeForDisplay', () => {
	it('preserves plain text', () => {
		expect(sanitizeForDisplay('hello world')).toBe('hello world')
	})

	it('preserves SGR color codes', () => {
		const colored = '\x1b[31mred text\x1b[0m'
		expect(sanitizeForDisplay(colored)).toBe(colored)
	})

	it('strips cursor movement sequences', () => {
		expect(sanitizeForDisplay('\x1b[2Ahello')).toBe('hello')
	})

	it('strips screen clear sequences', () => {
		expect(sanitizeForDisplay('\x1b[2Jhello')).toBe('hello')
	})

	it('strips OSC title sequences (BEL terminated)', () => {
		expect(sanitizeForDisplay('\x1b]0;My Title\x07hello')).toBe('hello')
	})

	it('strips OSC title sequences (ST terminated)', () => {
		expect(sanitizeForDisplay('\x1b]0;My Title\x1b\\hello')).toBe('hello')
	})

	it('strips terminal reset', () => {
		expect(sanitizeForDisplay('\x1bchello')).toBe('hello')
	})

	it('strips character set selection', () => {
		expect(sanitizeForDisplay('\x1b(Bhello')).toBe('hello')
	})

	it('handles mixed SGR and non-SGR sequences', () => {
		const input = '\x1b[2J\x1b[31mcolored\x1b[0m\x1b[Hrest'
		const result = sanitizeForDisplay(input)
		expect(result).toBe('\x1b[31mcolored\x1b[0mrest')
	})
})

describe('stripAnsi', () => {
	it('strips all ANSI codes including SGR', () => {
		const input = '\x1b[31mred text\x1b[0m'
		expect(stripAnsi(input)).toBe('red text')
	})

	it('returns plain text unchanged', () => {
		expect(stripAnsi('hello')).toBe('hello')
	})
})
