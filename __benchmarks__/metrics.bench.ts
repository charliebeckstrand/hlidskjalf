import { Bench } from 'tinybench'

import {
	collectDescendants,
	cpuPercentFromTicks,
	parseProcStat,
	parsePsOutput,
	safeEnv,
} from '../src/metrics/index.js'
import { makePsOutput, PROC_STAT } from './fixtures.js'

/**
 * The metrics helpers run on every poll tick when `--metrics` is enabled, once
 * per tracked process tree. Parsing `ps`/`/proc` output is the dominant cost, so
 * the `ps` table is benchmarked at a few realistic process counts.
 */
export function metricsSuite(): Bench {
	const bench = new Bench({ name: 'metrics — poll-loop parsers', time: 500 })

	const ps50 = makePsOutput(50)
	const ps200 = makePsOutput(200)
	const ps1000 = makePsOutput(1000)

	// A descendant tree to walk: reuse the children map parsed from ps output.
	const { children } = parsePsOutput(ps1000)

	bench
		.add('parsePsOutput: 50 processes', () => {
			parsePsOutput(ps50)
		})
		.add('parsePsOutput: 200 processes', () => {
			parsePsOutput(ps200)
		})
		.add('parsePsOutput: 1000 processes', () => {
			parsePsOutput(ps1000)
		})
		.add('parseProcStat: single /proc stat line', () => {
			parseProcStat(PROC_STAT)
		})
		.add('collectDescendants: ~1000-node tree', () => {
			collectDescendants(1, children)
		})
		.add('cpuPercentFromTicks: arithmetic', () => {
			cpuPercentFromTicks(420, 1000, 8)
		})
		.add('safeEnv: filter process.env', () => {
			safeEnv()
		})

	return bench
}
