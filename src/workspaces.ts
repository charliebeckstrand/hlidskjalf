import { type Dirent, existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { sanitizeForDisplay } from './logs/index.js'
import type { Workspace, WorkspaceKind } from './types.js'
import { isPlainObject } from './utilities.js'

interface PkgJson {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
}

/** Valid npm package name pattern (scoped or unscoped). */
const VALID_PKG_NAME = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/

export function isValidPackageName(name: string): boolean {
	return VALID_PKG_NAME.test(name) && name.length <= 214
}

/**
 * Clean a raw list of filter patterns from the CLI or a config file: strip the `{...}`
 * braces a shell may leave around a turbo-style filter, then drop (and warn about)
 * any entry whose package name is invalid. The trailing `...` transitive-deps marker
 * is preserved on valid entries.
 */
export function normalizeFilters(raw: string[]): string[] {
	return raw
		.map((v) => v.replace(/^\{(.+)\}$/, '$1'))
		.filter((v) => {
			const name = v.endsWith('...') ? v.slice(0, -3) : v

			if (!isValidPackageName(name)) {
				// A rejected name may come from an untrusted config and carry terminal
				// escapes; scrub before echoing it.
				console.error(`Ignoring invalid filter: ${sanitizeForDisplay(name)}`)

				return false
			}

			return true
		})
}

/**
 * Coerce an unknown value into a record of string-valued entries, dropping non-string
 * values. Guards against malformed package.json fields (e.g. a numeric dependency
 * version) that would otherwise throw downstream.
 */
function stringRecord(value: unknown): Record<string, string> | undefined {
	if (!isPlainObject(value)) return undefined

	const result: Record<string, string> = {}

	for (const [key, v] of Object.entries(value)) {
		if (typeof v === 'string') result[key] = v
	}

	return result
}

function readPkgJson(path: string): PkgJson | null {
	try {
		const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))

		if (!isPlainObject(raw)) return null

		return {
			name: typeof raw.name === 'string' ? raw.name : undefined,
			scripts: stringRecord(raw.scripts),
			dependencies: stringRecord(raw.dependencies),
		}
	} catch {
		return null
	}
}

function workspaceDeps(pkg: PkgJson): string[] {
	return Object.entries(pkg.dependencies ?? {})
		.filter(([name, v]) => v.startsWith('workspace:') && isValidPackageName(name))
		.map(([name]) => name)
}

/**
 * Display rank for alphabetical order: packages, then apps, then services, each group sorted
 * by name.
 */
const displayRank = { package: 0, app: 1, service: 2 } satisfies Record<WorkspaceKind, number>

/**
 * Start tier for run order, mirroring the spawn tiers: packages start first and gate apps and
 * services, which then start together.
 */
const startTier = { package: 0, app: 1, service: 1 } satisfies Record<WorkspaceKind, number>

export function discoverWorkspaces(root: string): Workspace[] {
	const results: Workspace[] = []

	const dirs: [string, WorkspaceKind][] = [
		['packages', 'package'],
		['apps', 'app'],
		['services', 'service'],
	]

	const resolvedRoot = resolve(root)

	for (const [dir, kind] of dirs) {
		const base = join(resolvedRoot, dir)

		if (!existsSync(base)) continue

		// existsSync passing doesn't guarantee readdirSync succeeds: `base` may be a plain file
		// (ENOTDIR), unreadable (EACCES), or vanish between the two calls (ENOENT) — the last is
		// exactly the TOCTOU window a watcher-triggered rediscovery races against while a tree is
		// being rewritten. An uncaught throw here would escape the debounced watcher callback and
		// take down the process without shutdown, orphaning every child group; skip the dir.
		let dirEntries: Dirent[]

		try {
			dirEntries = readdirSync(base, { withFileTypes: true })
		} catch {
			continue
		}

		for (const entry of dirEntries) {
			if (!entry.isDirectory()) continue

			const entryPath = join(base, entry.name)

			try {
				const realPath = realpathSync(entryPath)

				if (!realPath.startsWith(resolvedRoot + sep)) continue
			} catch {
				continue
			}

			const pkg = readPkgJson(join(entryPath, 'package.json'))

			if (!pkg?.name) continue

			if (!isValidPackageName(pkg.name)) continue

			if (pkg.name === 'hlidskjalf') continue

			if (!pkg.scripts?.dev) continue

			results.push({ name: pkg.name, kind, deps: workspaceDeps(pkg) })
		}
	}
	return results
}

/**
 * Dependency ("run") order: start tier first, then a topological order within each tier, so
 * a workspace is listed after every in-set dependency that starts in the same tier (earlier
 * tiers are already ahead of it). Among workspaces that are ready at the same time the name
 * decides, so the order is deterministic. A dependency cycle is broken at the
 * alphabetically-first workspace still waiting.
 */
export function sortByDeps(workspaces: Workspace[]): Workspace[] {
	const byName = new Map(workspaces.map((w) => [w.name, w]))

	const remaining = [...workspaces].sort(
		(a, b) => startTier[a.kind] - startTier[b.kind] || a.name.localeCompare(b.name),
	)

	const placed = new Set<string>()

	const ready = (w: Workspace) =>
		w.deps.every((name) => {
			const dep = byName.get(name)

			return !dep || dep === w || placed.has(name) || startTier[dep.kind] > startTier[w.kind]
		})

	const sorted: Workspace[] = []

	while (remaining.length > 0) {
		const tier = startTier[(remaining[0] as Workspace).kind]

		let index = remaining.findIndex((w) => startTier[w.kind] === tier && ready(w))

		if (index === -1) index = 0

		const [next] = remaining.splice(index, 1) as [Workspace]

		sorted.push(next)

		placed.add(next.name)
	}

	return sorted
}

export function sortByName(workspaces: Workspace[]): Workspace[] {
	return [...workspaces].sort(
		(a, b) => displayRank[a.kind] - displayRank[b.kind] || a.name.localeCompare(b.name),
	)
}

export function filterWorkspaces(workspaces: Workspace[], patterns: string[]): Workspace[] {
	const byName = new Map(workspaces.map((w) => [w.name, w]))

	const matches = new Set<string>()

	for (const pattern of patterns) {
		const transitive = pattern.endsWith('...')

		const name = transitive ? pattern.slice(0, -3) : pattern

		if (byName.has(name)) matches.add(name)

		if (transitive) collectDeps(name, byName, matches)
	}

	return workspaces.filter((w) => matches.has(w.name))
}

function collectDeps(name: string, byName: Map<string, Workspace>, collected: Set<string>): void {
	const workspace = byName.get(name)

	if (!workspace) return

	for (const dep of workspace.deps) {
		if (byName.has(dep) && !collected.has(dep)) {
			collected.add(dep)

			collectDeps(dep, byName, collected)
		}
	}
}
