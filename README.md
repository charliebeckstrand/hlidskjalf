# hlidskjalf

![NPM Version](https://img.shields.io/npm/v/hlidskjalf)
![NPM Last Update](https://img.shields.io/npm/last-update/hlidskjalf)
![GitHub License](https://img.shields.io/github/license/charliebeckstrand/hlidskjalf)

A Terminal User Interface for visualizing Turborepo tasks, built with [Ink](https://npm.im/ink).

<img src="https://raw.githubusercontent.com/charliebeckstrand/hlidskjalf/main/screenshot.png" alt="Screenshot" width="513" />

## Usage

Add to your root `package.json`:

```json
{
  "scripts": {
    "dev": "hlidskjalf"
  }
}
```

Then run it:

```sh
pnpm dev
```

## Options

| Option | Description |
| --- | --- |
| `filter` | Include specific workspaces (`--filter=web`). Append `...` for transitive deps (`--filter=web...`). |
| `order` | Sort by `alphabetical` (default) or `run` (`--order=run`) dependency order. |
| `title` | Custom title for the header (`--title="My App"`). Defaults to `Hlidskjalf`. |
| `metrics` | Show CPU and memory usage per workspace. Defaults to `false`. |

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` or `k` / `j` | Move the selection between workspaces |
| `s` | Stop the selected workspace (or start it again if stopped) |
| `r` | Restart the selected workspace |
| `q` or `Ctrl+C` | Quit |

## Benchmarks

Performance-sensitive code paths — per-log-line parsing, log-buffer appends,
metrics polling, and workspace ordering — are benchmarked with
[tinybench](https://github.com/tinylibs/tinybench) under `__benchmarks__/`. Run
them with:

```sh
pnpm bench            # all suites
pnpm bench parser     # one or more suites: parser | metrics | workspaces | logs | layout
```

Each task is warmed up before measuring; the `±` column is the relative margin
of error, so compare runs only when it stays small.

## License

MIT
