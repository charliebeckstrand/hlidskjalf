import { parseArgs } from 'node:util'

import { render } from 'ink'

import { App } from './app.js'
import type { Options, SortOrder } from './types.js'

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		filter: { type: 'string', multiple: true },
		order: { type: 'string', default: 'alphabetical' },
	},
})

const filter = values.filter?.map((v) => v.replace(/^\{(.+)\}$/, '$1'))
const order = values.order === 'run' ? 'run' : 'alphabetical'

const options: Options = {
	root: process.cwd(),
	order: order satisfies SortOrder,
	filter: filter?.length ? filter : undefined,
}

const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

await waitUntilExit()

process.exit(0)
