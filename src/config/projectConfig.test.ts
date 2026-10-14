import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TARGET_IDS } from '../lint/targets';
import {
	CONFIG_FILE,
	CONFIG_KEYS,
	createConfigLoader,
	isExcluded,
	LEVEL_ALIASES,
	LEVELS,
	OLD_CONFIG_FILE,
	parseConfig,
	readLintOptions,
	readRule,
	readRules,
} from './projectConfig';

const disk = (tree: Record<string, string>) => {
	const reads: string[] = [];
	return {
		reads,
		fs: {
			isFile: (path: string) => path in tree,
			read: (path: string) => {
				reads.push(path);
				return tree[path] ?? '';
			},
		},
	};
};
const OFF = '{ "rules": { "DEC004": "off" } }';

describe('a project settings file', () => {
	it('holds rules, fallback options, what to ignore and which files to leave out', () => {
		expect(
			parseConfig(
				'{ "rules": { "DEC004": "error" }, "fallbackOptions": ["else"], "ignore": ["DEC112:big"], "exclude": ["fixtures"] }',
			),
		).toEqual({
			rules: { DEC004: 'error' },
			fallbackOptions: ['else'],
			ignore: ['DEC112:big'],
			exclude: ['fixtures'],
		});
	});

	it.each([
		['{ "rule": {} }', "'rule' is not a setting"],
		['{ "rules": { "DEC999": "off" } }', "'DEC999' is not a rule code"],
		['{ "rules": { "DEC004": "loud" } }', "'loud' is not a level"],
		['{ "ignore": "DEC004:team" }', "'ignore' must be a list of strings"],
		['{ "exclude": "fixtures" }', "'exclude' must be a list of strings"],
		['{ "target": "jay" }', "'target' must be one of typesafe, openai"],
		['{ "target": ["litellm"] }', "'target' must be one of"],
		['[]', 'it must hold a JSON object'],
		['{', 'it is not valid JSON'],
	])('is refused when it reads %s', (text, reason) => {
		expect(parseConfig(text)).toContain(reason);
	});

	it("names the platform every request goes to, and leaves it out when it is the editor's empty string", () => {
		expect(parseConfig('{ "target": "litellm" }')).toMatchObject({
			target: 'litellm',
		});
		expect(readLintOptions({ target: '' })).not.toHaveProperty('target');
	});

	it('reads the codes and names rules had before 1.0.0, and reports the spelling it was given', () => {
		expect(readRule('JEV004=off')).toEqual(['DEC004', 'off']);
		expect(readRule('jev-counting=warning')).toEqual(['DEC301', 'warning']);
		expect(readRule('JEV999=off')).toBe(
			"'JEV999' is not a rule code or a rule name.",
		);
		expect(readRules({ JEV001: 'off', 'jev-counting': 'off' })).toEqual({
			DEC001: 'off',
			DEC301: 'off',
		});
	});

	it('is described by a schema with the same keys, levels and targets', () => {
		const schema = JSON.parse(
			readFileSync('schemas/config.schema.json', 'utf8'),
		);
		expect(Object.keys(schema.properties)).toEqual(CONFIG_KEYS);
		expect(schema.properties.target.enum).toEqual(TARGET_IDS);
		const manifestTargets = JSON.parse(readFileSync('package.json', 'utf8'))
			.contributes.configuration.properties['decisionlint.target'].enum;
		expect(manifestTargets).toEqual(['', ...TARGET_IDS]);
		expect(schema.properties.rules.additionalProperties.enum).toEqual([
			...LEVELS,
			...LEVEL_ALIASES.keys(),
		]);
		const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
		const matched = manifest.contributes.jsonValidation.flatMap(
			(entry: { fileMatch: string[] }) => entry.fileMatch,
		);
		expect(matched).toContain(CONFIG_FILE);
	});
});

