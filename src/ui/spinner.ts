import { every } from './timers.js'

/** Braille "dots" spinner frames, as in cli-spinners' `dots`. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

const SPINNER_INTERVAL_MS = 80

export interface SpinnerClock {
	/** Receive a call on every frame; the returned function unsubscribes. */
	subscribe(listener: () => void): () => void
	/** The current frame's glyph. */
	frame(): string
}

/**
 * A shared animation clock for every spinner on screen: one interval, running only while
 * something subscribes. A per-spinner timer would give each building row its own re-render
 * source; sharing one also keeps every spinner on the same frame.
 */
export function createSpinnerClock(intervalMs = SPINNER_INTERVAL_MS): SpinnerClock {
	const listeners = new Set<() => void>()

	let index = 0

	let stop: (() => void) | null = null

	return {
		subscribe(listener) {
			listeners.add(listener)

			stop ??= every(intervalMs, () => {
				index = (index + 1) % SPINNER_FRAMES.length

				for (const l of listeners) l()
			})

			return () => {
				listeners.delete(listener)

				if (listeners.size === 0) {
					stop?.()

					stop = null
				}
			}
		},
		frame: () => SPINNER_FRAMES[index] as string,
	}
}

/** The clock every on-screen spinner shares. */
export const spinnerClock = createSpinnerClock()
