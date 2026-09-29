import { existsSync, type FSWatcher, readdirSync, realpathSync, watch } from 'node:fs'
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
 * watcher on a dead inode delivering nothing. Neither existence nor the inode number can
 * spot that — the delete and recreate often land before the event is handled, and the
 * filesystem readily hands the new directory the freed inode number. So any event that
 * names a directory re-arms that directory's watcher outright: the root re-arms a named
 * parent, a parent re-arms a named workspace dir. Re-arming a live watcher is one close and
 * one open, and these events only fire when a directory entry itself changes.
 *
 * Recursive watching is deliberately avoided: on Linux it would register a watcher
 * for every nested `node_modules` directory.
 */
export function watchWorkspaces(root: string, onChange: () => void): Watcher {
	const resolvedRoot = resolve(root)

	const parentWatchers = new Map<string, FSWatcher>()

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

	/** Close and forget the watcher at `path` in `watchers`, if any. */
	const drop = (watchers: Map<string, FSWatcher>, path: string) => {
		watchers.get(path)?.close()

		watchers.delete(path)
	}

	/** Watch `dir`, or return null if it's gone or watching is unsupported there. */
	const open = (dir: string, listener: (filename: string | null) => void): FSWatcher | null => {
		try {
			const w = watch(dir, (_event, filename) => listener(filename?.toString() ?? null))

			w.on('error', () => {})

			return w
		} catch {
			return null
		}
	}

	/** Watch a workspace dir for its `package.json`; `rearm` replaces an existing watcher. */
	const watchChild = (dir: string, rearm: boolean) => {
		if (closed) return

		if (childWatchers.has(dir) && !rearm) return

		drop(childWatchers, dir)

		// Mirror discoverWorkspaces()'s containment check: a symlinked workspace dir must not place
		// a watcher on a target outside the root.
		try {
			if (!realpathSync(dir).startsWith(resolvedRoot + sep)) return
		} catch {
			return
		}

		// A null filename means the platform couldn't report which file changed, so re-discover
		// to be safe.
		const w = open(dir, (filename) => {
			if (!filename || filename === 'package.json') schedule()
		})

		if (w) childWatchers.set(dir, w)
	}

	/**
	 * Add watchers for new workspace dirs and drop ones for removed dirs. `replaced` names a
	 * workspace dir an event just reported under `base` (every parent when `base` is omitted),
	 * whose watcher is re-armed; null means the platform didn't say which, so every dir there
	 * is re-armed.
	 */
	const syncChildren = (base?: string, replaced?: string | null) => {
		if (closed) return

		for (const dir of WORKSPACE_DIRS) {
			const parent = join(resolvedRoot, dir)

			try {
				for (const entry of readdirSync(parent, { withFileTypes: true })) {
					if (!entry.isDirectory()) continue

					const rearm =
						(base === undefined || parent === base) &&
						(replaced === null || replaced === entry.name)

					watchChild(join(parent, entry.name), rearm)
				}
			} catch {
				// Parent dir doesn't exist (yet) — nothing to watch under it.
			}
		}

		for (const dir of childWatchers.keys()) {
			if (!existsSync(dir)) drop(childWatchers, dir)
		}
	}

	/**
	 * Add watchers for parent dirs that now exist and drop ones that vanished. `replaced` names
	 * a parent the root just reported, whose watcher is re-armed; null re-arms every parent.
	 */
	const syncParents = (replaced?: string | null) => {
		if (closed) return

		for (const dir of WORKSPACE_DIRS) {
			const base = join(resolvedRoot, dir)

			if (replaced === null || replaced === dir || !existsSync(base)) drop(parentWatchers, base)

			if (parentWatchers.has(base)) continue

			const w = open(base, (filename) => {
				syncChildren(base, filename)

				schedule()
			})

			if (w) parentWatchers.set(base, w)
		}
	}

	// Watch the root itself so a parent dir created, removed, or swapped after startup is
	// noticed. Filter to the workspace parents (and a null filename) so churn in `node_modules`
	// or the root package.json doesn't trigger a re-discovery.
	const rootWatcher = open(resolvedRoot, (filename) => {
		if (filename && !WORKSPACE_DIRS.includes(filename)) return

		syncParents(filename)

		// A replaced parent brings replaced workspace dirs with it: re-arm all of them.
		syncChildren(filename ? join(resolvedRoot, filename) : undefined, null)

		schedule()
	})

	syncParents()

	syncChildren()

	return {
		close() {
			closed = true

			if (timer) clearTimeout(timer)

			rootWatcher?.close()

			for (const w of parentWatchers.values()) w.close()

			parentWatchers.clear()

			for (const w of childWatchers.values()) w.close()

			childWatchers.clear()
		},
	}
}
