import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Workspace } from '../src/types.js'
import {
	discoverWorkspaces,
	filterWorkspaces,
	isPlainObject,
	isValidPackageName,
	normalizeFilters,
	sortByDeps,
	sortByName,
} from '../src/workspaces.js'

describe('isPlainObject', () => {
	it('accepts plain objects', () => {
		expect(isPlainObject({})).toBe(true)

		expect(isPlainObject({ a: 1 })).toBe(true)
	})

	it('rejects null, arrays, and primitives', () => {
		expect(isPlainObject(null)).toBe(false)

		expect(isPlainObject([1, 2])).toBe(false)

		expect(isPlainObject('s')).toBe(false)

		expect(isPlainObject(42)).toBe(false)

		expect(isPlainObject(undefined)).toBe(false)
	})
})

describe('isValidPackageName', () => {
	it.each([
		'my-package',
		'@scope/my-package',
		'my.package_name',
		'my~package',
		'a'.repeat(214),
	])('accepts %j', (name) => {
		expect(isValidPackageName(name)).toBe(true)
	})

	it.each([
		'MyPackage',
		'.my-package',
		'_my-package',
		'',
		'my package',
		'@/my-package',
		'a'.repeat(215),
	])('rejects %j', (name) => {
		expect(isValidPackageName(name)).toBe(false)
	})
})

describe('normalizeFilters', () => {
	it('strips shell braces and drops invalid names, keeping the ... marker', () => {
		expect(normalizeFilters(['{web}', 'api...', 'Bad Name'])).toEqual(['web', 'api...'])
	})
})

describe('sortByName', () => {
	it('sorts alphabetically within a kind, packages before apps/services', () => {
		const ws: Workspace[] = [
			{ name: 'web', kind: 'app', deps: [] },
			{ name: 'charlie', kind: 'package', deps: [] },
			{ name: 'alpha', kind: 'package', deps: [] },
			{ name: 'api', kind: 'service', deps: [] },
		]

		expect(sortByName(ws).map((w) => w.name)).toEqual(['alpha', 'charlie', 'web', 'api'])
	})

	it('does not mutate the original array', () => {
		const ws: Workspace[] = [
			{ name: 'b', kind: 'package', deps: [] },
			{ name: 'a', kind: 'package', deps: [] },
		]

		expect(sortByName(ws)).not.toBe(ws)

		expect(ws[0]?.name).toBe('b')
	})
})

describe('sortByDeps', () => {
	it('orders fewer-internal-deps first, counting only in-set deps', () => {
		const ws: Workspace[] = [
			{ name: 'app', kind: 'package', deps: ['external-lib', 'utils', 'config'] },
			{ name: 'utils', kind: 'package', deps: [] },
			{ name: 'config', kind: 'package', deps: [] },
		]

		expect(sortByDeps(ws).map((w) => w.name)).toEqual(['utils', 'config', 'app'])
	})

	it('groups packages before apps regardless of deps, without mutating input', () => {
		const ws: Workspace[] = [
			{ name: 'web', kind: 'app', deps: [] },
			{ name: 'utils', kind: 'package', deps: ['config'] },
			{ name: 'config', kind: 'package', deps: [] },
		]

		const sorted = sortByDeps(ws)

		expect(sorted.map((w) => w.kind)).toEqual(['package', 'package', 'app'])

		expect(sorted).not.toBe(ws)
	})
})

