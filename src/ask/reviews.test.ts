import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CHECKS, fitCutoff, readingsOf } from '../docs/calibration';
import { readQuestions } from '../lint/lint';
import { RULES } from '../lint/rules';
import { ask, type Fetch, isFailure } from './client';
import { CUTOFFS, type Cutoffs } from './cutoffs';
import { toLiteral } from './literal';
import { providerFor } from './provider';
import {
	buildRequest,
	buildRequestReview,
	REVIEWS,
	readAnswers,
	readRequestAnswers,
} from './reviews';

const ALL = new Set(REVIEWS.map((review) => review.code));
const MODEL = 'jev-1.14.0';

function literalOf(text: string) {
	const question = readQuestions(text).questions[0];
	return question ? toLiteral(question) : undefined;
}

describe('a question as data', () => {
	it('is the question exactly as written', () => {
		expect(
			literalOf(
				`const r = { questions: { q: { type: 'choice', instructions: 'Which one fits?', criteria: { a: 'A', b: null } } } };`,
			),
		).toEqual({
			type: 'choice',
			instructions: 'Which one fits?',
			criteria: { a: 'A', b: null },
		});
	});

	it.each([
		['instructions', `{ type: 'noul', instructions: build() }`],
		[
			'one option',
			`{ type: 'choice', instructions: 'Which one fits?', criteria: { a: label, b: 'B' } }`,
		],
		[
			'a spread',
			`{ type: 'choice', instructions: 'Which one fits?', criteria: { ...rest, b: 'B' } }`,
		],
	])('is withheld when %s is built at runtime', (_name, source) => {
		expect(
			literalOf(`const r = { questions: { q: ${source} } };`),
		).toBeUndefined();
	});
});

