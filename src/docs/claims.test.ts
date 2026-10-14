import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '../cli/mcp';

const read = (path: string) => readFileSync(path, 'utf8');
const manifest = JSON.parse(read('package.json'));
const version: string = manifest.version;

const COUNT = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
];

/** The lines of a document from `heading` up to the next heading. */
function section(text: string, heading: string): string {
	const lines = text.split('\n');
	const start = lines.findIndex((line) => line === heading);
	if (start === -1) throw new Error(`no heading ${heading}`);
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith('#'));
	return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

/** The first column of a table whose header starts with `| ${first} |`, without the backticks. */
function column(text: string, first: string): ReadonlyArray<string> {
	const lines = text.split('\n');
	const header = lines.findIndex((line) => line.startsWith(`| ${first} |`));
	if (header === -1) throw new Error(`no table headed ${first}`);
	const rows: string[] = [];
	for (const line of lines.slice(header + 2)) {
		const cell = /^\| `([^`]+)` \|/.exec(line);
		if (!cell?.[1]) break;
		rows.push(cell[1]);
	}
	return rows;
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return entry.name.endsWith('.ts') ? [path] : [];
	});
}

/**
 * Sentences the documents state about the code, each held to the code. A
 * claim that drifted once was found in each of these places, so each is
 * read by a test rather than by the next reader.
 */
describe('what the documents claim', () => {
	it('is the version the changelog opens with, dated', () => {
		const heading = read('CHANGELOG.md')
			.split('\n')
			.find((line) => line.startsWith('## '));
		expect(heading).toMatch(
			new RegExp(
				`^## ${version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`,
			),
		);
	});

	it.each([
		['README.md', '## Settings'],
		['SPEC.md', '### Settings'],
	])(
		'%s lists every setting the manifest declares, and no other',
		(path, heading) => {
			const listed = column(section(read(path), heading), 'Setting');
			expect([...listed].sort()).toEqual(
				Object.keys(manifest.contributes.configuration.properties).sort(),
			);
		},
	);

	it.each(['npm/README.md', 'mcp/README.md'])(
		'%s lists every tool the server offers, and no other',
		(path) => {
			expect([...column(read(path), 'Tool')].sort()).toEqual(
				[...TOOL_NAMES].sort(),
			);
		},
	);

	it('counts the tools the same everywhere they are counted', () => {
		const word = COUNT[TOOL_NAMES.length];
		expect(read('README.md')).toContain(`It offers ${word} tools.`);
		expect(read('mcp/README.md')).toContain(
			`as ${word} tools an agent can call`,
		);
		expect(read('AGENTS.md')).toContain(`the MCP server: ${word} tools`);
	});

	it('pins every example in the README to this release', () => {
		const pins = [
			...read('README.md').matchAll(/(?:@|rev: )v(\d+\.\d+\.\d+)/g),
		];
		expect(pins.length).toBeGreaterThan(0);
		for (const [, pinned] of pins) expect(pinned).toBe(version);
	});

	it('names only test files that exist', () => {
		// `basename`, not a slice at '/': the walk joins with the platform's separator.
		const existing = new Set(
			[...sourceFiles('src'), ...sourceFiles('test')].map((path) =>
				basename(path),
			),
		);
		const named = [
			...sourceFiles('src').filter((path) => !path.endsWith('.test.ts')),
			'AGENTS.md',
			'SPEC.md',
			'README.md',
		].flatMap((path) =>
			[...read(path).matchAll(/`([a-zA-Z0-9-]+\.test\.ts)`/g)].map(
				(match) => [path, match[1] ?? ''] as const,
			),
		);
		expect(named.length).toBeGreaterThan(0);
		for (const [path, name] of named)
			expect(existing, `${path} names ${name}`).toContain(name);
	});
});
