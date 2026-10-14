/**
 * Standard input as lines, for the server. Node's readline keeps a line in
 * memory until its newline arrives, however long it grows, so one frame with
 * no newline could take the process with it. Here a line past the limit is
 * dropped as it arrives and handed on as its length, for the protocol error.
 */

/** A request frame may be this long. Far above any real call, which holds a file of at most a million bytes. */
export const MAX_LINE_BYTES = 16 * 1024 * 1024;

export type Oversized = Readonly<{ oversized: true; bytes: number }>;
export type Line = string | Oversized;

const NEWLINE = 0x0a;

// Without the trailing carriage return of a CRLF line.
function text(parts: ReadonlyArray<Buffer>): string {
	const line = Buffer.concat(parts).toString('utf8');
	return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/**
 * Splits a byte stream on newlines. A line is decoded only once it is whole,
 * so a character split across two chunks is read as one. A line longer than
 * `limit` bytes is yielded as `{ oversized, bytes }` in place of its text.
 */
export async function* lines(
	input: AsyncIterable<Uint8Array | string>,
	limit = MAX_LINE_BYTES,
): AsyncGenerator<Line> {
	let pending: Buffer[] = [];
	let held = 0;
	// Bytes of the current line dropped for being past the limit, if any.
	let dropped = 0;
	const flush = (): Line => {
		const line: Line =
			dropped > 0 ? { oversized: true, bytes: dropped + held } : text(pending);
		pending = [];
		held = 0;
		dropped = 0;
		return line;
	};
	const take = (bytes: Buffer): void => {
		if (dropped > 0 || held + bytes.length > limit) {
			dropped += bytes.length;
			return;
		}
		pending.push(bytes);
		held += bytes.length;
	};
	for await (const chunk of input) {
		let rest = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		for (
			let at = rest.indexOf(NEWLINE);
			at !== -1;
			at = rest.indexOf(NEWLINE)
		) {
			take(rest.subarray(0, at));
			yield flush();
			rest = rest.subarray(at + 1);
		}
		take(rest);
	}
	// A last line with no newline after it, as readline would also hand on.
	if (held > 0 || dropped > 0) yield flush();
}
