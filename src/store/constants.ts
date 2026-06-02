/**
 * How long a process flagged `error` by a log line stays in that state before reverting
 * to its last good status, so a transient error message doesn't pin it red.
 */
export const ERROR_RECOVERY_MS = 5000

/** Unexpected exits to auto-restart through (with backoff) before giving up on `error`. */
export const MAX_RESTART_RETRIES = 3

/**
 * Base delay before the first auto-restart after an unexpected exit; doubles on each
 * further attempt (exponential backoff).
 */
export const RESTART_DELAY_MS = 1000

/** How long a spawned process has to reach `ready`/`watching` before it's marked `timeout`. */
export const STARTUP_TIMEOUT_MS = 120_000

/**
 * Byte ceiling on the line-reassembly buffer: a newline-less run past this is flushed
 * whole, so a child that never emits a newline can't buffer without bound.
 */
export const MAX_BUFFER_SIZE = 65_536

/** Longest a single log line is kept; longer lines are truncated before storage and display. */
export const MAX_LINE_LENGTH = 8192

/** Grace period after SIGTERM before a lingering child is force-killed with SIGKILL. */
export const KILL_GRACE_MS = 5000
