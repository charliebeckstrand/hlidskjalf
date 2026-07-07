import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { useLogScroll } from '../src/hooks/use-log-scroll.js'

// Drive the hook through Ink's real input pipeline: a fake stdin write flows through the same
// internal emitter useInput and the hook read from, so both the Home/End (emitter) and PgUp
// (useInput) paths are exercised end to end.
function Harness({ total, height }: { total: number; height: number }) {
	const { start, end, atBottom } = useLogScroll(total, height, 'sel', true)

	return <Text>{`${start}|${end}|${atBottom}`}</Text>
}

const HOME = '[H'
const END = '[F'
const PAGE_UP = '[5~'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('useLogScroll Home/End', () => {
	it('jumps to the oldest lines on Home and back to follow on End', async () => {
		const { stdin, lastFrame, unmount } = render(<Harness total={100} height={10} />)

		// Let the input effects (raw mode + emitter subscription) mount before writing.
		await flush()

		// Starts in follow mode: newest 10 lines, pinned to the bottom.
		expect(lastFrame()).toBe('90|100|true')

		stdin.write(HOME)

		await flush()

		// Home scrolls to the maximum offset: the oldest 10 lines, no longer at the bottom.
		expect(lastFrame()).toBe('0|10|false')

		stdin.write(END)

		await flush()

		// End returns to follow mode.
		expect(lastFrame()).toBe('90|100|true')

		unmount()
	})

	it('still pages with PgUp (the useInput path is intact)', async () => {
		const { stdin, lastFrame, unmount } = render(<Harness total={100} height={10} />)

		// Let the input effects mount before writing (as the Home/End case does).
		await flush()

		expect(lastFrame()).toBe('90|100|true')

		stdin.write(PAGE_UP)

		await flush()

		// One page back from the tail: a 10-line window ending 10 lines above the bottom.
		expect(lastFrame()).toBe('80|90|false')

		unmount()
	})
})
