import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.tsx' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	treeshake: true,
	banner: { js: '#!/usr/bin/env node' },
	esbuildOptions(options) {
		options.minifySyntax = true
		options.minifyWhitespace = true
	},
})
