import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Config } from './config.js'
import type { SortOrder } from './types.js'
import { normalizeFilters } from './workspaces.js'

/**
 * Config file names tried in order, highest priority first. The `.ts` form is
 * the documented default; Node strips its types on import (>=22.18), so no build
 * step is needed. `.mjs`/`.js` are accepted for projects that prefer plain JS.
 */
const CONFIG_FILES = ['hlidskjalf.config.ts', 'hlidskjalf.config.mjs', 'hlidskjalf.config.js']

/** package.json key that may hold the same config inline. */
const PACKAGE_JSON_KEY = 'hlidskjalf'

/**
 * Coerce an untrusted object into a validated Config, silently dropping any
 * field with the wrong type or an out-of-range value. Returns only the keys
 * that survived validation so merging stays additive.
 */
function validate(raw: unknown, source: string): Config {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		console.error(`Ignoring ${source}: expected a config object.`)

		return {}
	}

	const obj = raw as Record<string, unknown>

	const config: Config = {}

	if (Array.isArray(obj.filter)) {
		const strings = obj.filter.filter((v): v is string => typeof v === 'string')

		const filter = normalizeFilters(strings)

		if (filter.length) config.filter = filter
	}

	if (obj.order === 'run' || obj.order === 'alphabetical') {
		config.order = obj.order satisfies SortOrder
	}

	if (typeof obj.title === 'string') config.title = obj.title

	if (typeof obj.metrics === 'boolean') config.metrics = obj.metrics

	if (typeof obj.watch === 'boolean') config.watch = obj.watch

	return config
}

/** Read and validate the `hlidskjalf` key from the root package.json, if present. */
function fromPackageJson(root: string): Config {
	const path = join(root, 'package.json')

	if (!existsSync(path)) return {}

	let parsed: unknown

	try {
		parsed = JSON.parse(readFileSync(path, 'utf-8'))
	} catch {
		return {}
	}

	if (typeof parsed !== 'object' || parsed === null) return {}

	const key = (parsed as Record<string, unknown>)[PACKAGE_JSON_KEY]

	if (key === undefined) return {}

	return validate(key, `package.json "${PACKAGE_JSON_KEY}" key`)
}

/** Import the first config file that exists and validate its default export. */
async function fromConfigFile(root: string): Promise<Config> {
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

/**
 * Resolve persisted configuration for the project at `root`. A dedicated config
 * file takes precedence over the package.json key; CLI flags (applied by the
 * caller) still override everything here.
 */
export async function loadConfig(root: string): Promise<Config> {
	const fromPkg = fromPackageJson(root)

	const fromFile = await fromConfigFile(root)

	return { ...fromPkg, ...fromFile }
}
