import { parseArgs } from 'node:util'

import { render } from 'ink'

import { App } from './app.js'
import type { Options, SortOrder } from './types.js'
import { isValidPackageName } from './workspaces.js'

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		filter: { type: 'string', multiple: true },
		order: { type: 'string', default: 'alphabetical' },
		title: { type: 'string', default: 'Hlidskjalf' },
		metrics: { type: 'boolean', default: false },
	},
})

const rawFilter = values.filter?.map((v) => v.replace(/^\{(.+)\}$/, '$1'))
const filter = rawFilter?.filter((v) => {
	const name = v.endsWith('...') ? v.slice(0, -3) : v
	if (!isValidPackageName(name)) {
		console.error(`Ignoring invalid filter: ${name}`)
		return false
	}
	return true
})
const order = values.order === 'run' ? 'run' : 'alphabetical'

const title = values.title ?? 'Hlidskjalf'

const options: Options = {
	root: process.cwd(),
	order: order satisfies SortOrder,
	filter: filter?.length ? filter : undefined,
	title,
	metrics: values.metrics ?? false,
}

const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

await waitUntilExit()

process.exit(0)
