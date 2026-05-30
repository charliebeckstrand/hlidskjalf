/**
 * Per-process log handling. {@link ./parse.ts} holds the side-effect-free line
 * parser and sanitizers; {@link ./buffer.ts} the bounded scrollback buffer and its
 * viewport maths. Both are pure and unit-testable without spawning a child.
 */

export { appendLog, type LogWindow, MAX_LOGS, visibleLogRange } from './buffer.js'
export { type LogRow, logRowKeys } from './keys.js'
export { parseLine, sanitizeForDisplay, stripAnsi } from './parse.js'
