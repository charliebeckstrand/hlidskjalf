/** The user-facing config shape, shared by the public surface and the loader. */

import type { SortOrder } from '../types.js'
import type { ThemeName } from '../ui/index.js'

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
