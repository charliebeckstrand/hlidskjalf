import { useSyncExternalStore } from 'react'
import { spinnerClock } from '../ui/index.js'

/** The current frame of the shared spinner clock, re-rendering on each tick. */
export function useSpinnerFrame(): string {
	return useSyncExternalStore(spinnerClock.subscribe, spinnerClock.frame)
}
