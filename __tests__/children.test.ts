import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { escalateKill, isRunning, killTree } from '../src/store/children.js'

// A minimal ChildProcess stand-in: only the fields these helpers read.
function fakeChild(over: Partial<ChildProcess> = {}): ChildProcess {
	return {
		pid: 4321,
		exitCode: null,
		signalCode: null,
		kill: vi.fn(() => true),
		...over,
	} as ChildProcess
}

afterEach(() => {
	vi.useRealTimers()

	vi.restoreAllMocks()
})

describe('isRunning', () => {
	it('is false for a missing child and true only while neither exit nor signal is set', () => {
		expect(isRunning(null)).toBe(false)

		expect(isRunning(undefined)).toBe(false)

		expect(isRunning(fakeChild())).toBe(true)

		expect(isRunning(fakeChild({ exitCode: 0 }))).toBe(false)

		expect(isRunning(fakeChild({ signalCode: 'SIGTERM' }))).toBe(false)
	})
})

describe('killTree', () => {
	it('signals the whole process group with a negative pid', () => {
		const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

		const child = fakeChild()

		killTree(child, 'SIGTERM')

		expect(kill).toHaveBeenCalledWith(-4321, 'SIGTERM')

		expect(child.kill).not.toHaveBeenCalled()
	})

	it('falls back to the bare child when the group is already gone', () => {
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw new Error('ESRCH')
		})

		const child = fakeChild()

		killTree(child, 'SIGKILL')

		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})

	it('swallows a kill that throws because the child is already dead', () => {
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw new Error('ESRCH')
		})

		const child = fakeChild({
			pid: undefined,
			kill: vi.fn(() => {
				throw new Error('ESRCH')
			}) as unknown as ChildProcess['kill'],
		})

		expect(() => killTree(child, 'SIGTERM')).not.toThrow()
	})
})

describe('escalateKill', () => {
	it('SIGKILLs the group if the child has not exited within the grace period', () => {
		vi.useFakeTimers()

		const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

		const child = fakeChild()

		escalateKill(child)

		vi.advanceTimersByTime(5000)

		expect(kill).toHaveBeenCalledWith(-4321, 'SIGKILL')
	})

	it('does not signal a child that has already exited', () => {
		vi.useFakeTimers()

		const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

		escalateKill(fakeChild({ exitCode: 0 }))

		vi.advanceTimersByTime(5000)

		expect(kill).not.toHaveBeenCalled()
	})

	it('returns a timer the caller can cancel before the grace period elapses', () => {
		vi.useFakeTimers()

		const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

		const timer = escalateKill(fakeChild())

		clearTimeout(timer)

		vi.advanceTimersByTime(5000)

		expect(kill).not.toHaveBeenCalled()
	})
})
