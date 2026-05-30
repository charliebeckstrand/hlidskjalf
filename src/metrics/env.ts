/** Allowlisted environment variable names passed to child processes. */
export const ENV_ALLOWLIST = new Set([
	'HOME',
	'USER',
	'LOGNAME',
	'SHELL',
	'PATH',
	'LANG',
	'LC_ALL',
	'LC_CTYPE',
	'TERM',
	'TERM_PROGRAM',
	'COLORTERM',
	'NODE_ENV',
	'NODE_OPTIONS',
	'NODE_PATH',
	'NPM_CONFIG_REGISTRY',
	'PNPM_HOME',
	'COREPACK_HOME',
	'XDG_CONFIG_HOME',
	'XDG_DATA_HOME',
	'XDG_CACHE_HOME',
	'TMPDIR',
	'TMP',
	'TEMP',
	'EDITOR',
	'DISPLAY',
	'HOSTNAME',
])

/** Build a child-process environment containing only allowlisted variables. */
export function safeEnv(
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
	const filtered: Record<string, string | undefined> = {}

	// Iterate the small fixed allowlist, not all of `source`: process.env routinely
	// carries dozens of vars, so a per-key lookup against the allowlist avoids both the
	// larger scan and the intermediate array Object.keys would allocate.
	for (const key of ENV_ALLOWLIST) {
		const value = source[key]

		if (value !== undefined) filtered[key] = value
	}

	filtered.FORCE_COLOR = '1'

	return filtered
}
