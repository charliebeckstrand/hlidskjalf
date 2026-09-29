/**
 * CLI option resolution: argv, persisted config, and built-in defaults folded into the
 * {@link Options} the app runs with. Pure apart from the invalid-filter warnings
 * `normalizeFilters` prints, so the precedence rules README documents are unit-testable.
 */

import { parseArgs } from 'node:util'
import type { Config } from './config/index.js'
import { sanitizeForDisplay } from './logs/index.js'
import type { Options, SortOrder } from './types.js'
import { DEFAULT_THEME, parseTheme, THEME_ALIASES, themes } from './ui/index.js'
import { normalizeFilters } from './workspaces.js'

const DEFAULT_TITLE = 'Hlidskjalf'

const SORT_ORDERS: readonly SortOrder[] = ['alphabetical', 'run']

export interface Resolved {
	options: Options
	/** Problems with the arguments, already scrubbed of terminal escapes, for the caller to print. */
	warnings: string[]
}

/**
 * Pull `--metrics` / `--watch` out of argv. They accept an optional `=true` / `=false` that
 * parseArgs won't take on a boolean flag, so they're read here as explicit overrides; a bare
 * flag reads as `true`.
 */
function extractBooleanFlags(argv: string[]): {
	rest: string[]
	flags: { metrics?: boolean; watch?: boolean }
} {
	const flags: { metrics?: boolean; watch?: boolean } = {}

	const rest = argv.filter((arg) => {
		for (const name of ['metrics', 'watch'] as const) {
			if (arg === `--${name}` || arg === `--${name}=true`) {
				flags[name] = true

				return false
			}

			if (arg === `--${name}=false`) {
				flags[name] = false

				return false
			}
		}

		return true
	})

	return { rest, flags }
}

/** strict:false types every parsed value as `string | boolean`; keep only real strings. */
const flagString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined

/**
 * Resolve the run options. Precedence: CLI flag > config file / package.json key (already
 * merged into `config`) > built-in default.
 *
 * A repo's `dev` script controls argv (`hlidskjalf ...`), so every flag is as untrusted as the
 * config file: unknown arguments are ignored rather than fatal, and anything echoed back is
 * scrubbed of terminal escapes.
 */
export function resolveOptions(argv: string[], config: Config, root: string): Resolved {
	const warnings: string[] = []

	const { rest, flags } = extractBooleanFlags(argv)

	// Non-strict: an argument hlidskjalf doesn't define lands in `values` unread instead of
	// crashing the launch with a parseArgs stack trace.
	const { values } = parseArgs({
		args: rest,
		strict: false,
		allowPositionals: true,
		options: {
			filter: { type: 'string', multiple: true },
			order: { type: 'string' },
			title: { type: 'string' },
			theme: { type: 'string' },
		},
	})

	const rawFilter = Array.isArray(values.filter)
		? values.filter.filter((v): v is string => typeof v === 'string')
		: undefined

	const cliFilter = rawFilter ? normalizeFilters(rawFilter) : undefined

	// A CLI filter that normalized to nothing (every pattern invalid) shouldn't silently
	// launch every workspace — fall back to a configured filter as if no `--filter` passed.
	const filter = cliFilter?.length ? cliFilter : config.filter

	const orderFlag = flagString(values.order)

	const flagOrder = SORT_ORDERS.find((o) => o === orderFlag)

	if (orderFlag !== undefined && flagOrder === undefined) {
		warnings.push(
			`Ignoring --order "${sanitizeForDisplay(orderFlag)}": expected one of ${SORT_ORDERS.join(', ')}.`,
		)
	}

	const themeFlag = flagString(values.theme)

	const flagTheme = parseTheme(themeFlag)

	if (themeFlag !== undefined && flagTheme === undefined) {
		const accepted = [...Object.keys(themes), ...Object.keys(THEME_ALIASES)].join(', ')

		warnings.push(
			`Ignoring --theme "${sanitizeForDisplay(themeFlag)}": expected one of ${accepted}.`,
		)
	}

	const titleFlag = flagString(values.title)

	return {
		options: {
			root,
			order: flagOrder ?? config.order ?? 'alphabetical',
			filter: filter?.length ? filter : undefined,
			// config.title is sanitized by loadConfig; the flag is scrubbed here to match.
			title:
				titleFlag !== undefined ? sanitizeForDisplay(titleFlag) : (config.title ?? DEFAULT_TITLE),
			showMetrics: flags.metrics ?? config.metrics ?? false,
			watch: flags.watch ?? config.watch ?? true,
			theme: flagTheme ?? config.theme ?? DEFAULT_THEME,
		},
		warnings,
	}
}
