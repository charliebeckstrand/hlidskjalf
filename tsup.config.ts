import { defineConfig } from 'tsup'

export default defineConfig({
	// `index` is the CLI bin; `config` is the public library surface that a
	// `hlidskjalf.config.ts` imports `defineConfig` from.
	entry: { index: 'src/index.tsx', config: 'src/config.ts' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	treeshake: true,
	// Bundle the React/Ink runtime into the bin so the CLI is hermetic: it must
	// not resolve these from the host project, whose React (e.g. 19) may be
	// incompatible with Ink 5's React-18 reconciler. react-reconciler is pulled
	// in transitively with ink. Only affects the `index` bin — the `config`
	// entry doesn't touch React.
	noExternal: ['react', 'ink', 'ink-spinner'],
	// Ink lazily requires react-devtools-core only in dev; it isn't a runtime
	// dependency here, so keep it external rather than failing to resolve it.
	external: ['react-devtools-core'],
	dts: { entry: { config: 'src/config.ts' } },
	banner: {
		// Real `require` so bundled CJS deps (signal-exit, ws, …) can require()
		// Node built-ins from this ESM bin — esbuild's interop shim otherwise
		// throws "Dynamic require of X is not supported".
		js: [
			'#!/usr/bin/env node',
			"import { createRequire as __cjsRequire } from 'node:module';",
			'const require = __cjsRequire(import.meta.url);',
		].join('\n'),
	},
	esbuildOptions(options) {
		options.minifySyntax = true
		options.minifyWhitespace = true
	},
})
