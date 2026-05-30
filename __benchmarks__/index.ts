import { layoutSuite } from './layout.bench.js'
import { linesSuite } from './lines.bench.js'
import { logsBufferSuite } from './logs-buffer.bench.js'
import { logsParseSuite } from './logs-parse.bench.js'
import { metricsSuite } from './metrics.bench.js'
import { runSuite } from './run.js'
import { workspacesSuite } from './workspaces.bench.js'

/**
 * Benchmark entry point. Runs every suite by default, or only those named on the
 * command line, e.g. `pnpm bench logs-parse metrics`.
 */
const suites = {
	'logs-parse': logsParseSuite,
	metrics: metricsSuite,
	workspaces: workspacesSuite,
	'logs-buffer': logsBufferSuite,
	layout: layoutSuite,
	lines: linesSuite,
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
