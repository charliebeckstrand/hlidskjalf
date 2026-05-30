/**
 * Per-workspace CPU/memory sampling. {@link ./parse.ts} holds side-effect-free
 * parsers/maths, unit-testable without spawning processes or reading /proc;
 * {@link ./meter.ts} wraps them in the periodic + event-driven poll loop the store owns;
 * {@link ./env.ts} builds the sanitized child-process environment.
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
