/**
 * Public configuration surface (the `config` build entry — `defineConfig` is what a
 * `hlidskjalf.config.ts` imports) plus the loader that resolves persisted config. The
 * loader internals (validation and the two sources) live in {@link ./utilities.ts}.
 */

import type { Config } from './types.js'
import { fromConfigFile, fromPackageJson } from './utilities.js'

export type { Config } from './types.js'

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
