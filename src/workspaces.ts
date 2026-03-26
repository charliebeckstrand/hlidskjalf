import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { Workspace, WorkspaceKind } from './types.js'

interface PkgJson {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
}

/** Valid npm package name pattern (scoped or unscoped) */
const VALID_PKG_NAME = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/

export function isValidPackageName(name: string): boolean {
	return VALID_PKG_NAME.test(name) && name.length <= 214
}

function readJson(path: string): PkgJson | null {
	try {
		const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

		const obj = raw as Record<string, unknown>

		const name = typeof obj.name === 'string' ? obj.name : undefined

		const scripts =
			typeof obj.scripts === 'object' && obj.scripts !== null && !Array.isArray(obj.scripts)
				? (obj.scripts as Record<string, string>)
				: undefined

		const dependencies =
			typeof obj.dependencies === 'object' &&
			obj.dependencies !== null &&
			!Array.isArray(obj.dependencies)
				? (obj.dependencies as Record<string, string>)
				: undefined

		return { name, scripts, dependencies }
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

			results.push({
				name: pkg.name,
				kind,
				deps: workspaceDeps(pkg),
			})
		}
	}

	return results
}

export function sortByDeps(workspaces: Workspace[]): Workspace[] {
	const names = new Set(workspaces.map((w) => w.name))

	return [...workspaces].sort((a, b) => {
		if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind]

		const aDeps = a.deps.filter((d) => names.has(d)).length
		const bDeps = b.deps.filter((d) => names.has(d)).length

		return aDeps - bDeps
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
