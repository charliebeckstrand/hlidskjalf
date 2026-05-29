import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { escalateKill, isRunning, killTree } from '../src/child.js'

function fakeChild(overrides: Partial<ChildProcess> = {}): ChildProcess {
	return {
		exitCode: null,
		signalCode: null,
		pid: 1234,
		kill: vi.fn(() => true),
		...overrides,
	} as unknown as ChildProcess
}

afterEach(() => {
	vi.restoreAllMocks()

	vi.useRealTimers()
})

describe('isRunning', () => {
	it('is true for a live child', () => {
		expect(isRunning(fakeChild())).toBe(true)
	})

	it('is false once the child has exited', () => {
		expect(isRunning(fakeChild({ exitCode: 0 }))).toBe(false)
	})

	it('is false once the child has been signalled', () => {
		expect(isRunning(fakeChild({ signalCode: 'SIGTERM' }))).toBe(false)
	})

	it('is false for null or undefined', () => {
		expect(isRunning(null)).toBe(false)

		expect(isRunning(undefined)).toBe(false)
	})
})

describe('killTree', () => {
	it('signals the whole process group via the negative pid', () => {
		const kill = vi.spyOn(process, 'kill').mockReturnValue(true)

		const child = fakeChild({ pid: 4321 })

		killTree(child, 'SIGTERM')

		expect(kill).toHaveBeenCalledWith(-4321, 'SIGTERM')

		expect(child.kill).not.toHaveBeenCalled()
	})

	it('falls back to the bare child when the group is already gone', () => {
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw new Error('ESRCH')
		})

		const child = fakeChild({ pid: 4321 })

		killTree(child, 'SIGKILL')

		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})

	it('uses the bare child when there is no pid', () => {
		const kill = vi.spyOn(process, 'kill').mockReturnValue(true)

		const child = fakeChild({ pid: undefined })

		killTree(child, 'SIGTERM')

		expect(kill).not.toHaveBeenCalled()

		expect(child.kill).toHaveBeenCalledWith('SIGTERM')
	})
})

describe('escalateKill', () => {
	it('SIGKILLs the group if the child outlives the grace period', () => {
		vi.useFakeTimers()

		const kill = vi.spyOn(process, 'kill').mockReturnValue(true)

		const child = fakeChild({ pid: 999 })

		escalateKill(child)

		vi.advanceTimersByTime(5000)

		expect(kill).toHaveBeenCalledWith(-999, 'SIGKILL')
	})

	it('does nothing if the child has already exited', () => {
		vi.useFakeTimers()

		const kill = vi.spyOn(process, 'kill').mockReturnValue(true)

		const child = fakeChild({ pid: 999 })

		const timer = escalateKill(child)

		// The child exits before the grace period elapses.
		;(child as { exitCode: number | null }).exitCode = 0

		vi.advanceTimersByTime(5000)

		expect(kill).not.toHaveBeenCalled()

		clearTimeout(timer)
	})
})
