import { parseArgs } from 'node:util'

import { render } from 'ink'

import { App } from './app.js'
import type { Options } from './types.js'

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'cache-dir': { type: 'string' },
		title: { type: 'string', default: 'Turbolens' },
	},
})

const options: Options = {
	root: process.cwd(),
	cacheDir: values['cache-dir'],
	title: values.title ?? 'Turbolens',
}

const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

await waitUntilExit()

process.exit(0)
