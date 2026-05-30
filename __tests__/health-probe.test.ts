import { afterEach, describe, expect, it, vi } from 'vitest'
import { probe } from '../src/health/index.js'

afterEach(() => {
	vi.restoreAllMocks()

	vi.unstubAllGlobals()
})

describe('probe', () => {
	it('resolves true for a reachable url and drains the body', async () => {
		const cancel = vi.fn(async () => {})

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ body: { cancel } })),
		)

		await expect(probe('http://localhost:3000')).resolves.toBe(true)

		// The body is drained so the socket frees.
		expect(cancel).toHaveBeenCalledOnce()
	})

	it('resolves true for a bodyless response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({})),
		)

		await expect(probe('http://localhost:3000')).resolves.toBe(true)
	})

	it('resolves false when the fetch rejects', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED')
			}),
		)

		await expect(probe('http://localhost:3000')).resolves.toBe(false)
	})

	it('passes an abort signal so the request can time out', async () => {
		const fetchMock = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
			void init

			return { body: { cancel: async () => {} } }
		})

		vi.stubGlobal('fetch', fetchMock)

		await probe('http://localhost:3000')

		expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
	})
})