describe('what is put to Jev', () => {
	it('sends the question as state and one yes/no check per defect', () => {
		const request = buildRequest(
			{ type: 'noul', instructions: 'Is it large?' },
			MODEL,
			ALL,
		);
		expect(request?.state).toEqual({
			question: { type: 'noul', instructions: 'Is it large?' },
		});
		expect(request?.model).toBe(MODEL);
		expect(Object.keys(request?.questions ?? {})).toEqual(['DEC301', 'DEC302']);
	});

	// Ids with a dot are the per-entry locating questions.
	const main = (
		question: Parameters<typeof buildRequest>[0],
		context?: Parameters<typeof buildRequest>[3],
	) =>
		Object.keys(
			buildRequest(question, MODEL, ALL, context)?.questions ?? {},
		).filter((key) => !key.includes('.'));

	it('asks only the checks that fit the question type', () => {
		expect(main({ type: 'noul', instructions: 'Is it so?' })).toEqual([
			'DEC301',
			'DEC302',
		]);
		expect(
			main({
				type: 'choice',
				instructions: 'Which one fits?',
				criteria: { a: 'A', b: 'B', c: 'C' },
			}),
		).toEqual(['DEC301', 'DEC303', 'DEC305', 'DEC306', 'DEC307']);
		expect(
			main({
				type: 'score',
				instructions: 'Rate the damage',
				criteria: ['x', 'y'],
			}),
		).toEqual(['DEC301', 'DEC304', 'DEC306', 'DEC308']);
	});

	it('asks about other questions only when there are some, and names them', () => {
		const alone = buildRequest(
			{ type: 'noul', instructions: 'Is it so?' },
			MODEL,
			ALL,
		);
		expect(alone?.state).toEqual({
			question: { type: 'noul', instructions: 'Is it so?' },
		});
		const beside = buildRequest(
			{ type: 'noul', instructions: 'Is it so?' },
			MODEL,
			ALL,
			{
				siblings: ['topic', 'mood'],
			},
		);
		expect(beside?.state.other_questions).toEqual(['topic', 'mood']);
		expect(Object.keys(beside?.questions ?? {})).toContain('DEC309');
	});

	it('sends the state only when it is given one', () => {
		const without = buildRequest(
			{ type: 'noul', instructions: 'Is it so?' },
			MODEL,
			ALL,
			{ siblings: [] },
		);
		expect('state' in (without?.state ?? {})).toBe(false);
		const withState = buildRequest(
			{ type: 'noul', instructions: 'Is it so?' },
			MODEL,
			ALL,
			{
				siblings: [],
				state: { note: 'n' },
			},
		);
		expect(withState?.state.state).toEqual({ note: 'n' });
		expect(Object.keys(withState?.questions ?? {})).toContain('DEC311');
	});

	it('sends nothing when every check that fits is switched off', () => {
		expect(
			buildRequest(
				{ type: 'noul', instructions: 'Is it so?' },
				MODEL,
				new Set(),
			),
		).toBeUndefined();
	});

	it('reports a check only at or above its cutoff', () => {
		const cutoff = CUTOFFS.jev?.DEC302 ?? 0;
		expect(readAnswers({ DEC302: { noul: cutoff - 0.01 } })).toEqual([]);
		expect(
			readAnswers({ DEC302: { noul: cutoff } }).map((f) => f.code),
		).toEqual(['DEC302']);
		expect(readAnswers({})).toEqual([]);
	});

	it("judges an answer by the model's own cutoffs, and reports nothing for a check it has none for", () => {
		const luna = CUTOFFS.luna as Cutoffs;
		expect(luna.DEC301).toBeUndefined();
		expect(
			readAnswers({ DEC301: { noul: 1 }, DEC302: { noul: 0.72 } }, luna).map(
				(f) => f.code,
			),
		).toEqual(['DEC302']);
		expect(
			readRequestAnswers(
				['a', 'b'],
				{ 'DEC310.0.1': { noul: 0.02 }, DEC312: { noul: 0.96 } },
				luna,
			),
		).toEqual([{ code: 'DEC310', first: 'a', second: 'b', probability: 0.02 }]);
		expect(
			readRequestAnswers(
				['a', 'b'],
				{ 'DEC310.0.1': { noul: 0.9 }, DEC312: { noul: 1 } },
				CUTOFFS.d1 as Cutoffs,
			),
		).toEqual([{ code: 'DEC310', first: 'a', second: 'b', probability: 0.9 }]);
	});

	it('asks about each option in the same request, to find the ones at fault', () => {
		const request = buildRequest(
			{
				type: 'choice',
				instructions: 'Which one fits?',
				criteria: { pet: 'An animal kept at home', dog: 'A dog' },
			},
			MODEL,
			new Set(['DEC303']),
		);
		expect(Object.keys(request?.questions ?? {})).toEqual([
			'DEC303',
			'DEC303.0',
			'DEC303.1',
		]);
		expect(JSON.stringify(request?.questions['DEC303.1'])).toContain(
			'\\"dog\\"',
		);
	});

	it('names the two entries Jev rates highest, and none when it rates none', () => {
		const pointed = readAnswers(
			{
				DEC303: { noul: 0.9 },
				'DEC303.0': { noul: 0.2 },
				'DEC303.1': { noul: 0.7 },
				'DEC303.2': { noul: 0.6 },
			},
			CUTOFFS.d1,
		);
		expect(pointed[0]?.culprits).toEqual([1, 2]);
		const vague = readAnswers(
			{
				DEC303: { noul: 0.9 },
				'DEC303.0': { noul: 0.3 },
				'DEC303.1': { noul: 0.2 },
			},
			CUTOFFS.d1,
		);
		expect(vague[0]?.culprits).toEqual([]);
	});

	it('does not ask about each entry of a very long list', () => {
		const criteria = Object.fromEntries(
			Array.from({ length: 13 }, (_, i) => [`o${i}`, null]),
		);
		const request = buildRequest(
			{ type: 'choice', instructions: 'Which one fits?', criteria },
			MODEL,
			new Set(['DEC303']),
		);
		expect(Object.keys(request?.questions ?? {})).toEqual(['DEC303']);
	});

	it('asks one request about every pair of questions, and about the state if given', () => {
		const questions = {
			a: { type: 'noul' as const, instructions: 'Is there one?' },
			b: { type: 'noul' as const, instructions: 'Are there two?' },
			c: { type: 'noul' as const, instructions: 'Are there three?' },
		};
		const pairs = buildRequestReview(
			questions,
			MODEL,
			new Set(['DEC310', 'DEC312']),
		);
		expect(Object.keys(pairs?.questions ?? {})).toEqual([
			'DEC310.0.1',
			'DEC310.0.2',
			'DEC310.1.2',
		]);
		expect('state' in (pairs?.state ?? {})).toBe(false);
		const withState = buildRequestReview(
			questions,
			MODEL,
			new Set(['DEC310', 'DEC312']),
			'text',
		);
		expect(Object.keys(withState?.questions ?? {})).toContain('DEC312');
		expect(
			buildRequestReview(
				{ a: questions.a },
				MODEL,
				new Set(['DEC310', 'DEC312']),
			),
		).toBeUndefined();
	});

	it('reads a pair above the cutoff back to its two question ids', () => {
		const found = readRequestAnswers(['a', 'b', 'c'], {
			'DEC310.0.1': { noul: 0.02 },
			'DEC310.1.2': { noul: 0.6 },
			DEC312: { noul: 0.99 },
		});
		expect(found).toEqual([
			{ code: 'DEC310', first: 'b', second: 'c', probability: 0.6 },
			{ code: 'DEC312', probability: 0.99 },
		]);
	});

	it('has a registered rule behind every check', () => {
		for (const review of REVIEWS)
			expect(RULES[review.code].code).toBe(review.code);
	});
});

