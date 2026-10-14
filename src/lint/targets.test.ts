import { describe, expect, it } from 'vitest';
import { LIMITS } from './limits';
import {
	limitsFor,
	TARGET_IDS,
	TARGETS,
	targetById,
	targetOfModel,
} from './targets';

describe('the target table', () => {
	it('gives every platform one id, a page and a date', () => {
		expect(new Set(TARGET_IDS).size).toBe(TARGETS.length);
		for (const target of TARGETS) {
			expect(target.docs, target.id).toMatch(/^https:\/\//);
			expect(target.verifiedOn, target.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(target.shapes.length, target.id).toBeGreaterThan(0);
			expect(targetById(target.id)).toBe(target);
		}
	});

	it('holds TypeSafe to the numbers in limits.ts, which carry their page', () => {
		expect(targetById('typesafe')?.limits).toEqual({
			choiceMaxOptions: LIMITS.choiceMaxOptions,
			scoreMaxLevels: LIMITS.scoreMaxLevels,
		});
	});

	it('states no limit for OpenAI, which publishes none', () => {
		expect(targetById('openai')?.limits).toEqual({});
	});

	it('answers no target for an id the table does not have', () => {
		expect(targetById('jay')).toBeUndefined();
		expect(targetById('constructor')).toBeUndefined();
	});
});

describe('targetOfModel', () => {
	it.each([
		['~typesafe/jev-latest', 'openrouter'],
		['typesafe-ai/jev', 'vercel'],
		['d1', 'liquid'],
		['d1:free', 'liquid'],
		['gpt-6-luna-decisions', 'llmgateway'],
		['microsoft-decision-1', 'llmgateway'],
		['gpt-6-luna', 'openai'],
		['jev-1.13.0', 'typesafe'],
		['jev-latest', 'typesafe'],
	])('%s names %s', (value, id) => {
		expect(targetOfModel(value)?.id).toBe(id);
	});

	it.each([
		'openai/gpt-6-luna-decisions',
		'openai/gpt-6-luna',
		'typesafe/jev-1.13',
		'ZefanCai/Open-Jev-9B',
		'laya:en',
		'',
	])('%s names no platform', (value) => {
		expect(targetOfModel(value)).toBeUndefined();
	});
});

describe('limitsFor', () => {
	it("applies the target's limits when one is known", () => {
		const litellm = targetById('litellm');
		expect(limitsFor('openai', litellm)).toEqual({
			owner: 'LiteLLM',
			limits: { maxQuestions: 128 },
		});
	});

	it("falls back to TypeSafe's limits for a question in TypeSafe's shape", () => {
		expect(limitsFor('typesafe', undefined)).toEqual({
			owner: "TypeSafe's API",
			limits: targetById('typesafe')?.limits,
		});
	});

	it.each(['openai', 'vercel'] as const)(
		'holds a %s question to no limit when nothing says where it goes',
		(dialect) => {
			expect(limitsFor(dialect, undefined)).toEqual({ owner: '', limits: {} });
		},
	);
});
