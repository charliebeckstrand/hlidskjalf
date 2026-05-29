import type { Status } from './types.js'

interface ParsedLine {
	status?: Status
	url?: string
}

/** Maximum line length to parse — prevents ReDoS on extremely long lines */
const MAX_PARSE_LENGTH = 4096

/** Loopback hosts we're willing to surface a URL for */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

/**
 * Extract a loopback http(s) origin (scheme + host + port) from a raw capture,
 * or undefined if it isn't a local URL. Trailing punctuation swept up by the
 * matcher's `\S+` is trimmed first so the URL parser doesn't reject it.
 */
function localOrigin(raw: string): string | undefined {
	const cleaned = raw.replace(/[.,;:!?)}\]]+$/, '')

	let parsed: URL

	try {
		parsed = new URL(cleaned)
	} catch {
		return undefined
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined

	if (!parsed.port) return undefined

	if (!LOCAL_HOSTS.has(parsed.hostname)) return undefined

	return parsed.origin
}

// Skip DTS lines — secondary build phase, should not affect status
const DTS = /\bDTS\b/

const baseMatchers: { pattern: RegExp; status: Status }[] = [
	{ pattern: /running on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening at (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /started.*?(https?:\/\/localhost:\d+)/, status: 'ready' },
	{ pattern: /\bVITE\b.*?\bready in\b/i, status: 'ready' },
	{ pattern: /\bLocal:\s+(https?:\/\/\S+)/, status: 'ready' },
	// ⚡ may include U+FE0F variation selector
	{ pattern: /⚡\uFE0F?\s*Build success/, status: 'watching' },
	{ pattern: /Build start/, status: 'building' },
	{ pattern: /Watching for changes/, status: 'watching' },
	// Bare readiness signal — no URL on the line (e.g. Pino logs the port on a separate line).
	// Keep below URL-bearing matchers so URL extraction still wins when both could match.
	{ pattern: /\blistening\b/i, status: 'ready' },
	{ pattern: /\[ERROR\]/, status: 'error' },
	{ pattern: /[Ee]rror[\s:]/, status: 'error' },
	{ pattern: /process exit/, status: 'error' },
]

// A matcher whose pattern embeds the `http` literal can only ever match a line
// that contains `http`. Flag those so the loop can skip them with a single cheap
// substring check on the dominant no-URL line, rather than running each regex.
// Derived from the source so it stays in sync if a pattern is added or changed.
const matchers = baseMatchers.map((m) => ({ ...m, needsHttp: m.pattern.source.includes('http') }))

export function parseLine(line: string): ParsedLine {
	const truncated = line.length > MAX_PARSE_LENGTH ? line.slice(0, MAX_PARSE_LENGTH) : line

	if (DTS.test(truncated)) return {}

	const hasHttp = truncated.includes('http')

	for (const { pattern, status, needsHttp } of matchers) {
		if (needsHttp && !hasHttp) continue

		const match = truncated.match(pattern)

		if (match) {
			const url = match[1] ? localOrigin(match[1]) : undefined

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
