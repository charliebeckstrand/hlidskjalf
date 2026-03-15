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

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI escape codes
	return text.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1b\\))/g, '')
}

/**
 * Strip dangerous terminal escape sequences that could manipulate the terminal
 * beyond simple color/style codes (e.g. title changes, cursor movement, hyperlinks,
 * bracketed paste, screen clears). Preserves SGR color/style codes for display.
 */
export function sanitizeForDisplay(text: string): string {
	const DANGEROUS_ESCAPES =
		// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip terminal escape sequences
		/\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-9;]*[A-HJKSTfnlh]|\[[\d;]*[pq]|\[\?[0-9;]*[hlsru]|\[=[0-9]*[A-Za-z]|\([\w])/g
	return text.replace(DANGEROUS_ESCAPES, '')
}
