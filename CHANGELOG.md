# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Clear logs** — press `c` to empty the log buffer for the selected workspace.
- **Scrollable log history** — `PgUp` / `PgDn` page through the retained
  scrollback and `Home` / `End` jump to the oldest / newest lines. The panel
  follows new output until you scroll up, stays anchored to the same lines while
  paused, and snaps back to following when you switch workspaces or clear the
  buffer. A `⏸ scrolled` indicator shows when the view is paused.
- **Build spinner** — workspaces in the `building` state and the startup screen
  now show an animated spinner in place of the static glyph.
