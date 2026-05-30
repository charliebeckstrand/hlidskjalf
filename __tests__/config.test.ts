import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineConfig, loadConfig } from '../src/config.js'

const CONFIG_SRC = fileURLToPath(new URL('../src/config.ts', import.meta.url))

describe('defineConfig', () => {
	it('returns its argument unchanged (identity helper)', () => {
		const cfg = { order: 'run', metrics: true } as const
		expect(defineConfig(cfg)).toBe(cfg)
	})
})

describe('loadConfig', () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-config-'))

		// Several cases expect validation warnings; silence them to keep output clean.
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	const write = (name: string, contents: string) => fs.writeFileSync(join(tmpDir, name), contents)

	it('returns an empty config when nothing is present', async () => {
		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('reads the package.json "hlidskjalf" key and ignores a keyless or broken file', async () => {
		write('package.json', JSON.stringify({ hlidskjalf: { order: 'run', metrics: true } }))

		expect(await loadConfig(tmpDir)).toEqual({ order: 'run', metrics: true })

		write('package.json', JSON.stringify({ name: 'root' }))

		expect(await loadConfig(tmpDir)).toEqual({})

		write('package.json', '{ not valid json')

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('reads the default export of hlidskjalf.config.ts', async () => {
		write('hlidskjalf.config.ts', 'export default { order: "run", title: "Mine", watch: false }')

		expect(await loadConfig(tmpDir)).toEqual({ order: 'run', title: 'Mine', watch: false })
	})

	it('supports defineConfig imported from the package entry', async () => {
		write(
			'hlidskjalf.config.ts',
			`import { defineConfig } from ${JSON.stringify(CONFIG_SRC)}\n` +
				'export default defineConfig({ metrics: true })',
		)

		expect(await loadConfig(tmpDir)).toEqual({ metrics: true })
	})

	it('lets the config file override the package.json key, merging the rest', async () => {
		write('package.json', JSON.stringify({ hlidskjalf: { order: 'run', metrics: true } }))

		write('hlidskjalf.config.ts', 'export default { order: "alphabetical" }')

		expect(await loadConfig(tmpDir)).toEqual({ order: 'alphabetical', metrics: true })
	})

	// Each case uses a fresh tmpDir: the dynamic import caches on the config file's path,
	// so a reused path would serve a stale module.
	it('drops fields with the wrong type or out-of-range values', async () => {
		write(
			'hlidskjalf.config.ts',
			'export default { order: "sideways", metrics: "yes", title: 5, watch: 1 }',
		)

		expect(await loadConfig(tmpDir)).toEqual({})
	})

	it('keeps a known theme name', async () => {
		write('hlidskjalf.config.ts', 'export default { theme: "niflheim" }')

		expect(await loadConfig(tmpDir)).toEqual({ theme: 'niflheim' })
	})

	it('drops an unknown theme name', async () => {
		write('hlidskjalf.config.ts', 'export default { theme: "midgard" }')

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
