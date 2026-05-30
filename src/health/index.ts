/**
 * Periodic health monitoring for tracked dev servers. {@link ./probe.ts} is the
 * HTTP reachability check, unit-testable by stubbing `fetch`; {@link ./heartbeat.ts}
 * wraps it in the periodic sweep the store owns, flipping a quiet-but-unreachable
 * process to `idle` and restoring it when output or a successful probe shows it alive.
 */

export {
	createHeartbeat,
	type Heartbeat,
	type HeartbeatDeps,
	type Monitored,
} from './heartbeat.js'
export { probe } from './probe.js'
