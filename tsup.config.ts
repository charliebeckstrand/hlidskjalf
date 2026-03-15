import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { index: 'src/index.tsx' },
	format: ['esm'],
	target: 'node22',
	outDir: 'dist',
	clean: true,
	banner: { js: '#!/usr/bin/env node' },
})
