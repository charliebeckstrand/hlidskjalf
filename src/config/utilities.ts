/**
 * Loader internals for {@link ./index.ts}: the file-name table, the untrusted-input
 * validator, and the two config sources (a `hlidskjalf` package.json key and a dedicated
 * config file). Kept apart from the public surface so the entry stays a thin contract.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sanitizeForDisplay } from '../logs/index.js'
import { parseTheme } from '../ui/index.js'
import { isPlainObject } from '../utilities.js'
import { normalizeFilters } from '../workspaces.js'
import type { Config } from './index.js'

/**
 * Config file names tried in order, highest priority first. The `.ts` form is the
 * documented default; Node strips its types on import (>=22.18), so no build step is
 * needed. `.mjs`/`.js` are accepted for projects that prefer plain JS.
 */
const CONFIG_FILES = ['hlidskjalf.config.ts', 'hlidskjalf.config.mjs', 'hlidskjalf.config.js']

/** package.json key that may hold the same config inline. */
const PACKAGE_JSON_KEY = 'hlidskjalf'

/**
 * Coerce an untrusted object into a validated Config, silently dropping any field with
 * the wrong type or an out-of-range value. Returns only the surviving keys so merging
 * stays additive.
 */
function validate(raw: unknown, source: string): Config {
	if (!isPlainObject(raw)) {
		console.error(`Ignoring ${source}: expected a config object.`)

		return {}
	}

	const config: Config = {}

	if (Array.isArray(raw.filter)) {
		const strings = raw.filter.filter((v): v is string => typeof v === 'string')

		const filter = normalizeFilters(strings)

		if (filter.length) config.filter = filter
	}

	if (raw.order === 'run' || raw.order === 'alphabetical') config.order = raw.order

	// A title from an untrusted package.json key (pure JSON, no code execution) is
	// still rendered raw in the header — strip terminal escapes before it gets there.
	if (typeof raw.title === 'string') config.title = sanitizeForDisplay(raw.title)

	if (typeof raw.metrics === 'boolean') config.metrics = raw.metrics

	if (typeof raw.watch === 'boolean') config.watch = raw.watch

	const theme = parseTheme(raw.theme)

	if (theme) config.theme = theme

	return config
}

/** Read and validate the `hlidskjalf` key from the root package.json, if present. */
export function fromPackageJson(root: string): Config {
	const path = join(root, 'package.json')

	if (!existsSync(path)) return {}

	let parsed: unknown

	try {
		parsed = JSON.parse(readFileSync(path, 'utf-8'))
	} catch {
		return {}
	}

	if (!isPlainObject(parsed)) return {}

	const key = parsed[PACKAGE_JSON_KEY]

	if (key === undefined) return {}

	return validate(key, `package.json "${PACKAGE_JSON_KEY}" key`)
}

/** Import the first config file that exists and validate its default export. */
export async function fromConfigFile(root: string): Promise<Config> {
	for (const name of CONFIG_FILES) {
		const path = join(root, name)

		if (!existsSync(path)) continue

		try {
			const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }

			return validate(mod.default ?? mod, name)
		} catch (err) {
			console.error(`Ignoring ${name}: ${err instanceof Error ? err.message : 'failed to load'}`)

			return {}
		}
	}

	return {}
}
