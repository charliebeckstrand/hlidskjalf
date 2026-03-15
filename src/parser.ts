import type { Status } from './types.js'

export interface ParsedLine {
	status?: Status
	url?: string
}

// Skip DTS lines — secondary build phase, should not affect status
const DTS = /\bDTS\b/

const matchers: Array<{ pattern: RegExp; status: Status; captureUrl?: boolean }> = [
	{ pattern: /running on (https?:\/\/\S+)/, status: 'ready', captureUrl: true },
	{ pattern: /listening on (https?:\/\/\S+)/, status: 'ready', captureUrl: true },
	{ pattern: /started.*(https?:\/\/localhost:\d+)/, status: 'ready', captureUrl: true },
	{ pattern: /\bVITE\b.*\bready in\b/i, status: 'ready' },
	{ pattern: /\bLocal:\s+(https?:\/\/\S+)/, status: 'ready', captureUrl: true },
	// ⚡ may include U+FE0F variation selector
	{ pattern: /⚡\uFE0F?\s*Build success/, status: 'watching' },
	{ pattern: /Build start/, status: 'building' },
	{ pattern: /Watching for changes/, status: 'watching' },
	{ pattern: /[Ee]rror[\s:]/, status: 'error' },
	{ pattern: /process exit/, status: 'error' },
]

export function parseLine(line: string): ParsedLine {
	if (DTS.test(line)) return {}

	for (const { pattern, status, captureUrl } of matchers) {
		const match = line.match(pattern)

		if (match) {
			return { status, url: captureUrl ? match[1] : undefined }
		}
	}

	return {}
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI escape codes
	return text.replace(/\x1b\[[0-9;]*m/g, '')
}
