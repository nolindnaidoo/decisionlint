import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { targetById } from '../lint/targets';
import type { QuestionLiteral } from './literal';
import { providerForTarget } from './provider';
import { estimateTokens, roughTokens } from './review';
import {
	buildRequest,
	buildRequestReview,
	REVIEWS,
	type ReviewRequest,
} from './reviews';

type Entry = { id: string; question: QuestionLiteral; siblings?: string[] };
type RequestEntry = {
	id: string;
	state?: unknown;
	questions: Record<string, QuestionLiteral>;
};
type Job = { id: string; request: ReviewRequest };

const load = <T>(path: string): T =>
	JSON.parse(
		readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'),
	);

// The requests `scripts/calibrate-reviews.ts` sends on a fresh run, under
// the ids it saves them by.
function calibrationRequests(model: string): Job[] {
	const codes = new Set(REVIEWS.map((review) => review.code));
	const list: Array<{ id: string; request: ReviewRequest | undefined }> = [];
	for (const entry of load<Entry[]>('corpus/questions.json'))
		list.push({
			id: entry.id,
			request: buildRequest(entry.question, model, codes, {
				siblings: entry.siblings ?? [],
			}),
		});
	for (const entry of load<RequestEntry[]>('corpus/requests.json')) {
		list.push({
			id: entry.id,
			request: buildRequestReview(
				entry.questions,
				model,
				new Set(['DEC310', 'DEC312']),
				entry.state,
			),
		});
		if (entry.state === undefined) continue;
		for (const [id, question] of Object.entries(entry.questions))
			list.push({
				id: `${entry.id}/${id}`,
				request: buildRequest(question, model, new Set(['DEC311']), {
					siblings: [],
					state: entry.state,
				}),
			});
	}
	return list.filter((job): job is Job => !!job.request);
}

describe('the token estimate as shown', () => {
	it.each([
		[0, '0'],
		[9, '9'],
		[310, '310'],
		[311, '320'],
		[6939, '7,000'],
		[10289, '11,000'],
		[10000, '10,000'],
		[123456, '130,000'],
	])('shows %d as %s, rounded up to two figures', (estimate, shown) => {
		expect(roughTokens(estimate)).toBe(shown);
	});
});

describe('the token estimate', () => {
	// Each run's file holds what the platform billed for one fresh pass. The
	// confirmation shows the estimate before money is spent, so it must not
	// come in under that on any platform measured.
	it.each([
		['openai', 'calibration-openai-gpt-6-luna.json'],
		['liquid', 'calibration-liquid-d1.json'],
		['openrouter', 'calibration-openrouter-typesafe_jev-1.14.json'],
		['llmgateway', 'calibration-llmgateway-jev-1.14.0.json'],
	])('is no lower than what %s billed for the calibration set', (id, file) => {
		const target = targetById(id);
		if (!target?.defaultModel) throw new Error(`no default model for ${id}`);
		const provider = providerForTarget(target, target.defaultModel);
		if (typeof provider === 'string') throw new Error(provider);
		const billed = load<{
			calls: number;
			inputTokens: number;
			probabilities: Record<string, unknown>;
		}>(`validation/${file}`);
		// The requests that run was sent. The corpus has grown since, and a
		// question added after a run was not billed by it.
		const requests = calibrationRequests(target.defaultModel).filter(
			(job) => billed.probabilities[job.id] !== undefined,
		);
		expect(requests).toHaveLength(billed.calls);
		const estimated = requests.reduce(
			(sum, job) => sum + estimateTokens(job.request, provider),
			0,
		);
		expect(estimated).toBeGreaterThanOrEqual(billed.inputTokens);
	});
});
