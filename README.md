# hlidskjalf

A Terminal User Interface for monitoring Turborepo tasks, built with [Ink](https://npm.im/ink).

## Usage

Add it to your root `package.json`:

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

| Option | Example | Description |
| --- | --- | --- |
| `--filter` | `--filter=web` | Include specific workspaces. Repeatable. Append `...` for transitive deps. |
| `--order` | `--order=run` | Sort by `alphabetical` (default) or `run` (dependency order). |
