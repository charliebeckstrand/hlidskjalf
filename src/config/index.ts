/**
 * Public configuration surface (the `config` build entry — `defineConfig` is what a
 * `hlidskjalf.config.ts` imports) plus the loader that resolves persisted config. The
 * loader internals (validation and the two sources) live in {@link ./utilities.ts}.
 */

import type { SortOrder } from '../types.js'
import type { ThemeName } from '../ui/index.js'
import { fromConfigFile, fromPackageJson } from './utilities.js'

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
	 * Colour theme. Defaults to `bifrost` (electric purples and sky blues). Accepts a realm
	 * name (`niflheim`, `muspelheim`, `yggdrasil`) or an elemental alias (`ice`, `fire`,
	 * `earth`). See {@link themes} for the available palettes.
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
 * Resolve persisted configuration for the project at `root`. A dedicated config file
 * takes precedence over the package.json key; CLI flags (applied by the caller) still
 * override everything here.
 */
export async function loadConfig(root: string): Promise<Config> {
	const fromPkg = fromPackageJson(root)

	const fromFile = await fromConfigFile(root)

	return { ...fromPkg, ...fromFile }
}
