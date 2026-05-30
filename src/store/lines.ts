/**
 * Reassemble a child's stdout/stderr byte stream into whole lines. A `data` event
 * delivers an arbitrary chunk — it may split a line mid-way or carry several at once —
 * so a partial line is held back until its newline arrives in a later chunk. Kept pure
 * (no store, no I/O) so the buffering edge cases can be unit-tested and the per-chunk
 * hot path benchmarked without spawning a process; spawn.ts owns the one instance per
 * child and forwards each emitted line to the parser/log pipeline.
 */

export interface LineBuffer {
	/**
	 * Feed one stream chunk; return the complete lines it completes, in order, each
	 * right-trimmed with blank lines dropped. A trailing partial line is retained for the
	 * next chunk. A newline-less chunk that pushes the buffer past `maxBufferSize` is
	 * flushed whole as a single line, so a server that never emits a newline can't buffer
	 * without bound.
	 */
	push(chunk: string): string[]
	/** Emit any buffered partial line at stream close, or null when only whitespace remains. */
	flush(): string | null
}

/** Create a line buffer that flushes an unterminated run once it exceeds `maxBufferSize`. */
export function createLineBuffer(maxBufferSize: number): LineBuffer {
	let buffer = ''

	return {
		push(chunk) {
			buffer += chunk

			// A newline-less flood: emit the whole buffer as one line rather than grow it
			// without bound. Emitted as-is (no right-trim) — there's no line break to
			// normalize, and downstream still caps it at MAX_LINE_LENGTH. The length test
			// comes first so the common (under-cap) chunk short-circuits without a newline
			// scan that the split below would only repeat.
			if (buffer.length > maxBufferSize && !buffer.includes('\n')) {
				const line = buffer

				buffer = ''

				return [line]
			}

			const lines = buffer.split('\n')

			// The last element is the run after the final newline — a partial line until its
			// own newline arrives, so hold it back.
			buffer = lines.pop() ?? ''

			const out: string[] = []

			for (const raw of lines) {
				const line = raw.trimEnd()

				if (line) out.push(line)
			}

			return out
		},
		flush() {
			const rest = buffer.trim() ? buffer.trimEnd() : null

			buffer = ''

			return rest
		},
	}
}
