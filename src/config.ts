/**
 * Public configuration surface (the `config` build entry — `defineConfig` is what a
 * `hlidskjalf.config.ts` imports) plus the loader that resolves persisted config.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SortOrder } from './types.js'
import { parseTheme, type ThemeName } from './ui.js'
import { isPlainObject, normalizeFilters } from './workspaces.js'

/**
 * User-facing configuration. Every field mirrors a CLI flag and is optional; anything
 * omitted falls back to the CLI flag, then the built-in default. Persist these in a
 * `hlidskjalf.config.ts` file or a `hlidskjalf` key in `package.json`.
 */
export interface Config {
	/** Include only matching workspaces. Append `...` to a name for its transitive deps. */
	filter?: string[]
	/** Sort the dashboard `alphabetical`ly (default) or in dependency `run` order. */
	order?: SortOrder
	/** Custom header title. Defaults to `Hlidskjalf`. */
	title?: string
	/** Show CPU and memory usage per workspace. Defaults to `false`. */
	metrics?: boolean
	/** Re-discover workspaces when `package.json` files change. Defaults to `true`. */
	watch?: boolean
	/**
	 * Colour theme. Defaults to `bifrost` (icy blues and purples). Accepts a realm name
	 * (`niflheim`, `muspelheim`, `yggdrasil`) or an elemental alias (`ice`, `fire`, `earth`).
	 * See {@link themes} for the palettes or define your own with {@link parseTheme}.
	 */
	theme?: ThemeName
}

/**
 * Identity helper that gives a `hlidskjalf.config.ts` full type checking:
 *
 * ```ts
 * import { defineConfig } from 'hlidskjalf'
 * export default defineConfig({ order: 'run', metrics: true })
 * ```
 */
export function defineConfig(config: Config): Config {
	return config
}

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

	if (typeof raw.title === 'string') config.title = raw.title

	if (typeof raw.metrics === 'boolean') config.metrics = raw.metrics

	if (typeof raw.watch === 'boolean') config.watch = raw.watch

	const theme = parseTheme(raw.theme)

	if (theme) config.theme = theme

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

	if (!isPlainObject(parsed)) return {}

	const key = parsed[PACKAGE_JSON_KEY]

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
 * Resolve persisted configuration for the project at `root`. A dedicated config file
 * takes precedence over the package.json key; CLI flags (applied by the caller) still
 * override everything here.
 */
export async function loadConfig(root: string): Promise<Config> {
	const fromPkg = fromPackageJson(root)

	const fromFile = await fromConfigFile(root)

	return { ...fromPkg, ...fromFile }
}
