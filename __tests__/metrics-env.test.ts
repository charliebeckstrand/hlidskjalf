import { describe, expect, it } from 'vitest'
import { safeEnv } from '../src/metrics/index.js'

describe('safeEnv', () => {
	it('keeps only allowlisted variables and drops secrets', () => {
		const env = safeEnv({
			PATH: '/usr/bin',
			HOME: '/home/me',
			SECRET_TOKEN: 'abc',
			AWS_SECRET_ACCESS_KEY: 'nope',
		})

		expect(env.PATH).toBe('/usr/bin')

		expect(env.HOME).toBe('/home/me')

		expect(env.SECRET_TOKEN).toBeUndefined()

		expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
	})

	it('forces colour output, even with no source', () => {
		expect(safeEnv({}).FORCE_COLOR).toBe('1')

		expect(safeEnv().FORCE_COLOR).toBe('1')
	})
})
