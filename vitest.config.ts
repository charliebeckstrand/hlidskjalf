import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['__tests__/**/*.test.ts'],
		pool: 'vmThreads',
		sequence: { shuffle: true },
		coverage: {
			provider: 'v8',
			include: ['src/**'],
			// The Ink view layer, the CLI entry, and the React hooks bound to Ink's runtime
			// are render code, exercised by hand rather than unit tests; type-only and
			// re-export barrels have no executable lines. Excluding them keeps the threshold
			// a measure of the business logic, where the testable code deliberately lives.
			exclude: [
				'src/**/*.tsx',
				'src/hooks/**',
				'src/**/types.ts',
				'src/ui/index.ts',
				'src/metrics/index.ts',
			],
			reporter: ['text', 'html'],
			thresholds: {
				statements: 95,
				branches: 84,
				functions: 95,
				lines: 97,
			},
		},
	},
})
