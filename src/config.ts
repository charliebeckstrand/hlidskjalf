import type { SortOrder } from './types.js'

/**
 * User-facing configuration. Every field mirrors a CLI flag and is optional;
 * anything omitted falls back to the CLI flag, then to the built-in default.
 * Persist these in a `hlidskjalf.config.ts` file or a `hlidskjalf` key in
 * `package.json` so flags don't have to be retyped on every run.
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
}

/**
 * Identity helper that gives a `hlidskjalf.config.ts` file full type checking
 * and autocompletion:
 *
 * ```ts
 * import { defineConfig } from 'hlidskjalf'
 *
 * export default defineConfig({ order: 'run', metrics: true })
 * ```
 */
export function defineConfig(config: Config): Config {
	return config
}
