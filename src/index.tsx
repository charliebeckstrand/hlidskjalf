import { parseArgs } from 'node:util'

import { render } from 'ink'

import { App } from './app.js'
import { loadConfig } from './config/loader.js'
import { enterAltScreen } from './terminal.js'
import type { Options, SortOrder } from './types.js'
import { normalizeFilters } from './workspaces.js'

// `--no-watch` / `--no-metrics` aren't valid parseArgs tokens, so pull them out
// up front and treat them as explicit `false` overrides for the boolean flags.
const argv = process.argv.slice(2)

const explicit: { metrics?: boolean; watch?: boolean } = {}

const args = argv.filter((arg) => {
	if (arg === '--no-metrics') {
		explicit.metrics = false

		return false
	}

	if (arg === '--no-watch') {
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
		metrics: { type: 'boolean' },
		watch: { type: 'boolean' },
	},
})

const root = process.cwd()

// Precedence: CLI flag > config file / package.json key > built-in default.
const config = await loadConfig(root)

const cliFilter = values.filter ? normalizeFilters(values.filter) : undefined

// A CLI filter that normalized to nothing (every pattern was invalid) shouldn't
// silently launch every workspace — fall back to a configured filter as if no
// `--filter` was passed at all.
const filter = cliFilter?.length ? cliFilter : config.filter

const rawOrder = values.order ?? config.order

const order: SortOrder = rawOrder === 'run' ? 'run' : 'alphabetical'

const title = values.title ?? config.title ?? 'Hlidskjalf'

const metrics = explicit.metrics ?? values.metrics ?? config.metrics ?? false

const watch = explicit.watch ?? values.watch ?? config.watch ?? true

const options: Options = {
	root,
	order,
	filter: filter?.length ? filter : undefined,
	title,
	metrics,
	watch,
}

// Render on the alternate screen so the dashboard never accumulates in the
// scrollback; restore the primary screen however we exit.
const restoreScreen = enterAltScreen()

try {
	const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

	await waitUntilExit()
} finally {
	restoreScreen()
}

process.exit(0)
