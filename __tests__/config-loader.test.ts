import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadConfig } from '../src/config-loader.js'

const CONFIG_SRC = fileURLToPath(new URL('../src/config.ts', import.meta.url))

describe('loadConfig', () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-config-'))

		// Validation warnings are expected in several cases — keep test output clean.
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true })

		vi.restoreAllMocks()
	})

	function write(name: string, contents: string): void {
		fs.writeFileSync(join(tmpDir, name), contents)
	}

	it('returns an empty config when nothing is present', async () => {
		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('reads the package.json "hlidskjalf" key', async () => {
		write('package.json', JSON.stringify({ hlidskjalf: { order: 'run', metrics: true } }))

		expect(await loadConfig(tmpDir)).toEqual({ order: 'run', metrics: true })
	})

	it('ignores a package.json without the key', async () => {
		write('package.json', JSON.stringify({ name: 'root' }))

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('survives a malformed package.json', async () => {
		write('package.json', '{ not valid json')

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('reads the default export of hlidskjalf.config.ts', async () => {
		write('hlidskjalf.config.ts', 'export default { order: "run", title: "Mine", watch: false }')

		expect(await loadConfig(tmpDir)).toEqual({ order: 'run', title: 'Mine', watch: false })
	})

	it('supports defineConfig from the package entry', async () => {
		write(
			'hlidskjalf.config.ts',
			`import { defineConfig } from ${JSON.stringify(CONFIG_SRC)}\n` +
				'export default defineConfig({ metrics: true })',
		)

		expect(await loadConfig(tmpDir)).toEqual({ metrics: true })
	})

	it('lets the config file override the package.json key', async () => {
		write('package.json', JSON.stringify({ hlidskjalf: { order: 'run', metrics: true } }))

		write('hlidskjalf.config.ts', 'export default { order: "alphabetical" }')

		// File wins on `order`; package.json `metrics` still fills the gap.
		expect(await loadConfig(tmpDir)).toEqual({ order: 'alphabetical', metrics: true })
	})

	it('drops fields with the wrong type or out-of-range values', async () => {
		write(
			'hlidskjalf.config.ts',
			'export default { order: "sideways", metrics: "yes", title: 5, watch: 1 }',
		)

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('keeps only valid filter entries', async () => {
		write('hlidskjalf.config.ts', 'export default { filter: ["web", "api...", "Bad Name", 42] }')

		expect(await loadConfig(tmpDir)).toEqual({ filter: ['web', 'api...'] })
	})

	it('drops a non-array filter', async () => {
		write('hlidskjalf.config.ts', 'export default { filter: "web" }')

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('ignores a config file that throws on import', async () => {
		write('hlidskjalf.config.ts', 'throw new Error("boom")')

		expect(await loadConfig(tmpDir)).toEqual({})
	})
})
