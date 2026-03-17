import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { CacheEntry, CacheStats } from './types.js'

function resolveCacheDir(root: string, override?: string): string {
	if (override) return resolve(root, override)

	const envDir = process.env.TURBO_CACHE_DIR
	if (envDir) return resolve(root, envDir)

	try {
		const turboJson = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf-8'))
		if (turboJson.cacheDir) return resolve(root, turboJson.cacheDir)
	} catch {
		// no turbo.json or no cacheDir field
	}

	return join(root, '.turbo', 'cache')
}

function dirSize(dir: string): number {
	let total = 0
	try {
		const entries = readdirSync(dir, { withFileTypes: true })
		for (const entry of entries) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) {
				total += dirSize(full)
			} else {
				try {
					total += statSync(full).size
				} catch {
					// skip unreadable files
				}
			}
		}
	} catch {
		// skip unreadable directories
	}
	return total
}

function listFiles(dir: string, prefix = ''): string[] {
	const results: string[] = []
	try {
		const entries = readdirSync(dir, { withFileTypes: true })
		for (const entry of entries) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				results.push(...listFiles(join(dir, entry.name), relative))
			} else {
				results.push(relative)
			}
		}
	} catch {
		// skip unreadable
	}
	return results
}

export function readCacheEntries(root: string, cacheDirOverride?: string): CacheEntry[] {
	const cacheDir = resolveCacheDir(root, cacheDirOverride)

	let dirents: ReturnType<typeof readdirSync<'utf-8'>>
	try {
		dirents = readdirSync(cacheDir, { withFileTypes: true })
	} catch {
		return []
	}

	const entries: CacheEntry[] = []

	for (const dirent of dirents) {
		if (!dirent.isDirectory()) continue
		const entryPath = join(cacheDir, dirent.name)
		try {
			const stat = statSync(entryPath)
			entries.push({
				hash: dirent.name,
				sizeBytes: dirSize(entryPath),
				createdAt: stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime,
				files: listFiles(entryPath),
			})
		} catch {
			// skip unreadable entries
		}
	}

	entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
	return entries
}

export function computeStats(entries: CacheEntry[]): CacheStats {
	if (entries.length === 0) {
		return { totalSizeBytes: 0, entryCount: 0, oldestEntry: null, newestEntry: null }
	}

	let total = 0
	let oldest = entries[0].createdAt
	let newest = entries[0].createdAt

	for (const entry of entries) {
		total += entry.sizeBytes
		if (entry.createdAt < oldest) oldest = entry.createdAt
		if (entry.createdAt > newest) newest = entry.createdAt
	}

	return {
		totalSizeBytes: total,
		entryCount: entries.length,
		oldestEntry: oldest,
		newestEntry: newest,
	}
}

export function deleteEntry(root: string, hash: string, cacheDirOverride?: string): void {
	const cacheDir = resolveCacheDir(root, cacheDirOverride)
	const entryPath = join(cacheDir, hash)

	// Validate the hash doesn't escape the cache directory
	const resolved = resolve(entryPath)
	if (!resolved.startsWith(resolve(cacheDir))) return

	rmSync(entryPath, { recursive: true, force: true })
}

export function clearAllEntries(root: string, cacheDirOverride?: string): void {
	const cacheDir = resolveCacheDir(root, cacheDirOverride)
	try {
		const dirents = readdirSync(cacheDir, { withFileTypes: true })
		for (const dirent of dirents) {
			if (!dirent.isDirectory()) continue
			rmSync(join(cacheDir, dirent.name), { recursive: true, force: true })
		}
	} catch {
		// directory doesn't exist or unreadable
	}
}

export function getCacheDir(root: string, override?: string): string {
	return resolveCacheDir(root, override)
}
