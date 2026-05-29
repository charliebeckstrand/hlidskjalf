import { logsSuite } from './logs.bench.js'
import { metricsSuite } from './metrics.bench.js'
import { parserSuite } from './parser.bench.js'
import { runSuite } from './run.js'
import { workspacesSuite } from './workspaces.bench.js'

/**
 * Benchmark entry point. Runs every suite by default, or only those named on the
 * command line, e.g. `pnpm bench parser metrics`.
 */
const suites = {
	parser: parserSuite,
	metrics: metricsSuite,
	workspaces: workspacesSuite,
	logs: logsSuite,
} as const

type SuiteName = keyof typeof suites

const requested = process.argv.slice(2)

const unknown = requested.filter((name): name is string => !(name in suites))

if (unknown.length > 0) {
	console.error(`Unknown suite(s): ${unknown.join(', ')}`)

	console.error(`Available: ${Object.keys(suites).join(', ')}`)

	process.exit(1)
}

const selected = (requested.length > 0 ? requested : Object.keys(suites)) as SuiteName[]

for (const name of selected) {
	await runSuite(suites[name]())
}
