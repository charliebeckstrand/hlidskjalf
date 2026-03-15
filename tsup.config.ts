import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.tsx' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
	banner: { js: '#!/usr/bin/env node' },
})
