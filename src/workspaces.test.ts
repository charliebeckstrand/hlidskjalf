import fs from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Workspace } from './types.js'
import { discover, filterWorkspaces, isValidPackageName, sortByDeps, sortByName } from './workspaces.js'

describe('isValidPackageName', () => {
	it('accepts simple names', () => {
		expect(isValidPackageName('my-package')).toBe(true)
	})

	it('accepts scoped names', () => {
		expect(isValidPackageName('@scope/my-package')).toBe(true)
	})

	it('accepts names with dots and underscores', () => {
		expect(isValidPackageName('my.package_name')).toBe(true)
	})

	it('accepts names with tilde', () => {
		expect(isValidPackageName('my~package')).toBe(true)
	})

	it('rejects names starting with uppercase', () => {
		expect(isValidPackageName('MyPackage')).toBe(false)
	})

	it('rejects names starting with a dot', () => {
		expect(isValidPackageName('.my-package')).toBe(false)
	})

	it('rejects names starting with underscore', () => {
		expect(isValidPackageName('_my-package')).toBe(false)
	})

	it('rejects empty string', () => {
		expect(isValidPackageName('')).toBe(false)
	})

	it('rejects names longer than 214 characters', () => {
		const longName = 'a'.repeat(215)

		expect(isValidPackageName(longName)).toBe(false)
	})

	it('accepts names exactly 214 characters', () => {
		const name = 'a'.repeat(214)

		expect(isValidPackageName(name)).toBe(true)
	})

	it('rejects names with spaces', () => {
		expect(isValidPackageName('my package')).toBe(false)
	})

	it('rejects scoped names with invalid scope', () => {
		expect(isValidPackageName('@/my-package')).toBe(false)
	})
})

describe('sortByName', () => {
	it('sorts alphabetically within same kind', () => {
		const workspaces: Workspace[] = [
			{ name: 'charlie', kind: 'package', deps: [] },
			{ name: 'alpha', kind: 'package', deps: [] },
			{ name: 'bravo', kind: 'package', deps: [] },
		]

		const sorted = sortByName(workspaces)

		expect(sorted.map((w) => w.name)).toEqual(['alpha', 'bravo', 'charlie'])
	})

	it('groups packages before apps', () => {
		const workspaces: Workspace[] = [
			{ name: 'web', kind: 'app', deps: [] },
			{ name: 'utils', kind: 'package', deps: [] },
		]

		const sorted = sortByName(workspaces)

		expect(sorted.map((w) => w.name)).toEqual(['utils', 'web'])
	})

	it('groups packages before services', () => {
		const workspaces: Workspace[] = [
			{ name: 'api', kind: 'service', deps: [] },
			{ name: 'utils', kind: 'package', deps: [] },
		]

		const sorted = sortByName(workspaces)

		expect(sorted.map((w) => w.name)).toEqual(['utils', 'api'])
	})

	it('does not mutate the original array', () => {
		const workspaces: Workspace[] = [
			{ name: 'b', kind: 'package', deps: [] },
			{ name: 'a', kind: 'package', deps: [] },
		]

		const sorted = sortByName(workspaces)

		expect(sorted).not.toBe(workspaces)
		expect(workspaces[0].name).toBe('b')
	})
})

describe('sortByDeps', () => {
	it('sorts workspaces with fewer deps first', () => {
		const workspaces: Workspace[] = [
			{ name: 'app', kind: 'package', deps: ['utils', 'config'] },
			{ name: 'utils', kind: 'package', deps: [] },
			{ name: 'config', kind: 'package', deps: [] },
		]

		const sorted = sortByDeps(workspaces)

		expect(sorted.map((w) => w.name)).toEqual(['utils', 'config', 'app'])
	})

	it('only counts deps that exist in the workspace set', () => {
		const workspaces: Workspace[] = [
			{ name: 'app', kind: 'package', deps: ['external-lib', 'utils'] },
			{ name: 'utils', kind: 'package', deps: [] },
		]

		const sorted = sortByDeps(workspaces)

		// app has 1 internal dep (utils), utils has 0
		expect(sorted.map((w) => w.name)).toEqual(['utils', 'app'])
	})

	it('groups packages before apps regardless of deps', () => {
		const workspaces: Workspace[] = [
			{ name: 'web', kind: 'app', deps: [] },
			{ name: 'utils', kind: 'package', deps: ['config'] },
			{ name: 'config', kind: 'package', deps: [] },
		]

		const sorted = sortByDeps(workspaces)

		expect(sorted[0].kind).toBe('package')
		expect(sorted[1].kind).toBe('package')
		expect(sorted[2].kind).toBe('app')
	})

	it('does not mutate the original array', () => {
		const workspaces: Workspace[] = [
			{ name: 'b', kind: 'package', deps: ['a'] },
			{ name: 'a', kind: 'package', deps: [] },
		]

		const sorted = sortByDeps(workspaces)

		expect(sorted).not.toBe(workspaces)
	})
})

