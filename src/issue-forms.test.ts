import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXTENSIONS } from './lint/lint';
import { RULE_CODES } from './lint/rules';
import type { Syntax } from './types';

/**
 * The issue forms under `.github/ISSUE_TEMPLATE/` ask for the three things a
 * report about a finding needs: the question, its language and the rule
 * code. Two of those are dropdowns, and a dropdown that falls behind the
 * registry offers a reporter the wrong list with no error anywhere. GitHub
 * also applies a form's labels only where the repository has them, and says
 * nothing when it does not. This holds each list to its source.
 */
const DIR = '.github/ISSUE_TEMPLATE';
const forms = readdirSync(DIR).filter(
	(name) => name.endsWith('.yml') && name !== 'config.yml',
);
const read = (name: string) => readFileSync(`${DIR}/${name}`, 'utf8');

// The labels the repository has, as of 2026-10-24. Add one here when it is added there.
const LABELS: ReadonlySet<string> = new Set([
	'bug',
	'enhancement',
	'documentation',
	'question',
	'measurement',
	'blocked',
	'area:reader',
	'area:rules',
	'area:ask',
	'area:cli',
	'area:editor',
	'area:mcp',
	'area:repo',
]);

// What the forms call each syntax the tool reads. The JavaScript reader reads three.
const NAMES: Readonly<Record<Syntax, ReadonlyArray<string>>> = {
	js: ['JSON', 'JavaScript', 'TypeScript'],
	python: ['Python'],
	rust: ['Rust'],
	go: ['Go'],
};

// The options under the dropdown with this id.
function options(text: string, id: string): string[] {
	const at = text.indexOf(`id: ${id}\n`);
	if (at === -1) return [];
	const lines = text.slice(at).split('\n');
	// This field only: an input with the same id has no options of its own.
	const next = lines.findIndex(
		(line, index) => index > 0 && /^\s+- type:/.test(line),
	);
	const field = next === -1 ? lines : lines.slice(0, next);
	const start = field.findIndex((line) => line.trim() === 'options:');
	if (start === -1) return [];
	const list: string[] = [];
	for (const line of field.slice(start + 1)) {
		const match = /^\s+- (.+)$/.exec(line);
		if (!match) break;
		list.push(match[1] as string);
	}
	return list;
}

describe('issue forms', () => {
	it.each(forms)(
		'%s has a name, a description, a body, and only labels the repository has',
		(name) => {
			const text = read(name);
			expect(text).toMatch(/^name: /m);
			expect(text).toMatch(/^description: /m);
			expect(text).toMatch(/^body:\n/m);
			const labels = (/^labels: \[(.*)\]$/m.exec(text)?.[1] ?? '')
				.split(',')
				.map((label) => label.trim().replace(/^"|"$/g, ''))
				.filter(Boolean);
			expect(labels.length).toBeGreaterThan(0);
			for (const label of labels) expect(LABELS.has(label), label).toBe(true);
		},
	);

	it('offers every rule code, and only those, on the wrong-finding form', () => {
		expect(options(read('false_positive.yml'), 'rule')).toEqual([
			...RULE_CODES,
		]);
	});

	it('offers one name for every syntax the tool reads, the same on every form that asks', () => {
		expect(Object.keys(NAMES).sort()).toEqual(
			[...new Set(EXTENSIONS.values())].sort(),
		);
		const asked = forms
			.map((name) => options(read(name), 'language'))
			.filter((list) => list.length);
		expect(asked.length).toBe(2);
		for (const list of asked) expect(list).toEqual(Object.values(NAMES).flat());
	});

	it('keeps blank issues on and links the rule pages', () => {
		const config = read('config.yml');
		expect(config).toContain('blank_issues_enabled: true');
		expect(config).toContain('docs/rules/README.md');
	});

	it('has a pull request template that names the gates', () => {
		expect(readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8')).toContain(
			'bun run typecheck && bun run lint && bun run test',
		);
	});
});
