import type { Status } from './types.js'

interface ParsedLine {
	status?: Status
	url?: string
}

/** Maximum line length to parse — prevents ReDoS on extremely long lines */
const MAX_PARSE_LENGTH = 4096

/** Validates that a URL is a safe localhost/network URL */
const SAFE_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d{1,5}\/?$/

// Skip DTS lines — secondary build phase, should not affect status
const DTS = /\bDTS\b/

const matchers: { pattern: RegExp; status: Status }[] = [
	{ pattern: /running on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /started.*?(https?:\/\/localhost:\d+)/, status: 'ready' },
	{ pattern: /\bVITE\b.*?\bready in\b/i, status: 'ready' },
	{ pattern: /\bLocal:\s+(https?:\/\/\S+)/, status: 'ready' },
	// ⚡ may include U+FE0F variation selector
	{ pattern: /⚡\uFE0F?\s*Build success/, status: 'watching' },
	{ pattern: /Build start/, status: 'building' },
	{ pattern: /Watching for changes/, status: 'watching' },
	{ pattern: /[Ee]rror[\s:]/, status: 'error' },
	{ pattern: /process exit/, status: 'error' },
]

export function parseLine(line: string): ParsedLine {
	const truncated = line.length > MAX_PARSE_LENGTH ? line.slice(0, MAX_PARSE_LENGTH) : line

	if (DTS.test(truncated)) return {}

	for (const { pattern, status } of matchers) {
		const match = truncated.match(pattern)
		if (match) {
			const url = match[1] && SAFE_URL.test(match[1]) ? match[1] : undefined
			return { status, url }
		}
	}

	return {}
}

export { stripVTControlCharacters as stripAnsi } from 'node:util'

/**
 * Strip all escape sequences EXCEPT SGR color/style codes (\x1b[...m).
 * Uses a whitelist approach: only SGR passes through. Everything else is stripped,
 * including cursor movement, screen clears, title changes, hyperlinks, bracketed
 * paste, character set selection, and single-character ESC sequences (e.g. \x1bc reset).
 */
export function sanitizeForDisplay(text: string): string {
	const NON_SGR_ESCAPES =
		// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip terminal escape sequences
		/\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[?>=]*[\d;]*[A-Za-ln-z@~`]|\([A-Za-z]|[^[(\]\x1b])/g
	return text.replace(NON_SGR_ESCAPES, '')
}
