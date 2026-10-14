import { describe, expect, it } from 'vitest';
import { type Line, lines, MAX_LINE_BYTES } from './lines';

async function* chunks(...parts: ReadonlyArray<string | Uint8Array>) {
	for (const part of parts) yield part;
}

async function collect(
	input: AsyncIterable<string | Uint8Array>,
	limit?: number,
): Promise<ReadonlyArray<Line>> {
	const out: Line[] = [];
	for await (const line of lines(input, limit)) out.push(line);
	return out;
}

describe('the lines of standard input', () => {
	it('are split on the newline, wherever the chunks fall', async () => {
		expect(await collect(chunks('a\nb', 'c\n', 'd'))).toEqual(['a', 'bc', 'd']);
		expect(await collect(chunks('one\ntwo\n'))).toEqual(['one', 'two']);
		expect(await collect(chunks('', '\n', 'x'))).toEqual(['', 'x']);
	});

	it('drop a carriage return before the newline', async () => {
		expect(await collect(chunks('a\r\nb\r\n'))).toEqual(['a', 'b']);
	});

	it('decode a character split across two chunks whole', async () => {
		const [first, second] = [Buffer.from([0xc3]), Buffer.from([0xa9, 0x0a])];
		expect(await collect(chunks('caf', first, second))).toEqual(['café']);
	});

	it('hand back a line over the limit as its length, and keep the lines after it', async () => {
		const over = await collect(
			chunks('x'.repeat(8), `${'y'.repeat(8)}\n`, 'ok\n'),
			10,
		);
		expect(over).toEqual([{ oversized: true, bytes: 16 }, 'ok']);
		// Far over, with the newline many chunks later: nothing of it is kept.
		const far = await collect(
			chunks(...Array(40).fill('z'.repeat(5)), '\n', 'after'),
			10,
		);
		expect(far).toEqual([{ oversized: true, bytes: 200 }, 'after']);
	});

	it('take a line exactly at the limit, and refuse one byte over', async () => {
		expect(await collect(chunks(`${'a'.repeat(10)}\n`), 10)).toEqual([
			'a'.repeat(10),
		]);
		expect(await collect(chunks(`${'a'.repeat(11)}\n`), 10)).toEqual([
			{ oversized: true, bytes: 11 },
		]);
	});

	it('count bytes, not characters', async () => {
		// Four two-byte characters are eight bytes.
		expect(await collect(chunks('éééé\n'), 7)).toEqual([
			{ oversized: true, bytes: 8 },
		]);
	});

	it('have a limit of sixteen mebibytes', () => {
		expect(MAX_LINE_BYTES).toBe(16 * 1024 * 1024);
	});
});