describe('filterWorkspaces', () => {
	const workspaces: Workspace[] = [
		{ name: 'utils', kind: 'package', deps: [] },
		{ name: 'config', kind: 'package', deps: [] },
		{ name: 'web', kind: 'app', deps: ['utils', 'config'] },
		{ name: 'api', kind: 'service', deps: ['utils'] },
	]

	it('filters by exact name', () => {
		const result = filterWorkspaces(workspaces, ['web'])

		expect(result.map((w) => w.name)).toEqual(['web'])
	})

	it('filters multiple names', () => {
		const result = filterWorkspaces(workspaces, ['web', 'api'])

		expect(result.map((w) => w.name)).toEqual(['web', 'api'])
	})

	it('includes transitive deps with ... suffix', () => {
		const result = filterWorkspaces(workspaces, ['web...'])

		expect(result.map((w) => w.name)).toEqual(['utils', 'config', 'web'])
	})

	it('returns empty for non-existent name', () => {
		const result = filterWorkspaces(workspaces, ['nonexistent'])

		expect(result).toEqual([])
	})

	it('handles transitive deps of non-existent name', () => {
		const result = filterWorkspaces(workspaces, ['nonexistent...'])

		expect(result).toEqual([])
	})

	it('deduplicates when deps overlap', () => {
		const result = filterWorkspaces(workspaces, ['web...', 'api...'])

		const names = result.map((w) => w.name)

		expect(names).toEqual(['utils', 'config', 'web', 'api'])
	})

	it('preserves original order', () => {
		const result = filterWorkspaces(workspaces, ['api', 'utils'])

		expect(result.map((w) => w.name)).toEqual(['utils', 'api'])
	})

	it('handles nested transitive deps', () => {
		const nested: Workspace[] = [
			{ name: 'a', kind: 'package', deps: [] },
			{ name: 'b', kind: 'package', deps: ['a'] },
			{ name: 'c', kind: 'app', deps: ['b'] },
		]

		const result = filterWorkspaces(nested, ['c...'])

		expect(result.map((w) => w.name)).toEqual(['a', 'b', 'c'])
	})
})

describe('discover', () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(join(fs.realpathSync(require('node:os').tmpdir()), 'hlidskjalf-test-'))
	})

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	function createWorkspace(
		dir: string,
		name: string,
		pkg: Record<string, unknown>,
	): void {
		const wsDir = join(tmpDir, dir, name)
		fs.mkdirSync(wsDir, { recursive: true })
		fs.writeFileSync(join(wsDir, 'package.json'), JSON.stringify(pkg))
	}

	it('discovers packages with dev script', () => {
		createWorkspace('packages', 'utils', {
			name: 'utils',
			scripts: { dev: 'tsup --watch' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([
			{ name: 'utils', kind: 'package', deps: [] },
		])
	})

	it('discovers apps', () => {
		createWorkspace('apps', 'web', {
			name: 'web',
			scripts: { dev: 'next dev' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([
			{ name: 'web', kind: 'app', deps: [] },
		])
	})

	it('discovers services', () => {
		createWorkspace('services', 'api', {
			name: 'api',
			scripts: { dev: 'node server.js' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([
			{ name: 'api', kind: 'service', deps: [] },
		])
	})

	it('skips workspaces without dev script', () => {
		createWorkspace('packages', 'config', {
			name: 'config',
			scripts: { build: 'tsc' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([])
	})

	it('skips workspaces without a name', () => {
		createWorkspace('packages', 'unnamed', {
			scripts: { dev: 'tsup --watch' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([])
	})

	it('skips workspaces with invalid package name', () => {
		createWorkspace('packages', 'bad', {
			name: 'INVALID_NAME',
			scripts: { dev: 'tsup --watch' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([])
	})

	it('skips the hlidskjalf package itself', () => {
		createWorkspace('packages', 'hlidskjalf', {
			name: 'hlidskjalf',
			scripts: { dev: 'tsup --watch' },
		})

		const result = discover(tmpDir)

		expect(result).toEqual([])
	})

	it('extracts workspace dependencies', () => {
		createWorkspace('apps', 'web', {
			name: 'web',
			scripts: { dev: 'next dev' },
			dependencies: {
				utils: 'workspace:*',
				react: '^18.0.0',
			},
		})

		const result = discover(tmpDir)

		expect(result[0].deps).toEqual(['utils'])
	})

	it('handles missing directories gracefully', () => {
		const result = discover(tmpDir)

		expect(result).toEqual([])
	})

	it('discovers from multiple directories', () => {
		createWorkspace('packages', 'utils', {
			name: 'utils',
			scripts: { dev: 'tsup --watch' },
		})
		createWorkspace('apps', 'web', {
			name: 'web',
			scripts: { dev: 'next dev' },
		})

		const result = discover(tmpDir)

		expect(result).toHaveLength(2)
		expect(result.map((w) => w.name).sort()).toEqual(['utils', 'web'])
	})
})
