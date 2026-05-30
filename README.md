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
| `filter` | Include specific workspaces (`--filter=web`). Append `...` for transitive dependencies (`--filter=web...`). |
| `order` | Sort by `alphabetical` or `run` order (`--order=run`). Defaults to `alphabetical`. |
| `title` | Custom header title (`--title="My App"`). Defaults to `Hlidskjalf`. |
| `theme` | Colour theme (`--theme=niflheim` or `--theme=ice`). Defaults to `bifrost`. |
| `metrics` | Show CPU and memory usage per workspace. Defaults to `false`. |
| `watch` | Re-discover workspaces when `package.json` files change. Defaults to `true`; disable with `--watch=false`. |

## Themes

Named for the realms of Norse cosmology, to match the all-seeing high seat the tool is named after:

| Theme | Alias | Mood |
| --- | --- | --- |
| `bifrost` | — | Default - electric purples, sky blues, and starlight whites. |
| `niflheim` | `ice` | Ice — glacial blues, frost-white highlights. |
| `muspelheim` | `fire` | Fire — molten oranges, ember golds. |
| `yggdrasil` | `earth` | Earth — mosses, leaf-greens, bark greys. |

Each realm also answers to its elemental alias, so `--theme=ice` is the same as
`--theme=niflheim`.

## Configuration

Persist any of the options above.
Create a `hlidskjalf.config.ts` at the repo root:

```ts
import { defineConfig } from 'hlidskjalf'

export default defineConfig({
  order: 'run',
  metrics: true,
  filter: ['web...'],
  theme: 'niflheim',
})
```

`defineConfig` is optional — a plain `export default { ... }` works too. `hlidskjalf.config.js` / `hlidskjalf.config.mjs` are also recognized. The `.ts`
form needs no build step: it's loaded directly via Node's type stripping
(Node ≥ 22.18).

Alternatively, add a `hlidskjalf` key to your root `package.json`:

```json
{
  "hlidskjalf": {
    "order": "run",
    "metrics": true
  }
}
```

Precedence is **CLI flags → `hlidskjalf.config.*` → `package.json` key →
defaults**, so a flag always wins over a stored value.

## Watching

While running, hlidskjalf watches your `packages`, `apps`, and `services`
directories. When a workspace's `package.json` is added, removed, or changed it
re-runs discovery: new workspaces start automatically and removed ones are
stopped and dropped from the dashboard. Pass `--watch=false` (or set
`watch: false`) to turn this off.

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move the selection between workspaces |
| `s` | Stop the selected workspace (or start it again if stopped) |
| `r` | Restart the selected workspace |
| `c` | Clear the logs for the selected workspace |
| `PgUp` / `PgDn` | Scroll the log panel up / down a page |
| `q` | Quit |

## License

MIT
