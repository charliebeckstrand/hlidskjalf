/**
 * Narrow an unknown value to a plain object — excluding `null` and arrays, both
 * of which are `typeof 'object'`. Centralizes the guard used before reading keys
 * off untrusted input (parsed JSON, a config module's default export) so callers
 * don't repeat the `typeof === 'object' && !== null && !Array.isArray` dance and
 * get the narrowing for free.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
