import { parseArgs } from 'node:util'
import { render } from 'ink'
import { App } from './app.js'
import { loadConfig } from './config.js'
import { sanitizeForDisplay } from './parser.js'
import type { Options, SortOrder } from './types.js'
import {
	DEFAULT_THEME,
	enterAltScreen,
	parseTheme,
	setTheme,
	THEME_ALIASES,
	themes,
} from './ui/index.js'
import { normalizeFilters } from './workspaces.js'

// `--metrics` / `--watch` accept an optional `=true` / `=false` value that parseArgs won't
// take on a boolean flag, so pull them out up front and treat them as explicit overrides.
// A bare `--metrics` / `--watch` still reads as `true`.
const argv = process.argv.slice(2)

const explicit: { metrics?: boolean; watch?: boolean } = {}

const args = argv.filter((arg) => {
	if (arg === '--metrics' || arg === '--metrics=true') {
		explicit.metrics = true

		return false
	}

	if (arg === '--metrics=false') {
		explicit.metrics = false

		return false
	}

	if (arg === '--watch' || arg === '--watch=true') {
		explicit.watch = true

		return false
	}

	if (arg === '--watch=false') {
		explicit.watch = false

		return false
	}

	return true
})

const { values } = parseArgs({
	args,
	options: {
		filter: { type: 'string', multiple: true },
		order: { type: 'string' },
		title: { type: 'string' },
		theme: { type: 'string' },
	},
})

const root = process.cwd()

// Precedence: CLI flag > config file / package.json key > built-in default.
const config = await loadConfig(root)

const cliFilter = values.filter ? normalizeFilters(values.filter) : undefined

// A CLI filter that normalized to nothing (every pattern invalid) shouldn't silently
// launch every workspace — fall back to a configured filter as if no `--filter` passed.
const filter = cliFilter?.length ? cliFilter : config.filter

const rawOrder = values.order ?? config.order

const order: SortOrder = rawOrder === 'run' ? 'run' : 'alphabetical'

// A repo's `dev` script controls argv (`hlidskjalf --title=...`), so a `--title` flag is
// as untrusted as the config-file title — scrub terminal escapes before it reaches the
// header, matching the sanitize applied to config.title in loadConfig.
const title =
	values.title !== undefined ? sanitizeForDisplay(values.title) : (config.title ?? 'Hlidskjalf')

const metrics = explicit.metrics ?? config.metrics ?? false

const watch = explicit.watch ?? config.watch ?? true

// A `--theme` flag that isn't a known palette shouldn't crash the dashboard — warn and
// fall through to the configured theme, then the built-in default.
const flagTheme = parseTheme(values.theme)

if (values.theme !== undefined && flagTheme === undefined) {
	const accepted = [...Object.keys(themes), ...Object.keys(THEME_ALIASES)].join(', ')

	// values.theme can carry terminal escapes when argv comes from an untrusted dev script.
	console.error(
		`Ignoring --theme "${sanitizeForDisplay(values.theme)}": expected one of ${accepted}.`,
	)
}

const theme = flagTheme ?? config.theme ?? DEFAULT_THEME

setTheme(theme)

const options: Options = {
	root,
	order,
	filter: filter?.length ? filter : undefined,
	title,
	metrics,
	watch,
	theme,
}

// Render on the alternate screen so the dashboard never accumulates in the scrollback;
// restore the primary screen however we exit.
const restoreScreen = enterAltScreen()

try {
	const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

	await waitUntilExit()
} finally {
	restoreScreen()
}

process.exit(0)
