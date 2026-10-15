import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/` is outside `tsc`'s `include` and outside vitest's, and both are
 * the family's files, so nothing in `bun run typecheck` or `bun run test`
 * loads a script. The move from `src/jev/` to `src/ask/` left four scripts
 * importing a directory that no longer existed, among them the one the weekly
 * `Jev release` workflow runs, and every gate stayed green. This resolves
 * each relative import the way the runtime would, so a renamed module fails
 * here and not on a Monday morning in CI.
 */
const SCRIPTS = resolve(__dirname, '..', 'scripts');
const SPECIFIER = /\b(?:from|require\()\s*'(\.\.?\/[^']+)'/g;
const EXTENSIONS = ['', '.ts', '.js', '.mjs', '/index.ts', '/index.js'];

const scripts = readdirSync(SCRIPTS).filter((name) =>
	/\.(ts|js|mjs)$/.test(name),
);

function resolves(from: string, specifier: string): boolean {
	const base = resolve(dirname(from), specifier);
	return EXTENSIONS.some((extension) => existsSync(base + extension));
}

describe('the scripts', () => {
	it('finds the scripts', () => {
		expect(scripts.length).toBeGreaterThan(0);
	});

	it.each(scripts)('%s imports only modules that exist', (name) => {
		const path = resolve(SCRIPTS, name);
		const source = readFileSync(path, 'utf8');
		const specifiers = [...source.matchAll(SPECIFIER)].map(
			(match) => match[1] ?? '',
		);
		const missing = specifiers.filter(
			(specifier) => !resolves(path, specifier),
		);
		expect(missing).toEqual([]);
	});
});
