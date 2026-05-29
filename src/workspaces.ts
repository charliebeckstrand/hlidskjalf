import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { Workspace, WorkspaceKind } from './types.js'

interface PkgJson {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
}

/** Narrow an unknown value to a non-null, non-array object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Valid npm package name pattern (scoped or unscoped). */
const VALID_PKG_NAME = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/

export function isValidPackageName(name: string): boolean {
	return VALID_PKG_NAME.test(name) && name.length <= 214
}

/**
 * Clean a raw list of filter patterns from the CLI or a config file: strip the `{…}`
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
				console.error(`Ignoring invalid filter: ${name}`)
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

function readJson(path: string): PkgJson | null {
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

const kindOrder = { package: 0, app: 1, service: 1 } satisfies Record<WorkspaceKind, number>

export function discover(root: string): Workspace[] {
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

		for (const entry of readdirSync(base, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const entryPath = join(base, entry.name)

			try {
				const realPath = realpathSync(entryPath)
				if (!realPath.startsWith(resolvedRoot + sep)) continue
			} catch {
				continue
			}

			const pkg = readJson(join(entryPath, 'package.json'))
			if (!pkg?.name) continue
			if (!isValidPackageName(pkg.name)) continue
			if (pkg.name === 'hlidskjalf') continue
			if (!pkg.scripts?.dev) continue

			results.push({ name: pkg.name, kind, deps: workspaceDeps(pkg) })
		}
	}
	return results
}

export function sortByDeps(workspaces: Workspace[]): Workspace[] {
	const names = new Set(workspaces.map((w) => w.name))
	// Precompute each workspace's internal dependency count once; doing it inside the
	// comparator would re-filter both operands' deps on every O(n log n) comparison.
	const depCount = new Map<Workspace, number>()
	for (const workspace of workspaces) {
		let count = 0
		for (const dep of workspace.deps) {
			if (names.has(dep)) count++
		}
		depCount.set(workspace, count)
	}
	return [...workspaces].sort((a, b) => {
		if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind]
		return (depCount.get(a) ?? 0) - (depCount.get(b) ?? 0)
	})
}

export function sortByName(workspaces: Workspace[]): Workspace[] {
	return [...workspaces].sort((a, b) => {
		if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind]
		return a.name.localeCompare(b.name)
	})
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
