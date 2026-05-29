import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCoalescer } from '../src/coalesce.js'

describe('createCoalescer', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('collapses a burst of schedules into a single flush', () => {
		const flush = vi.fn()

		const coalescer = createCoalescer(flush, 16)

		for (let i = 0; i < 100; i++) coalescer.schedule()

		expect(flush).not.toHaveBeenCalled()

		vi.advanceTimersByTime(16)

		expect(flush).toHaveBeenCalledTimes(1)
	})

	it('flushes again for changes that arrive after a flush', () => {
		const flush = vi.fn()

		const coalescer = createCoalescer(flush, 16)

		coalescer.schedule()

		vi.advanceTimersByTime(16)

		expect(flush).toHaveBeenCalledTimes(1)

		coalescer.schedule()

		vi.advanceTimersByTime(16)

		expect(flush).toHaveBeenCalledTimes(2)
	})

	it('bounds flushes to one per interval under a sustained stream', () => {
		const flush = vi.fn()

		const coalescer = createCoalescer(flush, 16)

		// 10 intervals worth of events, many per interval.
		for (let t = 0; t < 10; t++) {
			for (let i = 0; i < 50; i++) coalescer.schedule()

			vi.advanceTimersByTime(16)
		}

		expect(flush).toHaveBeenCalledTimes(10)
	})

	it('does not flush after cancel', () => {
		const flush = vi.fn()

		const coalescer = createCoalescer(flush, 16)

		coalescer.schedule()
		coalescer.cancel()

		vi.advanceTimersByTime(1000)

		expect(flush).not.toHaveBeenCalled()
	})

	it('can schedule again after a cancel', () => {
		const flush = vi.fn()

		const coalescer = createCoalescer(flush, 16)

		coalescer.schedule()
		coalescer.cancel()

		coalescer.schedule()
		
		vi.advanceTimersByTime(16)

		expect(flush).toHaveBeenCalledTimes(1)
	})
})
