import { Bench } from 'tinybench'

import {
	collectDescendants,
	cpuPercentFromTicks,
	ENV_ALLOWLIST,
	parseCpuTime,
	parseProcStat,
	parsePsOutput,
	safeEnv,
} from '../src/metrics/index.js'
import { makePsOutput, PROC_STAT } from './fixtures.js'

/**
 * Prior safeEnv: scan every variable in the source env and test each against the
 * allowlist. Reproduced here as a baseline so the allowlist-first form's win — fewer
 * lookups on a large env, and no intermediate Object.keys array — shows in the same run.
 */
function safeEnvBaseline(
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
	const filtered: Record<string, string | undefined> = {}

	for (const key of Object.keys(source)) {
		if (ENV_ALLOWLIST.has(key)) filtered[key] = source[key]
	}

	filtered.FORCE_COLOR = '1'

	return filtered
}

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
		.add('parseCpuTime: ps TIME field (mm:ss)', () => {
			parseCpuTime('12:34')
		})
		.add('parseCpuTime: ps TIME field (dd-hh:mm:ss)', () => {
			parseCpuTime('2-03:12:09')
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
		.add('safeEnv: allowlist-first (filter process.env)', () => {
			safeEnv()
		})
		.add('safeEnv baseline: iterate process.env', () => {
			safeEnvBaseline()
		})

	return bench
}
