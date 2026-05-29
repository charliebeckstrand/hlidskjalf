import { afterEach, describe, expect, it, vi } from 'vitest'

import { enterAltScreen } from '../src/terminal.js'

const ENTER = '\x1b[?1049h'
const EXIT = '\x1b[?1049l'

function fakeStream(isTTY: boolean) {
	const writes: string[] = []

	return {
		isTTY,
		write: (s: string) => {
			writes.push(s)

			return true
		},
		writes,
	} as unknown as NodeJS.WriteStream & { writes: string[] }
}

describe('enterAltScreen', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('does nothing on a non-TTY stream', () => {
		const stream = fakeStream(false)

		const restore = enterAltScreen(stream)
		restore()

		expect((stream as unknown as { writes: string[] }).writes).toEqual([])
	})

	it('switches to the alternate screen and restores on demand', () => {
		vi.spyOn(process, 'once').mockReturnValue(process)
		const stream = fakeStream(true)
		const writes = (stream as unknown as { writes: string[] }).writes

		const restore = enterAltScreen(stream)

		expect(writes).toEqual([ENTER])

		restore()

		expect(writes).toEqual([ENTER, EXIT])
	})

	it('restores at most once even if called repeatedly', () => {
		vi.spyOn(process, 'once').mockReturnValue(process)
		const stream = fakeStream(true)
		const writes = (stream as unknown as { writes: string[] }).writes

		const restore = enterAltScreen(stream)
		restore()
		restore()
		restore()

		expect(writes).toEqual([ENTER, EXIT])
	})

	it('registers a process exit listener so the screen is restored on an abrupt exit', () => {
		const once = vi.spyOn(process, 'once').mockReturnValue(process)
		const stream = fakeStream(true)

		enterAltScreen(stream)

		expect(once).toHaveBeenCalledWith('exit', expect.any(Function))
	})
})
