import { stripVTControlCharacters } from 'node:util'
import type { Status } from '../types.js'
import { truncate } from '../utilities.js'

interface ParsedLine {
	status?: Status
	url?: string
}

/** Maximum line length to parse — prevents ReDoS on extremely long lines. */
const MAX_PARSE_LENGTH = 4096

/** Loopback hosts we're willing to surface a URL for. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])

/**
 * Extract a loopback http(s) origin (scheme + host + port) from a raw capture, or
 * undefined if it isn't a local URL. Trailing punctuation swept up by the matcher's
 * `\S+` is trimmed first so the URL parser doesn't reject it.
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

/** Skip DTS lines — a secondary build phase that doesn't affect status. */
const DTS = /\bDTS\b/

const baseMatchers: { pattern: RegExp; status: Status }[] = [
	{ pattern: /running on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening at (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /started.*?(https?:\/\/localhost:\d+)/, status: 'ready' },
	{ pattern: /\bVITE\b.*?\bready in\b/i, status: 'ready' },
	{ pattern: /\bLocal:\s+(https?:\/\/\S+)/, status: 'ready' },
	// ⚡ may include U+FE0F variation selector
	{ pattern: /⚡️?\s*Build success/, status: 'watching' },
	{ pattern: /Build start/, status: 'building' },
	{ pattern: /Watching for changes/, status: 'watching' },
	{ pattern: /\[ERROR\]/, status: 'error' },
	// Generic fallback. The negative lookbehind keeps a URL path segment — e.g. an access
	// log's `GET /error 200` — from flipping a healthy server to error, while still catching
	// `error:`, `error TS2304`, and suffixes like `TypeError:`.
	{ pattern: /(?<!\/)error[\s:]/i, status: 'error' },
	{ pattern: /process exit/, status: 'error' },
	// Bare readiness signal — no URL on the line (e.g. Pino logs the port separately).
	// Below URL-bearing matchers so URL extraction wins, and below the error matchers
	// so a failure line that mentions "listening" stays an error.
	{ pattern: /\blistening\b/i, status: 'ready' },
]

// A matcher whose pattern embeds `http` can only match a line containing `http`.
// Flag those so the loop skips them with one cheap substring check on the dominant
// no-URL line, rather than running each regex. Derived from source to stay in sync.
const matchers = baseMatchers.map((m) => ({ ...m, needsHttp: m.pattern.source.includes('http') }))

// The non-http matchers OR'd into one gate. On a line with no `http` — the dominant log
// line, which the loop already restricts to these matchers — a failure here means none of
// them can match, so the line is rejected after a single scan instead of running each
// regex. Built from the same `matchers` array (it can't drift out of sync) and excludes
// the http matchers, keeping the gate free of their heavy `\S+`/`.*?` patterns; an http
// line skips the gate and runs the full loop as before. Compiled case-insensitively, which
// only widens it — the loop still makes the authoritative, ordered, case-correct decision.
const ANY_NON_HTTP_MATCHER = new RegExp(
	matchers
		.filter((m) => !m.needsHttp)
		.map((m) => `(?:${m.pattern.source})`)
		.join('|'),
	'i',
)

export function parseLine(line: string): ParsedLine {
	const truncated = truncate(line, MAX_PARSE_LENGTH)

	if (DTS.test(truncated)) return {}

	const hasHttp = truncated.includes('http')

	if (!hasHttp && !ANY_NON_HTTP_MATCHER.test(truncated)) return {}

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

/**
 * Remove all ANSI escape sequences before classification. Every sequence begins
 * with ESC, so a line with no ESC byte is returned untouched without scanning it.
 */
export function stripAnsi(text: string): string {
	if (!text.includes('\x1b')) return text

	return stripVTControlCharacters(text)
}

const NON_SGR_ESCAPES =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip terminal escape sequences
	/\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[?>=]*[\d;]*[A-Za-ln-z@~`]|\([A-Za-z]|[^[(\]\x1b])/g

// Bare C0/DEL control bytes that aren't part of an escape sequence. Rendering them
// raw would ring the bell (BEL) or move the cursor (BS, CR, FF). Tab (\x09) and ESC
// (\x1b) are excluded: tab is benign whitespace and ESC introduces the SGR colours we keep.
const BARE_CONTROLS =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip terminal control characters
	/[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g

/**
 * Strip all escape sequences EXCEPT SGR colour/style codes (\x1b[...m), plus any
 * bare control characters — a whitelist so only SGR and printable text pass through.
 * Everything else (cursor moves, screen clears, titles, hyperlinks, bracketed paste,
 * lone control bytes such as BEL) is removed.
 */
export function sanitizeForDisplay(text: string): string {
	const hasEscape = text.includes('\x1b')

	// search() ignores /g lastIndex, so the regex is safe to reuse for the replace below.
	const hasControl = text.search(BARE_CONTROLS) !== -1

	if (!hasEscape && !hasControl) return text

	let out = text

	if (hasEscape) out = out.replace(NON_SGR_ESCAPES, '')

	if (hasControl) out = out.replace(BARE_CONTROLS, '')

	return out
}
