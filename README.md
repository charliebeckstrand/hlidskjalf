# hlidskjalf

A single terminal window for every dev server in your Turborepo.

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

| Option | Description |
| --- | --- |
| `--filter=<name>` | Only include matching workspaces. Can be passed multiple times. Append `...` to include transitive dependencies (e.g. `--filter=web...`). |
| `--order=<mode>` | `alphabetical` (default) or `run` (dependency order). |
