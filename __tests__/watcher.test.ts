import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Watcher, watchWorkspaces } from '../src/watcher.js'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('watchWorkspaces', () => {
	let tmpDir: string

	let watcher: Watcher | null = null

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-watch-'))

		fs.mkdirSync(join(tmpDir, 'packages'))
	})

	afterEach(() => {
		watcher?.close()

		watcher = null

		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	function createWorkspace(name: string): void {
		const dir = join(tmpDir, 'packages', name)

		fs.mkdirSync(dir, { recursive: true })

		fs.writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, scripts: { dev: 'x' } }))
	}

	/** Resolves on the next debounced change, or rejects if none arrives in time. */
	function tracker() {
		let count = 0

		let resolve: (() => void) | null = null

		return {
			onChange() {
				count += 1

				resolve?.()

				resolve = null
			},
			next: (ms = 3000) =>
				new Promise<void>((res, rej) => {
					resolve = res

					setTimeout(() => rej(new Error('no change within timeout')), ms).unref()
				}),
			get count() {
				return count
			},
		}
	}

	it('fires when a workspace package.json is added', async () => {
		const t = tracker()

		watcher = watchWorkspaces(tmpDir, t.onChange)

		const pending = t.next()

		createWorkspace('web')

		await expect(pending).resolves.toBeUndefined()
	})

	it('fires when an existing workspace package.json changes', async () => {
		createWorkspace('web')

		const t = tracker()

		watcher = watchWorkspaces(tmpDir, t.onChange)

		const pending = t.next()

		fs.writeFileSync(
			join(tmpDir, 'packages', 'web', 'package.json'),
			JSON.stringify({ name: 'web', scripts: { dev: 'y' } }),
		)

		await expect(pending).resolves.toBeUndefined()
	})

	it('stops firing after close', async () => {
		const t = tracker()

		watcher = watchWorkspaces(tmpDir, t.onChange)

		watcher.close()

		createWorkspace('web')

		await delay(700)

		expect(t.count).toBe(0)
	})
})
