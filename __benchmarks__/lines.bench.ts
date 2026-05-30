import { Bench } from 'tinybench'

import { MAX_BUFFER_SIZE } from '../src/store/constants.js'
import { createLineBuffer } from '../src/store/lines.js'
import { LOG_LINES, makeChunk } from './fixtures.js'

/**
 * createLineBuffer reassembles every stdout/stderr `data` event from every child into
 * whole lines — the entry point of the per-line pipeline, ahead of sanitize/strip/parse.
 * The cases cover the dominant shapes a `data` event takes: a single complete line, a
 * burst of many lines in one chunk, a line dribbling in across chunks, and the
 * newline-less overflow flush. Each case leaves the buffer empty so successive
 * iterations stay comparable.
 */
export function linesSuite(): Bench {
	const bench = new Bench({ name: 'lines — stdout chunk reassembly', time: 500 })

	const single = `${LOG_LINES.plain}\n`

	const burst = makeChunk(50)

	// A newline-less run just past the cap, to exercise the overflow flush each iteration.
	const flood = 'x'.repeat(MAX_BUFFER_SIZE + 1)

	// One buffer per case, hoisted out of the measured call so each case times push, not
	// construction. Every case leaves the buffer empty, so reuse stays comparable run to run.
	const lbSingle = createLineBuffer(MAX_BUFFER_SIZE)

	const lbBurst = createLineBuffer(MAX_BUFFER_SIZE)

	const lbSplit = createLineBuffer(MAX_BUFFER_SIZE)

	const lbFlood = createLineBuffer(MAX_BUFFER_SIZE)

	bench
		.add('push: one complete line per chunk', () => {
			lbSingle.push(single)
		})
		.add('push: 50-line burst in one chunk', () => {
			lbBurst.push(burst)
		})
		.add('push: line split across three chunks', () => {
			lbSplit.push('info: server ')

			lbSplit.push('listening on ')

			lbSplit.push('http://localhost:3000\n')
		})
		.add('push: newline-less overflow flush', () => {
			lbFlood.push(flood)
		})

	return bench
}
