import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { targetById } from '../lint/targets';
import type { QuestionLiteral } from './literal';
import { providerForTarget } from './provider';
import { estimateTokens } from './review';
import {
	buildRequest,
	buildRequestReview,
	REVIEWS,
	type ReviewRequest,
} from './reviews';

type Entry = { question: QuestionLiteral; siblings?: string[] };
type RequestEntry = {
	state?: unknown;
	questions: Record<string, QuestionLiteral>;
};

const load = <T>(path: string): T =>
	JSON.parse(
		readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'),
	);

// The requests `scripts/calibrate-reviews.ts` sends on a fresh run.
function calibrationRequests(model: string): ReviewRequest[] {
	const codes = new Set(REVIEWS.map((review) => review.code));
	const list: Array<ReviewRequest | undefined> = [];
	for (const entry of load<Entry[]>('corpus/questions.json'))
		list.push(
			buildRequest(entry.question, model, codes, {
				siblings: entry.siblings ?? [],
			}),
		);
	for (const entry of load<RequestEntry[]>('corpus/requests.json')) {
		list.push(
			buildRequestReview(
				entry.questions,
				model,
				new Set(['DEC310', 'DEC312']),
				entry.state,
			),
		);
		if (entry.state === undefined) continue;
		for (const question of Object.values(entry.questions))
			list.push(
				buildRequest(question, model, new Set(['DEC311']), {
					siblings: [],
					state: entry.state,
				}),
			);
	}
	return list.filter((request): request is ReviewRequest => !!request);
}

describe('the token estimate', () => {
	// Each run's file holds what the platform billed for one fresh pass. The
	// confirmation shows the estimate before money is spent, so it must not
	// come in under that on any platform measured.
	it.each([
		['openai', 'calibration-openai-gpt-6-luna.json'],
		['liquid', 'calibration-liquid-d1.json'],
		['openrouter', 'calibration-openrouter-typesafe_jev-1.13.json'],
		['llmgateway', 'calibration-llmgateway-jev-1.13.0.json'],
	])('is no lower than what %s billed for the calibration set', (id, file) => {
		const target = targetById(id);
		if (!target?.defaultModel) throw new Error(`no default model for ${id}`);
		const provider = providerForTarget(target, target.defaultModel);
		if (typeof provider === 'string') throw new Error(provider);
		const billed = load<{ calls: number; inputTokens: number }>(
			`validation/${file}`,
		);
		const requests = calibrationRequests(target.defaultModel);
		expect(requests).toHaveLength(billed.calls);
		const estimated = requests.reduce(
			(sum, request) => sum + estimateTokens(request, provider),
			0,
		);
		expect(estimated).toBeGreaterThanOrEqual(billed.inputTokens);
	});
});
