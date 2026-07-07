import { existsSync, type FSWatcher, readdirSync, realpathSync, statSync, watch } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** Parent directories Turborepo workspaces live under. */
const WORKSPACE_DIRS = ['packages', 'apps', 'services']

/** Coalesce a burst of filesystem events into a single re-discovery. */
const DEBOUNCE_MS = 300

export interface Watcher {
	close(): void
}

/**
 * Watch the workspace tree for changes that could alter discovery and invoke
 * `onChange` (debounced) when one lands. Three layers of non-recursive watchers keep
 * this cheap and avoid descending into `node_modules`:
 *
 *  - one on the root to catch a parent dir (`packages`/`apps`/`services`) appearing,
 *    disappearing, or being replaced — so a tree that gains an `apps/` dir after
 *    startup, or has one swapped out by a branch switch, is still tracked;
 *  - one per existing parent dir to catch workspace dirs being added or removed; and
 *  - one per workspace dir to catch its own `package.json` being written.
 *
 * `fs.watch` binds to an inode, so a deleted-and-recreated directory strands its old
 * watcher on a dead inode delivering nothing. The parent and child layers are re-synced
 * on every event (and child watchers re-armed when a dir's inode changes), so a replaced
 * directory picks up a fresh watcher instead of going silent.
 *
 * Recursive watching is deliberately avoided: on Linux it would register a watcher
 * for every nested `node_modules` directory.
 */
export function watchWorkspaces(root: string, onChange: () => void): Watcher {
	const resolvedRoot = resolve(root)

	const parentWatchers = new Map<string, FSWatcher>()

	const childWatchers = new Map<string, { watcher: FSWatcher; ino: number }>()

	let timer: ReturnType<typeof setTimeout> | null = null

	let closed = false

	const schedule = () => {
		if (closed) return

		if (timer) clearTimeout(timer)

		timer = setTimeout(() => {
			timer = null

			onChange()
		}, DEBOUNCE_MS)

		timer.unref()
	}

	const watchChild = (dir: string) => {
		if (closed) return

		// Mirror discoverWorkspaces()'s containment check: a symlinked workspace dir must not place
		// a watcher on a target outside the root. Capture the inode so a later sync can tell a
		// same-named replacement (new inode) from the directory we're already watching.
		let ino: number

		try {
			const real = realpathSync(dir)

			if (!real.startsWith(resolvedRoot + sep)) return

			ino = statSync(real).ino
		} catch {
			return
		}

		const existing = childWatchers.get(dir)

		if (existing) {
			// Same directory — keep the live watcher. A different inode means the dir was replaced
			// (delete + recreate); the old watcher is bound to the dead inode, so re-arm.
			if (existing.ino === ino) return

			existing.watcher.close()

			childWatchers.delete(dir)
		}

		try {
			const w = watch(dir, (_event, filename) => {
				// A null filename means the platform couldn't report which file changed,
				// so re-discover to be safe.
				if (!filename || filename.toString() === 'package.json') schedule()
			})

			w.on('error', () => {})

			childWatchers.set(dir, { watcher: w, ino })
		} catch {
			// Directory vanished or watching is unsupported here — skip it.
		}
	}

	// Add watchers for new workspace dirs, re-arm replaced ones, and drop watchers for removed ones.
	const syncChildren = () => {
		if (closed) return

		for (const dir of WORKSPACE_DIRS) {
			const base = join(root, dir)

			try {
				for (const entry of readdirSync(base, { withFileTypes: true })) {
					if (entry.isDirectory()) watchChild(join(base, entry.name))
				}
			} catch {
				// Parent dir doesn't exist (yet) — nothing to watch under it.
			}
		}

		for (const [dir, { watcher }] of childWatchers) {
			if (!existsSync(dir)) {
				watcher.close()

				childWatchers.delete(dir)
			}
		}
	}

	// Add watchers for parent dirs that now exist and drop ones that vanished. A parent dir
	// deleted and recreated (a branch switch, a tooling step) ends up watched on its new inode.
	const syncParents = () => {
		if (closed) return

		for (const dir of WORKSPACE_DIRS) {
			const base = join(root, dir)

			const exists = existsSync(base)

			const watching = parentWatchers.has(base)

			if (exists && !watching) {
				try {
					const w = watch(base, () => {
						syncChildren()

						schedule()
					})

					w.on('error', () => {})

					parentWatchers.set(base, w)
				} catch {
					// Watching unsupported for this dir — skip it.
				}
			} else if (!exists && watching) {
				parentWatchers.get(base)?.close()

				parentWatchers.delete(base)
			}
		}
	}

	// Watch the root itself so a parent dir created, removed, or swapped after startup is
	// noticed. Filter to the workspace parents (and a null filename) so churn in `node_modules`
	// or the root package.json doesn't trigger a re-discovery.
	let rootWatcher: FSWatcher | null = null

	try {
		rootWatcher = watch(resolvedRoot, (_event, filename) => {
			if (filename && !WORKSPACE_DIRS.includes(filename.toString())) return

			syncParents()

			syncChildren()

			schedule()
		})

		rootWatcher.on('error', () => {})
	} catch {
		// Root watching unsupported — the parent/child layers still cover in-place edits.
	}

	syncParents()

	syncChildren()

	return {
		close() {
			closed = true

			if (timer) clearTimeout(timer)

			rootWatcher?.close()

			for (const w of parentWatchers.values()) w.close()

			parentWatchers.clear()

			for (const { watcher } of childWatchers.values()) watcher.close()

			childWatchers.clear()
		},
	}
}