describe('finding the file that applies', () => {
	it('takes the nearest one, looking up from the file', () => {
		const { fs } = disk({
			'decisionlint.json': '{}',
			'app/decisionlint.json': OFF,
		});
		const loader = createConfigLoader(fs);
		expect(loader.for('app/src/q.ts')?.path).toBe('app/decisionlint.json');
		expect(loader.for('lib/q.ts')?.path).toBe('decisionlint.json');
		expect(loader.for('q.ts')?.path).toBe('decisionlint.json');
	});

	it('finds none when there is none', () => {
		expect(createConfigLoader(disk({}).fs).for('app/src/q.ts')).toBeUndefined();
	});

	it("reads the file under the tool's old name where the new one is absent, and the new one first", () => {
		const { fs } = disk({
			'jevlint-le.json': OFF,
			'app/jevlint-le.json': OFF,
			'app/decisionlint.json': '{}',
		});
		const loader = createConfigLoader(fs);
		expect(loader.for('lib/q.ts')?.path).toBe('jevlint-le.json');
		expect(loader.for('app/q.ts')?.path).toBe('app/decisionlint.json');
		expect(OLD_CONFIG_FILE).toBe('jevlint-le.json');
	});

	it('looks no higher than the boundary it is given', () => {
		const { fs } = disk({ '/home/decisionlint.json': OFF });
		const loader = createConfigLoader(fs);
		expect(loader.for('/home/work/app/q.ts', '/home/work')).toBeUndefined();
		expect(loader.for('/home/work/app/q.ts', '/home')?.path).toBe(
			'/home/decisionlint.json',
		);
		expect(loader.for('/home/work/app/q.ts')?.path).toBe(
			'/home/decisionlint.json',
		);
	});

	it('keeps the separators the path came with, whatever the platform', () => {
		const windows = createConfigLoader(
			disk({ 'C:\\work\\decisionlint.json': OFF }).fs,
		);
		expect(windows.for('C:\\work\\app\\q.ts')?.path).toBe(
			'C:\\work\\decisionlint.json',
		);
		const forward = createConfigLoader(
			disk({ 'work/decisionlint.json': OFF }).fs,
		);
		expect(forward.for('work/app/q.ts')?.path).toBe('work/decisionlint.json');
	});

	it('reads a file once until told it changed', () => {
		const { fs, reads } = disk({ 'decisionlint.json': OFF });
		const loader = createConfigLoader(fs);
		loader.for('a.ts');
		loader.for('b.ts');
		expect(reads).toHaveLength(1);
		loader.clear();
		loader.for('a.ts');
		expect(reads).toHaveLength(2);
	});

	it('hands back what is wrong with a file it cannot use', () => {
		const loader = createConfigLoader(
			disk({ 'decisionlint.json': '{ "rule": {} }' }).fs,
		);
		expect(loader.for('a.ts')).toMatchObject({
			path: 'decisionlint.json',
			options: expect.stringContaining("'rule' is not a setting"),
		});
	});
});

describe('a settings file that cannot be read', () => {
	it('is a file that cannot be used, not a crash', () => {
		const loader = createConfigLoader({
			isFile: (path) => path === '/work/decisionlint.json',
			read: () => {
				throw new Error('EACCES: permission denied');
			},
		});
		expect(loader.for('/work/src/q.ts')?.options).toBe('it could not be read.');
	});
});

describe('exclude', () => {
	it.each([
		['fixtures', 'fixtures/a.json', true],
		['fixtures', 'src/fixtures/deep/a.json', true],
		['fixtures', 'src/fixtures.json', false],
		['fixtures/', 'fixtures/a.json', true],
		['*.generated.ts', 'src/api.generated.ts', true],
		['*.generated.ts', 'src/api.ts', false],
		['test/data/**', 'test/data/a/b.json', true],
		['test/data/**', 'src/test/data/a.json', false],
		['test/*.json', 'test/a.json', true],
		['test/*.json', 'test/deep/a.json', false],
		['**/snapshots/*.json', 'a/b/snapshots/x.json', true],
		['./src/old', 'src/old/q.ts', true],
		['a.b', 'axb', false],
		['q?.json', 'q1.json', true],
		['q?.json', 'q12.json', false],
	])('%s on %s is %s', (pattern, path, excluded) => {
		expect(isExcluded([pattern], '.', path)).toBe(excluded);
	});

	it('is relative to the folder the settings file is in', () => {
		expect(
			isExcluded(['fixtures'], 'packages/api', 'packages/api/fixtures/a.json'),
		).toBe(true);
		expect(
			isExcluded(['/fixtures'], 'packages/api', 'packages/web/fixtures/a.json'),
		).toBe(false);
		expect(
			isExcluded(
				['fixtures'],
				'C:\\work\\app',
				'C:\\work\\app\\fixtures\\a.json',
			),
		).toBe(true);
	});

	it('leaves nothing out when there are no patterns', () => {
		expect(isExcluded(undefined, '.', 'a.json')).toBe(false);
		expect(isExcluded([], '.', 'a.json')).toBe(false);
	});
});