// The probabilities each model returned for every corpus question and
// request, saved by scripts/calibrate-reviews.ts. Reading them costs nothing,
// so the cutoffs are held to them here.
describe('cutoffs against the saved calibration', () => {
	const read = (path: string) =>
		JSON.parse(
			readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'),
		);
	const corpus = read('corpus/questions.json');
	const requests = read('corpus/requests.json');
	const readings = (file: string, code: string) =>
		readingsOf(code, read(`validation/${file}`), corpus, requests);

	// Every model's are what the rule fits on their runs, exactly, so a
	// changed example or a rerun moves the table or fails here.
	it.each([
		['jev', 'calibration.json'],
		['luna', 'calibration-openai-gpt-6-luna.json'],
		['d1', 'calibration-liquid-d1.json'],
	])("%s's cutoffs are what the rule fits on its run", (family, file) => {
		const fitted = Object.fromEntries(
			CHECKS.flatMap((code) => {
				const { cutoff } = fitCutoff(readings(file, code));
				return cutoff === undefined ? [] : [[code, cutoff]];
			}),
		);
		expect(CUTOFFS[family]).toEqual(fitted);
	});
});

describe('the client', () => {
	const request = buildRequest(
		{ type: 'noul', instructions: 'Is it so?' },
		MODEL,
		ALL,
	);
	if (!request) throw new Error('no request');
	// One answer per question asked, as TypeSafe answers; the given ones override a no.
	const answered = (over: Record<string, unknown> = {}) => ({
		...Object.fromEntries(
			Object.keys(request.questions).map((id) => [id, { noul: 0 }]),
		),
		...over,
	});
	const reply = (status: number, body: unknown = {}) => ({
		ok: status === 200,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	});
	const provider = providerFor(MODEL);
	if (typeof provider === 'string') throw new Error(provider);
	const deps = (fetch: Fetch) => ({
		fetch,
		key: 'secret-key',
		provider,
		wait: vi.fn(async () => {}),
	});

	it('sends the key as a bearer token and reads the reply', async () => {
		const fetch = vi.fn(async () =>
			reply(200, {
				model: MODEL,
				answers: answered({ DEC302: { noul: 0.9 } }),
				usage: { input_tokens: 300 },
			}),
		);
		const result = await ask(deps(fetch), request);
		expect(result).toEqual({
			model: MODEL,
			answers: answered({ DEC302: { noul: 0.9 } }),
			inputTokens: 300,
		});
		const init = (
			fetch.mock.calls[0] as unknown as [
				string,
				{ headers: Record<string, string>; body: string },
			]
		)[1];
		expect(init.headers.Authorization).toBe('Bearer secret-key');
		expect(JSON.parse(init.body).state.question.instructions).toBe('Is it so?');
	});

	it('does not retry a bad key', async () => {
		const fetch = vi.fn(async () => reply(401));
		const result = await ask(deps(fetch), request);
		expect(isFailure(result) && result.kind).toBe('key');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('retries a busy service three times and then stops', async () => {
		const fetch = vi.fn(async () => reply(429));
		const d = deps(fetch);
		const result = await ask(d, request);
		expect(isFailure(result) && result.kind).toBe('busy');
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(d.wait).toHaveBeenCalledTimes(2);
	});

	it('recovers when the service stops being busy', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(reply(529))
			.mockResolvedValueOnce(
				reply(200, { model: MODEL, answers: answered(), usage: {} }),
			);
		expect(isFailure(await ask(deps(fetch), request))).toBe(false);
	});

	it('reports a network error without the key in it', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('getaddrinfo ENOTFOUND');
		});
		const result = await ask(deps(fetch), request);
		expect(result).toEqual({
			kind: 'network',
			detail: 'getaddrinfo ENOTFOUND',
		});
		expect(JSON.stringify(result)).not.toContain('secret-key');
	});
});
