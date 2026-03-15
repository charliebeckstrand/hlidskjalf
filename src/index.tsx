import { render } from 'ink'

import { App } from './app.js'
import type { Options, SortOrder } from './types.js'

function parseArgs(argv: string[]): Options {
	const root = process.cwd()
	const filter: string[] = []
	let order: SortOrder = 'alphabetical'

	for (const arg of argv) {
		if (arg.startsWith('--filter=')) {
			const value = arg.slice('--filter='.length).replace(/^\{(.+)\}$/, '$1')
			filter.push(value)
		}

		if (arg.startsWith('--order=')) {
			const value = arg.slice('--order='.length)
			if (value === 'run' || value === 'alphabetical') order = value
		}
	}

	return { root, order, filter: filter.length > 0 ? filter : undefined }
}

const { waitUntilExit } = render(<App options={parseArgs(process.argv.slice(2))} />, {
	exitOnCtrlC: false,
})

await waitUntilExit()

process.exit(0)