describe('filterWorkspaces', () => {
	const workspaces: Workspace[] = [
		{ name: 'utils', kind: 'package', deps: [] },
		{ name: 'config', kind: 'package', deps: [] },
		{ name: 'web', kind: 'app', deps: ['utils', 'config'] },
		{ name: 'api', kind: 'service', deps: ['utils'] },
	]

	it('filters by exact names, preserving original order', () => {
		expect(filterWorkspaces(workspaces, ['api', 'utils']).map((w) => w.name)).toEqual([
			'utils',
			'api',
		])
	})

	it('includes transitive deps with the ... suffix and deduplicates', () => {
		expect(filterWorkspaces(workspaces, ['web...']).map((w) => w.name)).toEqual([
			'utils',
			'config',
			'web',
		])

		expect(filterWorkspaces(workspaces, ['web...', 'api...']).map((w) => w.name)).toEqual([
			'utils',
			'config',
			'web',
			'api',
		])
	})

	it('returns empty for unknown names', () => {
		expect(filterWorkspaces(workspaces, ['nonexistent'])).toEqual([])

		expect(filterWorkspaces(workspaces, ['nonexistent...'])).toEqual([])
	})

	it('resolves nested transitive deps', () => {
		const nested: Workspace[] = [
			{ name: 'a', kind: 'package', deps: [] },
			{ name: 'b', kind: 'package', deps: ['a'] },
			{ name: 'c', kind: 'app', deps: ['b'] },
		]

		expect(filterWorkspaces(nested, ['c...']).map((w) => w.name)).toEqual(['a', 'b', 'c'])
	})
})

describe('discoverWorkspaces', () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-test-'))
	})

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	function createWorkspace(dir: string, name: string, pkg: Record<string, unknown>): void {
		const wsDir = join(tmpDir, dir, name)

		fs.mkdirSync(wsDir, { recursive: true })

		fs.writeFileSync(join(wsDir, 'package.json'), JSON.stringify(pkg))
	}

	it.each([
		['packages', 'package'],
		['apps', 'app'],
		['services', 'service'],
	] as const)('discovers a workspace under %s with a dev script', (dir, kind) => {
		createWorkspace(dir, 'thing', { name: 'thing', scripts: { dev: 'x' } })

		expect(discoverWorkspaces(tmpDir)).toEqual([{ name: 'thing', kind, deps: [] }])
	})

	it.each([
		['no dev script', { name: 'config', scripts: { build: 'tsc' } }],
		['no name', { scripts: { dev: 'x' } }],
		['invalid name', { name: 'INVALID_NAME', scripts: { dev: 'x' } }],
		['the tool itself', { name: 'hlidskjalf', scripts: { dev: 'x' } }],
		['non-string dev', { name: 'utils', scripts: { dev: { run: 'tsup' } } }],
	])('skips a workspace with %s', (_label, pkg) => {
		createWorkspace('packages', 'x', pkg)

		expect(discoverWorkspaces(tmpDir)).toEqual([])
	})

	it('extracts only workspace: dependencies, ignoring malformed values', () => {
		createWorkspace('apps', 'web', {
			name: 'web',
			scripts: { dev: 'next dev' },
			dependencies: { utils: 'workspace:*', react: '^18.0.0', broken: 123, nested: { v: '1' } },
		})

		expect(discoverWorkspaces(tmpDir)).toEqual([{ name: 'web', kind: 'app', deps: ['utils'] }])
	})

	it('skips a workspace whose package.json is unreadable JSON', () => {
		const wsDir = join(tmpDir, 'packages', 'x')

		fs.mkdirSync(wsDir, { recursive: true })

		fs.writeFileSync(join(wsDir, 'package.json'), '{ not: valid json')

		expect(discoverWorkspaces(tmpDir)).toEqual([])
	})

	it('skips a workspace dir symlinked outside the root', () => {
		const outside = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'hlidskjalf-outside-'))

		try {
			fs.writeFileSync(
				join(outside, 'package.json'),
				JSON.stringify({ name: 'evil', scripts: { dev: 'x' } }),
			)

			fs.mkdirSync(join(tmpDir, 'packages'), { recursive: true })

			fs.symlinkSync(outside, join(tmpDir, 'packages', 'evil'))

			expect(discoverWorkspaces(tmpDir)).toEqual([])
		} finally {
			fs.rmSync(outside, { recursive: true, force: true })
		}
	})

	it('handles missing directories and discovers across many', () => {
		expect(discoverWorkspaces(tmpDir)).toEqual([])

		createWorkspace('packages', 'utils', { name: 'utils', scripts: { dev: 'x' } })

		createWorkspace('apps', 'web', { name: 'web', scripts: { dev: 'y' } })

		expect(
			discoverWorkspaces(tmpDir)
				.map((w) => w.name)
				.sort(),
		).toEqual(['utils', 'web'])
	})
})
