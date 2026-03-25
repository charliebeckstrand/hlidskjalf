# hlidskjalf

![NPM Version](https://img.shields.io/npm/v/hlidskjalf)
![NPM Last Update](https://img.shields.io/npm/last-update/hlidskjalf)

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
