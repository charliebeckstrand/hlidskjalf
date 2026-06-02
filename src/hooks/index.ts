/**
 * React hooks for the dashboard. {@link ./use-log-scroll.ts} drives the log panel's
 * scroll offset, following the tail by default and paging back on PgUp/PgDn/Home/End;
 * {@link ./use-terminal-size.ts} tracks the live terminal dimensions, re-rendering on
 * resize (debounced until the size settles). Both lean on Ink hooks, so neither is
 * unit-testable without a render.
 */

export { type LogScroll, useLogScroll } from './use-log-scroll.js'
export { type TerminalSize, useTerminalSize } from './use-terminal-size.js'
