# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Colour themes** — pick a palette with `--theme` or a `theme` key in the config.
  Six built-ins named for the realms of Norse cosmology: `bifrost` (the default),
  `niflheim` (ice), `muspelheim` (fire), `yggdrasil`, `helheim`, and `aurora`.
  Status colours stay legible across every theme.

## [0.4.0]

### Changed

- **Ground-up internal rewrite** — the architecture was rebuilt around platform
  built-ins with no change to behaviour or features. The hand-rolled, event-emitter
  process runner, manual render coalescer, and the ref-juggling glue hook were
  replaced by a plain store bridged into React with `useSyncExternalStore`, with
  `useDeferredValue` bounding re-renders under a log flood. The `Meter` and
  `Heartbeat` classes became factory functions, and a set of single-purpose modules
  were consolidated (29 → 19 source files) behind shared UI primitives. The result
  is materially smaller and simpler while preserving every feature: metrics, watch
  rediscovery, idle probing, fsevents recovery, restart backoff, log scrolling,
  hyperlinks, the alternate screen, and the full config/flag surface.

### Fixed

- **Log scrolling no longer depends on a private Ink API** — `Home`/`End` are now
  detected from the key event Ink already delivers, rather than reaching into an
  internal event emitter.

## [0.3.7]

### Added

- **Renders on the alternate screen** — the dashboard now runs on the terminal's
  alternate screen buffer (the same one vim/htop/lazygit use), so its frames can
  never accumulate in the scrollback: re-renders repaint in place, and on quit the
  original screen and scrollback are restored exactly as they were before launch.
  This removes the duplicated-header copies that piled up in the scrollback when a
  frame outgrew the viewport.

### Changed

