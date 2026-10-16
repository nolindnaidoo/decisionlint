import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { targetById } from '../lint/targets';
import { calibrationFile } from './calibration';
import { ROUTES, renderCutoffsPage } from './cutoffsPage';

const read = (path: string) =>
	JSON.parse(readFileSync(`fixtures/${path}`, 'utf8'));
const data = {
	corpus: read('corpus/questions.json'),
	requests: read('corpus/requests.json'),
	run: (file: string) => read(`validation/${file}`),
};

describe('docs/cutoffs.md', () => {
	it('is what the calibration runs would write now', () => {
		// Run `bun run docs:cutoffs` after a calibration run or a cutoff change.
		expect(readFileSync('docs/cutoffs.md', 'utf8')).toBe(
			renderCutoffsPage(data),
		);
	});

	it('lists every calibration run kept, and every route it lists has a run', () => {
		const kept = readdirSync('fixtures/validation')
			.filter((name) => /^calibration.*\.json$/.test(name))
			.sort();
		const listed = ROUTES.map((route) =>
			calibrationFile(route.slot, route.model),
		).sort();
		expect(listed).toEqual(kept);
	});
});

describe("the README's tested section", () => {
	const readme = readFileSync('README.md', 'utf8');
	const start = readme.indexOf('## Where it has been tested');
	const section = readme.slice(start, readme.indexOf('\n## ', start + 1));

	it('links the cutoffs page', () => {
		expect(start).toBeGreaterThan(-1);
		expect(section).toContain('(docs/cutoffs.md)');
	});

	it.each(ROUTES.map((route) => [route.slot, route.model]))(
		'names %s with %s',
		(slot, model) => {
			expect(section).toContain(targetById(slot)?.name);
			expect(section).toContain(`\`${model}\``);
		},
	);
});
