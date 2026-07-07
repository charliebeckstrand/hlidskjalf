import { EventEmitter } from 'node:events'
import { render } from 'ink'
import { afterEach, describe, expect, it } from 'vitest'
import { stripAnsi } from '../src/logs/index.js'
import { setTheme } from '../src/ui/index.js'
import { Log } from '../src/views/dashboard/log.js'

// A narrow TTY stdout so the "scrolled" banner wraps — the case where the panel used to
// under-budget its height and silently clip a real log row. ink-testing-library hardcodes
// 100 columns, so drive Ink's real render with a custom stream instead.
class NarrowStdout extends EventEmitter {
	columns = 34
	rows = 40
	frames: string[] = []
	write = (frame: string) => {
		this.frames.push(frame)
	}
	get lastFrame() {
		return this.frames.at(-1) ?? ''
	}
}

class FakeStdin extends EventEmitter {
	isTTY = true
	setRawMode() {}
	setEncoding() {}
	read() {
		return null
	}
	resume() {}
	pause() {}
	ref() {}
	unref() {}
}

let instance: ReturnType<typeof render> | undefined

afterEach(() => {
	instance?.unmount()

	instance = undefined
})

describe('Log panel height budget', () => {
	it('renders every visible line while scrolled, even when the banner wraps on a narrow terminal', () => {
		setTheme('bifrost')

		const stdout = new NarrowStdout()

		const height = 5

		// Distinct short markers that survive truncation at this width.
		const lines = ['R0aa', 'R1bb', 'R2cc', 'R3dd', 'R4ee']

		instance = render(
			<Log lines={lines} height={height} startIndex={0} hiddenCount={7} atBottom={false} />,
			{
				stdout: stdout as unknown as NodeJS.WriteStream,
				stdin: new FakeStdin() as never,
				patchConsole: false,
			},
		)

		const frame = stripAnsi(stdout.lastFrame)

		// The scrolled banner is present (so the label row is doing double duty, the case that
		// used to force a wrap)...
		expect(frame).toContain('scrolled')

		// ...and every one of the five visible log rows still renders — none silently dropped by
		// an under-budgeted panel height.
		for (const line of lines) {
			expect(frame).toContain(line)
		}
	})
})
