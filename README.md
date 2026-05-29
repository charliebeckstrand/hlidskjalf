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
| `watch` | Re-discover workspaces when `package.json` files change. Defaults to `true`; disable with `--no-watch`. |
| `theme` | Colour theme (`--theme=niflheim`). One of `bifrost` (default), `niflheim`, `muspelheim`, `yggdrasil`, `helheim`, or `aurora`. |

## Themes

Named for the realms of Norse cosmology, to match the all-seeing high seat the tool is named after:

| Theme | Mood |
| --- | --- |
| `bifrost` | The default — the rainbow bridge, indigo accents over teal highlights. |
| `niflheim` | Ice. Glacial blues and frost-white highlights. |
| `muspelheim` | Fire. Molten oranges and ember golds. |
| `yggdrasil` | The world tree. Mosses, leaf-greens, bark greys. |
| `helheim` | The shadowed underworld. Muted, low-contrast greys for low-light terminals. |
| `aurora` | _Norðurljós_, the northern lights. A violet-to-teal shimmer. |

Status colours (running / warning / error) stay legible in every theme, so a glyph never misreads.

## Configuration

Persist any of the options above so they don't have to be retyped on every run.
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

`defineConfig` is optional — a plain `export default { ... }` works too, and
`hlidskjalf.config.js` / `hlidskjalf.config.mjs` are also recognized. The `.ts`
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
stopped and dropped from the dashboard. Pass `--no-watch` (or set
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
