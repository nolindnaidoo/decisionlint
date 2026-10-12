import { describe, expect, it } from 'vitest';
import { KNOWN_VERSION } from '../lint/limits';
import { checkRelease, readAliases } from './released';

// The alias table as docs.typesafe.ai/models.md served it on 2026-10-12.
const page = (latest: string, preview: string) => `## Aliases

| Alias | Points to | Meaning |
| :- | :- | :- |
| \`jev-latest\` | \`${latest}\` | The most recent stable, official release. |
| \`jev-preview\` | \`${preview}\` | The most recent release, whether or not it is an official one. |

Versioned IDs such as \`jev-1.13.0\` are accepted by the \`model\` field.
`;

describe('readAliases', () => {
	it('reads what each alias points to', () => {
		expect([...readAliases(page('jev-1.13.0', 'jev-1.14.0'))]).toEqual([
			['jev-latest', 'jev-1.13.0'],
			['jev-preview', 'jev-1.14.0'],
		]);
	});

	it('reads nothing from a row that is not an alias', () => {
		expect(
			readAliases('| `jev-other` | `jev-1.13.0` | Not an alias. |').size,
		).toBe(0);
	});
});

describe('checkRelease', () => {
	it('passes while jev-latest points to the known version', () => {
		expect(checkRelease(page(KNOWN_VERSION, KNOWN_VERSION))).toEqual({
			failures: [],
			warnings: [],
		});
	});

	it('fails when jev-latest has moved', () => {
		const { failures } = checkRelease(page('jev-9.0.0', 'jev-9.0.0'));
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('jev-latest points to jev-9.0.0');
	});

	it('fails when the page no longer holds the alias table', () => {
		const { failures } = checkRelease('# Models\n\nMoved.');
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('no longer says what jev-latest points to');
	});

	it('warns, without failing, when a preview build is ahead', () => {
		expect(checkRelease(page(KNOWN_VERSION, 'jev-9.0.0'))).toEqual({
			failures: [],
			warnings: ['jev-preview points to jev-9.0.0, ahead of jev-latest.'],
		});
	});
});
