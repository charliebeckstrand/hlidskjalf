import { describe, expect, it } from 'vitest'
import { createLineBuffer } from '../src/store/lines.js'

describe('createLineBuffer', () => {
	it('emits a complete line and retains the trailing partial', () => {
		const lb = createLineBuffer(1024)

		expect(lb.push('hello\nwor')).toEqual(['hello'])

		expect(lb.push('ld\n')).toEqual(['world'])
	})

	it('reassembles a line split across several chunks', () => {
		const lb = createLineBuffer(1024)

		expect(lb.push('abc')).toEqual([])

		expect(lb.push('def')).toEqual([])

		expect(lb.push('ghi\n')).toEqual(['abcdefghi'])
	})

	it('emits every complete line in a multi-line chunk, in order', () => {
		const lb = createLineBuffer(1024)

		expect(lb.push('one\ntwo\nthree\n')).toEqual(['one', 'two', 'three'])
	})

	it('right-trims each line and drops blank ones', () => {
		const lb = createLineBuffer(1024)

		// CRLF leaves a trailing \r; a blank line between entries is dropped.
		expect(lb.push('a  \r\n\r\nb\t\n')).toEqual(['a', 'b'])
	})

	it('flushes a newline-less run once it exceeds the cap, whole and untrimmed', () => {
		const lb = createLineBuffer(8)

		const flooded = lb.push('123456789   ')

		expect(flooded).toEqual(['123456789   '])

		// The buffer reset after flushing: a following newline yields only the new content.
		expect(lb.push('rest\n')).toEqual(['rest'])
	})

	it('does not trigger the overflow flush when the oversize buffer already holds a newline', () => {
		const lb = createLineBuffer(8)

		// Over the cap, but a newline is present — split normally rather than flush whole.
		expect(lb.push('hello world\nx')).toEqual(['hello world'])
	})

	it('flush emits a buffered partial line, right-trimmed', () => {
		const lb = createLineBuffer(1024)

		lb.push('tail end  ')

		expect(lb.flush()).toBe('tail end')
	})

	it('flush returns null when nothing but whitespace remains', () => {
		const lb = createLineBuffer(1024)

		expect(lb.flush()).toBeNull()

		lb.push('done\n   ')

		expect(lb.flush()).toBeNull()
	})

	it('flush clears the buffer so a later flush is empty', () => {
		const lb = createLineBuffer(1024)

		lb.push('leftover')

		expect(lb.flush()).toBe('leftover')

		expect(lb.flush()).toBeNull()
	})
})
