# Turbolens

A Terminal User Interface for exploring and managing Turborepo cache, built with [Ink](https://github.com/vadimdemedes/ink).

## Features

- **Browse cache entries** — See all cached tasks with their hashes, sizes, ages, and file counts
- **View cache stats** — Total size, entry count, and hit rate from your latest run
- **Inspect entries** — Drill into any cache entry to see its files
- **View run summaries** — Browse `.turbo/runs/` summaries showing per-task cache hit/miss status
- **Compare runs** — Mark two run summaries and compare them side-by-side to understand why cache misses happened
- **Manage cache** — Delete individual entries or clear the entire cache
- **Keyboard-driven** — Vim-style navigation (j/k), arrow keys, enter to drill in, esc to go back

## Install

```bash
npm install -g turbolens
```

## Usage

Run from the root of any Turborepo project:

```bash
turbolens
```

### Options

| Option | Description |
|---|---|
| `--cache-dir=<path>` | Custom cache directory (default: auto-detects from `TURBO_CACHE_DIR`, `turbo.json`, or `.turbo/cache/`) |
| `--title=<string>` | Custom header title (default: "Turbolens") |

### Keybindings

**Overview:**
| Key | Action |
|---|---|
| `↑/↓` or `j/k` | Navigate entries |
| `enter` | Inspect selected entry |
| `r` | View run summaries |
| `R` | Refresh cache data |
| `d` | Delete selected entry |
| `D` | Clear all cache entries |
| `q` | Quit |

**Run Summaries:**
| Key | Action |
|---|---|
| `enter` | View run details |
| `space` | Mark run for comparison (max 2) |
| `c` | Compare marked runs |
| `esc` | Go back |

### Generating Run Summaries

To populate the run summaries view, run your Turborepo tasks with the `--summarize` flag:

```bash
turbo run build --summarize
```

This creates JSON summaries in `.turbo/runs/` that Turbolens can read and display.
