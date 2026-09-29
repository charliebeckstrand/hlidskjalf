import { defineConfig } from 'tsdown'

export default defineConfig({
	// `index` is the CLI bin; `config` is the public library surface that a
	// `hlidskjalf.config.ts` imports `defineConfig` from.
	entry: { index: 'src/index.tsx', config: 'src/config/index.ts' },
	format: 'esm',
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
	// Keep `.js`/`.d.ts` names: package.json's bin and exports point at them.
	fixedExtension: false,
	clean: true,
	minify: true,
	deps: {
		// Bundle the React/Ink runtime into the bin so the CLI is hermetic: it must
		// not resolve these from the host project, whose React (e.g. 19) may be
		// incompatible with Ink 5's React-18 reconciler. react-reconciler is pulled
		// in transitively with ink. Only affects the `index` bin — the `config`
		// entry doesn't touch React.
		alwaysBundle: ['react', 'ink'],
		// Ink lazily requires react-devtools-core only in dev; it isn't a runtime
		// dependency here, so keep it external rather than failing to resolve it.
		neverBundle: ['react-devtools-core'],
	},
	dts: true,
	banner: {
		// Real `require` so bundled CJS deps (signal-exit, ws, …) can require()
		// Node built-ins from this ESM bin.
		js: [
			'#!/usr/bin/env node',
			"import { createRequire as __cjsRequire } from 'node:module';",
			'const require = __cjsRequire(import.meta.url);',
		].join('\n'),
	},
})
