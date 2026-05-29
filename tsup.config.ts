import { defineConfig } from 'tsup'

export default defineConfig({
	// `index` is the CLI bin; `config` is the public library surface that a
	// `hlidskjalf.config.ts` imports `defineConfig` from.
	entry: { index: 'src/index.tsx', config: 'src/config/config.ts' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	treeshake: true,
	dts: { entry: { config: 'src/config/config.ts' } },
	banner: { js: '#!/usr/bin/env node' },
	esbuildOptions(options) {
		options.minifySyntax = true
		options.minifyWhitespace = true
	},
})
