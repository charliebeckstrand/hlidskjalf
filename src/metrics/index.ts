/**
 * Per-workspace CPU/memory sampling. The pure parsers/maths ({@link ./parse.ts}) are
 * free of side effects so they can be unit-tested without spawning processes or reading
 * /proc; {@link ./meter.ts} wraps them in the periodic + event-driven poll loop the
 * store owns, and {@link ./env.ts} builds the sanitized child-process environment.
 */

export { ENV_ALLOWLIST, safeEnv } from './env.js'
export { createMeter, type Meter, type MeterDeps } from './meter.js'
export {
	collectDescendants,
	cpuPercentFromTicks,
	type ProcStat,
	type PsStat,
	parseCpuTime,
	parseProcStat,
	parsePsOutput,
	sumTickDeltas,
} from './parse.js'
