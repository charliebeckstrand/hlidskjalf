import fs, { watch } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Watcher, watchWorkspaces } from '../src/watcher.js'

// Wrap fs.watch with a spy that delegates to the real implementation: the integration
// tests below still observe real filesystem events, while the containment test can assert
// which paths a watcher was actually placed on.
vi.mock('node:fs', async (importActual) => {
	const actual = await importActual<typeof import('node:fs')>()

	return { ...actual, default: actual, watch: vi.fn(actual.watch) }
})

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('watchWorkspaces', () => {
	let tmpDir: string

	let watcher: Watcher | null = null

	beforeEach(() => {
		vi.clearAllMocks()

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

	it('drops a child watcher when its workspace dir is removed', async () => {
		createWorkspace('web')

		const t = tracker()

		watcher = watchWorkspaces(tmpDir, t.onChange)

		// Removing the dir fires the parent watcher, which re-syncs children and must close and
		// forget the watcher on the now-gone dir.
		fs.rmSync(join(tmpDir, 'packages', 'web'), { recursive: true, force: true })

		await expect(t.next()).resolves.toBeUndefined()

		// Re-create the same dir and write its package.json. A stale watcher left on the old
		// inode would not see this; a correctly re-synced one fires again.
		createWorkspace('web')

		await expect(t.next()).resolves.toBeUndefined()
	})

	it('does not watch a workspace dir symlinked outside the root', () => {
		const outside = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-outside-'))

		try {
			fs.writeFileSync(
				join(outside, 'package.json'),
				JSON.stringify({ name: 'evil', scripts: { dev: 'x' } }),
			)

			const link = join(tmpDir, 'packages', 'evil')

			fs.symlinkSync(outside, link)

			watcher = watchWorkspaces(tmpDir, () => {})

			// The containment check must keep a watcher off the out-of-root target. Assert that
			// directly rather than via an event count: macOS fs.watch delivers a benign parent-dir
			// event for a write to a symlink target, so a count would be platform-dependent even
			// though no watcher was ever placed on the link.
			expect(watch).not.toHaveBeenCalledWith(link, expect.anything())
		} finally {
			fs.rmSync(outside, { recursive: true, force: true })
		}
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
