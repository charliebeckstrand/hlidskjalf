import { describe, expect, it } from 'vitest'

import { createRunner } from './processes.js'

describe('createRunner', () => {
	it('returns a runner with the expected interface', () => {
		const runner = createRunner('/tmp/test-root')

		expect(runner).toHaveProperty('get')
		expect(runner).toHaveProperty('start')
		expect(runner).toHaveProperty('shutdown')
		expect(runner).toHaveProperty('stopProcess')
		expect(runner).toHaveProperty('restartProcess')
		expect(typeof runner.get).toBe('function')
		expect(typeof runner.start).toBe('function')
		expect(typeof runner.shutdown).toBe('function')
		expect(typeof runner.stopProcess).toBe('function')
		expect(typeof runner.restartProcess).toBe('function')
	})

	it('is an EventEmitter', () => {
		const runner = createRunner('/tmp/test-root')

		expect(typeof runner.on).toBe('function')
		expect(typeof runner.emit).toBe('function')
		expect(typeof runner.off).toBe('function')
	})

	it('get returns undefined for unknown process', () => {
		const runner = createRunner('/tmp/test-root')

		expect(runner.get('nonexistent')).toBeUndefined()
	})
})
