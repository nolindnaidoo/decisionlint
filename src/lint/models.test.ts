import { describe, expect, it } from 'vitest';
import {
	isFloatingJev,
	isNewerJev,
	parseModelId,
	pinnedSpelling,
} from './models';

describe('parseModelId', () => {
	it.each([
		['jev-1.13.0', { prefix: '', family: 'jev', version: [1, 13, 0] }],
		['jev-latest', { prefix: '', family: 'jev', alias: 'latest' }],
		['jev-preview', { prefix: '', family: 'jev', alias: 'preview' }],
		['typesafe/jev-1.13', { prefix: 'typesafe/', version: [1, 13] }],
		['~typesafe/jev-latest', { prefix: '~typesafe/', alias: 'latest' }],
		['typesafe-ai/jev', { prefix: 'typesafe-ai/', family: 'jev' }],
		['gpt-6-luna', { prefix: '', family: 'luna', decisions: false }],
		['openai/gpt-6-luna', { prefix: 'openai/', family: 'luna' }],
		['gpt-6-luna-decisions', { family: 'luna', decisions: true }],
		[
			'openai/gpt-6-luna-decisions-20261006',
			{ prefix: 'openai/', decisions: true, snapshot: '20261006' },
		],
		['d1', { family: 'd1', tier: undefined }],
		['d1:free', { family: 'd1', tier: 'free' }],
		['microsoft-decision-1', { family: 'decision-1' }],
		[
			'typesafe/jev-1.13-20260917',
			{ prefix: 'typesafe/', version: [1, 13], snapshot: '20260917' },
		],
	])('reads %s', (value, parts) => {
		expect(parseModelId(value)).toMatchObject(parts);
	});

	it.each([
		'jev-latest-2.0.0',
		'jev-2.0.0-preview',
		'jev-1',
		'jevlint',
		'ZefanCai/Open-Jev-9B',
		'laya:en',
		'strands_decider/strands-decider-2B-hobson-v19',
		'my-jev-deployment',
		'',
	])('reads nothing from %s', (value) => {
		expect(parseModelId(value)).toBeUndefined();
	});
});

describe('isFloatingJev', () => {
	it.each([
		'jev-latest',
		'jev-preview',
		'~typesafe/jev-latest',
		'typesafe/jev-preview',
	])('is true for %s', (value) => {
		expect(isFloatingJev(value)).toBe(true);
	});

	it.each([
		'jev-1.13.0',
		'typesafe/jev-1.13',
		'typesafe-ai/jev',
		'gpt-6-luna',
		'laya',
	])('is false for %s', (value) => {
		expect(isFloatingJev(value)).toBe(false);
	});
});

describe('isNewerJev', () => {
	it.each([
		['jev-1.13.1', true],
		['jev-2.0.0', true],
		['typesafe/jev-2.0', true],
		['typesafe/jev-1.14', true],
		['typesafe/jev-1.13', false],
		['jev-1.13.0', false],
		['jev-1.12.9', false],
		['jev-latest', false],
		['~typesafe/jev-latest', false],
		['gpt-6-luna-decisions-20261006', false],
		['typesafe-ai/jev', false],
	])('%s above jev-1.13.0 is %s', (value, newer) => {
		expect(isNewerJev(value, 'jev-1.13.0')).toBe(newer);
	});
});

describe('pinnedSpelling', () => {
	it('pins a bare alias to the bare versioned id', () => {
		expect(pinnedSpelling('jev-latest', 'jev-1.13.0')).toBe('jev-1.13.0');
		expect(pinnedSpelling('jev-preview', 'jev-1.13.0')).toBe('jev-1.13.0');
	});

	it("pins OpenRouter's tilde alias as OpenRouter writes a pinned id", () => {
		expect(pinnedSpelling('~typesafe/jev-latest', 'jev-1.13.0')).toBe(
			'typesafe/jev-1.13',
		);
	});

	it.each([
		'typesafe/jev-latest',
		'other/jev-latest',
		'jev-1.13.0',
		'gpt-6-luna',
	])(
		'offers nothing for %s, whose pinned spelling no platform documents',
		(value) => {
			expect(pinnedSpelling(value, 'jev-1.13.0')).toBeUndefined();
		},
	);
});
