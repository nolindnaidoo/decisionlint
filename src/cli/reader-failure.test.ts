import { describe, expect, it, vi } from 'vitest';
import type { Fetch } from '../jev/client';
import { EXIT, type Io, run } from './run';

// No real text is known to make a reader throw, so one is made to here. The
// guard exists for the one nobody has found yet.
vi.mock('../lint/lint', async (original) => {
	const real = await original<typeof import('../lint/lint')>();
	return {
		...real,
		lintText: (text: string, ...rest: []) => {
			if (text.includes('POISON')) throw new RangeError('reader failed');
			return real.lintText(text, ...rest);
		},
	};
});

const BAD = `{ "questions": { "team": { "type": "choice", "instructions": "Which team takes it?", "criteria": { "billing": "Charges", "technical": "Faults" } } } }`;

async function cli(args: string[], tree: Record<string, string>, stdin = '') {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = {
		files: {
			stat: (path) =>
				path === '.'
					? { kind: 'dir', size: 0 }
					: tree[path] === undefined
						? undefined
						: { kind: 'file', size: 1 },
			list: () => Object.keys(tree),
			read: (path) => tree[path] ?? '',
			write: () => {},
		},
		stdin: async () => '',
		lines: async function* () {
			yield* stdin.split('\n');
		},
		out: (text) => out.push(text),
		err: (text) => err.push(text),
		version: '0',
		env: {},
		terminal: false,
		fetch: (async () => {
			throw new Error('offline');
		}) as unknown as Fetch,
		wait: async () => {},
		stopSignal: () => new AbortController().signal,
	};
	const status = await run(args, io);
	return { status, out: out.join(''), err: err.join('') };
}

describe('a file the reader fails on', () => {
	it('is named, and does not take the other files with it', async () => {
		const result = await cli(['.'], { 'a.json': BAD, 'b.json': 'POISON' });
		expect(result.out).toContain('JEV004');
		expect(result.out).toContain('1 path could not be read: b.json.');
		expect(result.status).toBe(EXIT.passed);
	});

	it('fails the run when it was the only file, because nothing was linted', async () => {
		const result = await cli(['.'], { 'b.json': 'POISON' });
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toBe(
			'jevlint-le: No files could be linted. Not readable: b.json.\n',
		);
		expect(result.out).toBe('');
	});

	it('is a failed call on the server when it was the only file', async () => {
		const result = await cli(
			['--mcp'],
			{ 'b.json': 'POISON' },
			JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'lint_paths', arguments: { paths: ['.'] } },
			}),
		);
		const [reply] = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toBe(
			'No files could be linted. Not readable: b.json.',
		);
	});
});
