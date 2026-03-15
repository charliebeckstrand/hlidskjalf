import type { Status } from './types.js'

interface ParsedLine {
	status?: Status
	url?: string
}

// Skip DTS lines — secondary build phase, should not affect status
const DTS = /\bDTS\b/

const matchers: { pattern: RegExp; status: Status }[] = [
	{ pattern: /running on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /listening on (https?:\/\/\S+)/, status: 'ready' },
	{ pattern: /started.*(https?:\/\/localhost:\d+)/, status: 'ready' },
	{ pattern: /\bVITE\b.*\bready in\b/i, status: 'ready' },
	{ pattern: /\bLocal:\s+(https?:\/\/\S+)/, status: 'ready' },
	// ⚡ may include U+FE0F variation selector
	{ pattern: /⚡\uFE0F?\s*Build success/, status: 'watching' },
	{ pattern: /Build start/, status: 'building' },
	{ pattern: /Watching for changes/, status: 'watching' },
	{ pattern: /[Ee]rror[\s:]/, status: 'error' },
	{ pattern: /process exit/, status: 'error' },
]

export function parseLine(line: string): ParsedLine {
	if (DTS.test(line)) return {}

	for (const { pattern, status } of matchers) {
		const match = line.match(pattern)
		if (match) return { status, url: match[1] }
	}

	return {}
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI escape codes
	return text.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1b\\))/g, '')
}