- **URL column shows the full address** — the column now reserves the width its
  longest URL needs before the name column claims any space, so a ready URL is
  shown in full and a long workspace name truncates instead of squeezing the URL
  off-screen. On a terminal too narrow for both, the URL is the one that shrinks
  (and is hidden once nothing's left), while the clickable target stays the
  complete address.
- **Resize reflows on settle** — a window drag fires a burst of `resize` events;
  the dashboard now waits for the size to settle (~120 ms) before reflowing, so it
  repaints once against the final size rather than thrashing through intermediate
  widths where a row could briefly wrap and malform the frame.

### Fixed

- **URL column truncated even with room to spare** — the dashboard's outer
  `overflow: hidden` made Ink slice every line through a tokenizer that miscounts
  OSC 8 hyperlinks (counting the hidden link target as visible width), cutting the
  visible URL to a stray fragment regardless of how much space the column had. The
  clip is gone (the alternate screen makes it unnecessary), so URLs render in full.

### Internal

- **Alternate-screen lifecycle extracted** — the enter/restore escape sequences
  and the abrupt-exit safety net live in a small `src/terminal.ts` helper, kept
  pure so the behavior is unit-tested without a live TTY.

## [0.3.6]

### Fixed

- **Broken URL links and a terminal bell on every repaint** — the URL column's
  OSC 8 hyperlinks were terminated with ST (`ESC \`), but Ink's renderer only
  recognizes the BEL (`\x07`) form: it mis-tokenized the links, dropped the
  visible label on narrow columns, and stranded the bell byte it emits outside a
  valid escape, ringing the terminal on every re-render (e.g. each time the
  selection moved). Links are now BEL-terminated so they round-trip intact and
  silently.
- **Terminal chime when selecting a process** — a bare control byte such as BEL
  (`\x07`) in a process's own log output survived display sanitization and rang
  the terminal bell when that process's log panel rendered. Sanitization now
  strips bare C0/DEL control bytes (keeping tabs and SGR colour codes).

## [0.3.5]

### Changed

- **More accurate `--metrics`** — CPU is now derived from per-PID cumulative
  CPU-time deltas between samples instead of an aggregate tree total (and the
  non-Linux path now diffs `ps` cumulative CPU time rather than its
  lifetime-average `%CPU`). A process that spawns a heavy compile child during
  startup no longer dumps that child's since-birth CPU into a single interval,
  which removes the brief >100% spike that decayed to 0% on launch.
- **Event-driven metrics sampling** — a fresh CPU/memory sample is pulled on
  status changes (start, restart, build, idle) rather than only on the periodic
  poll, so usage updates promptly. Samples are spaced at least 1s apart to keep
  the readings accurate, and the 3s periodic poll remains as a fallback.

### Fixed

- **Layout frozen at the startup terminal size** — the dashboard read the
  terminal width/height only on first paint, so resizing the window left the
  name/kind/status/URL columns and the log viewport sized for the old
  dimensions (truncated or overflowing). The views now subscribe to terminal
  `resize` events and reflow the columns and log panel to the new size. The
  name column is also clamped to the available width so a long workspace name
  on a narrow terminal can't push the kind/status columns off-screen.
- **Truncated URL opened the wrong address** — the dashboard's URL column is
  rendered as an OSC 8 hyperlink whose target is the full URL, so clicking it
  opens the complete address even when the column only shows a shortened
  segment (previously the terminal linkified the visible, truncated text).
- **Duplicate dev servers on rapid stop/restart** — pressing `r` twice (or `s`
  then `r`) before a process finished tearing down stacked multiple exit
  handlers, spawning a second dev server for the same workspace. Teardown is now
  funnelled through a single guarded path where the latest request wins.
- **Stale metrics & process resurrection** — a stopped process kept showing its
  last CPU/memory reading; an in-flight liveness probe could flip a just-stopped
  process back to running; and the fsevents rebuild could respawn a workspace
  that had been stopped or removed mid-rebuild. All three now re-check current
  state before acting.
- **Log status misclassification** — an error line that happened to mention
  "listening" was read as `ready`, and all-caps `ERROR:` went undetected. The
  matcher ordering and casing are fixed.
- **Selection past the end of the list** — removing a watched workspace while it
  was selected could leave keypresses targeting a phantom row; the cursor now
  clamps to the current list length.
- **`--filter` with only invalid patterns** no longer silently launches every
  workspace; it falls back to a configured filter as if unset.

### Internal

- **Keyboard handling extracted to a hook** — `App`'s `useInput` dispatcher and
  the keyboard-driven UI state (workspace selection and the help overlay toggle)
  moved into a dedicated `useControls` hook, leaving `App` a thin composition of
  runner state and views. No behavior change.
- **Metrics sampling extracted from the runner** — the CPU/memory polling
  (`/proc` and `ps` collection, per-PID diffing, event-driven scheduling) moved
  out of `ProcessRunner` into a composed `Meter` (`src/meter.ts`), shrinking
  `processes.ts` by ~180 lines. No behavior change.
- **`config` module folder** — `config.ts` and the renamed `loader.ts` (was
  `config-loader.ts`) now live under `src/config/`. The published package entry
  (`dist/config.js`) is unchanged.
- **Child-control and heartbeat split out of the runner** — the process-group
  signal helpers (`isRunning`/`killTree`/`escalateKill`) moved to `src/child.ts`
  and the liveness sweep to a composed `Heartbeat` (`src/heartbeat.ts`), further
  shrinking `processes.ts`. No behavior change.

## [0.3.4]

### Added

- **Config file** — persist any CLI option in a `hlidskjalf.config.ts` (loaded
  directly via Node's type stripping, no build step) or a `hlidskjalf` key in
  `package.json`, so flags don't have to be retyped. A `defineConfig` helper and
  `Config` type are exported from the package for full type checking. Precedence
  is CLI flags → config file → `package.json` key → defaults.
- **Watch & re-discover workspaces** — the `packages`, `apps`, and `services`
  directories are watched while running. When a workspace's `package.json` is
  added, removed, or changed, discovery re-runs: new workspaces start
  automatically and removed ones are stopped and dropped from the dashboard. On
  by default; disable with `--no-watch` or `watch: false`.

## [0.3.3]

### Added

- **Help overlay** — press `?` to toggle a full-screen reference listing every
  keybinding. The footer hints collapse to a compact `? help   q quit`; press
  `?` again or `Esc` to dismiss, and `q` still quits from anywhere.

### Fixed

- **Duplicated header** — when the rendered dashboard reached the terminal
  height, Ink fell back to a non-erasing write and stranded the previous frame
  in the scrollback, stacking the header on each redraw (most visible during an
  error/reload burst). The dashboard is now clamped to one line below the
  viewport so every frame stays on the erase path.
- **Restart killing the UI** — dev processes now run in their own process group,
  so a workspace's teardown signals can no longer terminate hlidskjalf itself.
  Stopping or restarting also signals the whole group, reaping the real server
  under `pnpm` instead of orphaning it (which would keep its port and break the
  next start).

## [0.3.2]

### Added

- **Clear logs** — press `c` to empty the log buffer for the selected workspace.
- **Scrollable log history** — `PgUp` / `PgDn` page through the retained
  scrollback and `Home` / `End` jump to the oldest / newest lines. The panel
  follows new output until you scroll up, stays anchored to the same lines while
  paused, and snaps back to following when you switch workspaces or clear the
  buffer. A `⏸ scrolled` indicator shows when the view is paused.
- **Build spinner** — workspaces in the `building` state and the startup screen
  now show an animated spinner in place of the static glyph.

## [0.3.1]

### Added

- **Process runner test coverage** — added tests exercising the process runner.
- **Hot-path benchmarks** — added [tinybench](https://github.com/tinylibs/tinybench)
  benchmarks for the hot code paths.

### Changed

- **Audit improvements** — hardened workspace discovery, strengthened types, and
  expanded CI coverage.
- **Built-ins over hand-rolled code** — replaced hand-rolled logic with Node and
  TypeScript built-ins.
- **Test/benchmark layout** — moved tests and benchmarks into `__tests__` and
  `__benchmarks__` folders.

### Performance

- Coalesce per-line change events into bounded re-renders.
- Amortize per-line log-buffer trimming.
- Skip ANSI stripping on escape-free log lines.
- Gate URL matchers on a cheap `http` substring check in `parseLine`.
- Precompute dependency counts in `sortByDeps`.
- Avoid argument spread in `collectDescendants` and when computing the dashboard
  name-column width.

## [0.3.0]

### Fixed

- **Parser bug** — fixed a bug in the log parser.

### Changed

- **Metrics column** — right-align the CPU percentage in the metrics column.

## [0.2.8]

### Changed

- **Metrics column** — right-align the memory unit in the metrics column.
- **Docs** — document the `--metrics` option in the README.

## [0.2.7]

### Added

- **Test suite** — added vitest tests for the parser, workspaces, theme, and
  processes modules.
- **CI** — added a GitHub Actions workflow that runs lint and tests on PRs.
- **Packaging** — include the `LICENSE` file in the published npm package and
  add a GitHub license badge to the README.

### Fixed

- **URL wrapping** — prevent dashboard URL wrapping from breaking ⌘-click links.
- **macOS metrics** — fix `--metrics` showing `0`s on macOS by adding a
  `ps`-based fallback.

### Removed

- Removed the bundled `CHANGELOG.md` file (later reintroduced).

## [0.2.6]

### Fixed

- **Metrics** — use `/proc` for real-time CPU and memory readings.

## [0.2.5]

### Fixed

- **Metrics** — aggregate the entire process tree when computing usage.
- **Header layout** — fix title/shortcut spacing: add a gap, right-align hints,
  and prevent wrapping.

## [0.2.4]

### Added

- **`--metrics` flag** — show per-process CPU and memory usage.
- **Workspace controls** — stop and restart individual workspaces.
- **Licensing** — add an MIT license and a security policy.
- **Changelog** — add `CHANGELOG.md`.

## [0.2.3]

### Fixed

- **Idle detection** — probe a process's URL before marking it idle so active
  servers stay awake.

## [0.2.2]

### Fixed

- **Dashboard layout** — fix table column alignment and header spacing, and
  account for header padding in the log-panel height calculation.

## [0.1.9]

### Fixed

- **Build status** — fix a stuck `building` status when esbuild reports errors.

## [0.1.4]

### Added

- **`--title` option** — customize the header title.

### Changed

- **UI refresh** — modernize the UI with vibrant colors, consistent spacing, and
  proper borders.
- **Status rename** — rename the `stale` status to `idle`.

### Fixed

- **URL parsing** — handle trailing punctuation and path suffixes.
- **Log panel** — stop the log panel height from pushing content beyond the
  terminal viewport.

## [0.1.1]

### Fixed

- **Process health** — fix processes going stale prematurely and not recovering.
- **Log panel** — constrain the log-panel height to prevent pushing the header
  out of view.

## [0.0.8]

### Security

- Addressed security vulnerabilities across the codebase over several audit
  passes, and switched `sanitizeForDisplay` to a whitelist approach.

### Changed

- Replaced the custom `stripAnsi` with Node's built-in `stripVTControlCharacters`.

## [0.0.5]

### Added

- **`services/` workspaces** — support `services/` workspace discovery.
- **Stability** — auto-restart, startup timeout, heartbeat, and graceful
  degradation.
- **Tooling** — add Biome and lefthook.

### Changed

- Refactor to clean ES6/React patterns.
- Reduce bundle size ~30% with syntax and whitespace minification.

### Fixed

- Fix a shutdown race in `handleLine` and clean up orphaned timers.

## [0.0.3]

### Changed

- Release/packaging bump (no functional changes).

## [0.0.2]

Initial public release.

### Added

- Terminal dashboard for visualizing workspace dev servers, with a status-circle
  header.

### Changed

- Renamed the project from Midgard to Hlidskjalf.
- Hardened for production: line buffering, shutdown safety, and defensive error
  handling.
