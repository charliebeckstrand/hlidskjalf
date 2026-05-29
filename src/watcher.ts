import { existsSync, type FSWatcher, readdirSync, watch } from 'node:fs'
import { join } from 'node:path'

/** Parent directories Turborepo workspaces live under. */
const WORKSPACE_DIRS = ['packages', 'apps', 'services']

/** Coalesce a burst of filesystem events into a single re-discovery. */
const DEBOUNCE_MS = 300

export interface Watcher {
	close(): void
}

/**
 * Watch the workspace tree for changes that could alter discovery and invoke
 * `onChange` (debounced) when one lands. Two layers of non-recursive watchers
 * keep this cheap and avoid descending into `node_modules`:
 *
 *  - one per parent dir (`packages`/`apps`/`services`) to catch workspace dirs
 *    being added or removed, and
 *  - one per workspace dir to catch its own `package.json` being written.
 *
 * Recursive watching is deliberately avoided: on Linux it would register a
 * watcher for every nested `node_modules` directory.
 */
export function watchWorkspaces(root: string, onChange: () => void): Watcher {
	const parentWatchers: FSWatcher[] = []
	const childWatchers = new Map<string, FSWatcher>()

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
		if (closed || childWatchers.has(dir)) return

		try {
			const w = watch(dir, (_event, filename) => {
				// A null filename means the platform couldn't report which file
				// changed, so re-discover to be safe.
				if (!filename || filename.toString() === 'package.json') schedule()
			})

			w.on('error', () => {})

			childWatchers.set(dir, w)
		} catch {
			// Directory vanished or watching is unsupported here — skip it.
		}
	}

	// Add watchers for new workspace dirs and drop watchers for removed ones.
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

		for (const [dir, w] of childWatchers) {
			if (!existsSync(dir)) {
				w.close()

				childWatchers.delete(dir)
			}
		}
	}

	for (const dir of WORKSPACE_DIRS) {
		const base = join(root, dir)

		if (!existsSync(base)) continue

		try {
			const w = watch(base, () => {
				syncChildren()

				schedule()
			})

			w.on('error', () => {})

			parentWatchers.push(w)
		} catch {
			// Watching unsupported for this dir — skip it.
		}
	}

	syncChildren()

	return {
		close() {
			closed = true

			if (timer) clearTimeout(timer)

			for (const w of parentWatchers) w.close()

			for (const w of childWatchers.values()) w.close()

			childWatchers.clear()
		},
	}
}
