import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Workspace, WorkspaceKind } from './types.js'

interface PkgJson {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
}

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T
	} catch {
		return null
	}
}

function workspaceDeps(pkg: PkgJson): string[] {
	return Object.entries(pkg.dependencies ?? {})
		.filter(([, v]) => v.startsWith('workspace:'))
		.map(([name]) => name)
}

const kindOrder: Record<WorkspaceKind, number> = { package: 0, app: 1 }

export function discover(root: string): Workspace[] {
	const results: Workspace[] = []

	for (const dir of ['packages', 'apps'] as const) {
		const base = join(root, dir)
		const kind: WorkspaceKind = dir === 'apps' ? 'app' : 'package'

		if (!existsSync(base)) continue

		for (const entry of readdirSync(base, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const pkg = readJson<PkgJson>(join(base, entry.name, 'package.json'))

			if (!pkg?.name) continue
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
