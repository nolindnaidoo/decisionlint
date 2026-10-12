import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL } from './review';

const VERSIONED = /jev-\d+\.\d+\.\d+/g;
const read = (path: string) => readFileSync(path, 'utf8');

/**
 * `DEFAULT_MODEL` is the version the cutoffs were set on, and it is written
 * out again wherever TypeScript cannot import it. `KNOWN_VERSION` is left out
 * on purpose: it is what `jev-latest` points to, which is ahead of the
 * calibrated version from a Jev release until the cutoffs are set again.
 */
describe('the pinned model', () => {
	it('is the default of the editor setting', () => {
		const manifest = JSON.parse(read('package.json'));
		expect(
			manifest.contributes.configuration.properties['jevlint-le.jev.model']
				.default,
		).toBe(DEFAULT_MODEL);
	});

	it.each(['README.md', 'npm/README.md'])(
		'is the only Jev version %s names',
		(path) => {
			const named = new Set(read(path).match(VERSIONED));
			expect([...named]).toEqual([DEFAULT_MODEL]);
		},
	);

	// SPEC.md also records past runs by the version they were made on, so only
	// the lines that state the default are held to it.
	it.each(['| `jevlint-le.jev.model` |', '**The model is pinned** to'])(
		'is the version SPEC.md gives on the line starting %s',
		(start) => {
			const lines = read('SPEC.md')
				.split('\n')
				.filter((line) => line.startsWith(start));
			expect(lines).toHaveLength(1);
			expect(lines[0]?.match(VERSIONED)).toEqual([DEFAULT_MODEL]);
		},
	);

	it('is typed out in no source file but the one that defines it', () => {
		for (const path of [
			'src/commands/jev.ts',
			'scripts/validate-defects.ts',
			'scripts/calibrate-reviews.ts',
		])
			expect(read(path).match(VERSIONED), path).toBeNull();
	});
});
