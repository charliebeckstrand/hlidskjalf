/** Per-probe HTTP timeout. */
const PROBE_TIMEOUT_MS = 3000

/**
 * Reachability check for a dev server: any HTTP response means it's alive. The body is
 * drained so the socket frees. Never throws — a failed fetch (timeout, refused, DNS)
 * resolves `false`.
 */
export async function probe(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })

		// Any response means the server is alive; drain the body so the socket frees.
		await res.body?.cancel()

		return true
	} catch {
		return false
	}
}
