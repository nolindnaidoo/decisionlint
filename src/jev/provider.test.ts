import { describe, expect, it } from 'vitest';
import { MEASURED_ON } from '../lint/limits';
import { ask, type Fetch, isFailure } from './client';
import { forProvider, isCalibrated, providerFor } from './provider';
import { buildRequest } from './reviews';

const ALL = new Set([
	'JEV301',
	'JEV302',
	'JEV303',
	'JEV304',
	'JEV305',
	'JEV306',
	'JEV307',
	'JEV308',
]);
const question = {
	type: 'choice' as const,
	instructions: 'Which team should handle this?',
	criteria: { billing: 'Charges', technical: 'Faults' },
};

type Sent = { url: string; headers: Record<string, string>; body: unknown };

function fakeFetch(reply: unknown, sent: Sent[]): Fetch {
	return async (url, init) => {
		sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
		return {
			ok: true,
			status: 200,
			json: async () => reply,
			text: async () => '',
		};
	};
}

describe('which vendor a model belongs to', () => {
	it.each([
		['jev-1.13.0', 'typesafe'],
		['jev-latest', 'typesafe'],
		['gpt-6-luna', 'openai'],
		['gpt-6-luna-2026-10-06', 'openai'],
	])('%s is %s', (model, id) => {
		expect(providerFor(model).id).toBe(id);
	});

	it('counts only the version the cutoffs were set on as calibrated', () => {
		expect(isCalibrated(MEASURED_ON)).toBe(true);
		expect(isCalibrated('jev-99.0.0')).toBe(false);
		expect(isCalibrated('jev-latest')).toBe(false);
		expect(isCalibrated('gpt-6-luna')).toBe(false);
	});

	it('rewords a message for the model that answered', () => {
		expect(
			forProvider('Jev reads this as counting.', providerFor('gpt-6-luna')),
		).toBe('Luna reads this as counting.');
		expect(
			forProvider('Jev reads this as counting.', providerFor('jev-1.13.0')),
		).toBe('Jev reads this as counting.');
	});
});

describe('a review sent to TypeSafe', () => {
	const request = buildRequest(question, 'jev-1.13.0', ALL);
	if (!request) throw new Error('no request');
	const asked = Object.keys(request.questions);
	const answered = (over: Record<string, unknown> = {}) => ({
		model: 'jev-1.13.0',
		answers: {
			...Object.fromEntries(
				asked.map((id) => [id, { type: 'noul', noul: 0.1 }]),
			),
			...over,
		},
		usage: { input_tokens: 296, output_tokens: 20 },
	});
	const askJev = (reply: unknown) =>
		ask(
			{ fetch: fakeFetch(reply, []), key: 'k', wait: async () => {} },
			request,
		);

	it('reads a reply with one answer per question asked, as the API reference promises', async () => {
		const result = await askJev(
			answered({ JEV303: { type: 'noul', noul: 0.8 } }),
		);
		if (isFailure(result)) throw new Error(result.detail);
		expect(result.model).toBe('jev-1.13.0');
		expect(result.inputTokens).toBe(296);
		expect(Object.keys(result.answers).sort()).toEqual([...asked].sort());
		expect(result.answers.JEV303).toEqual({ type: 'noul', noul: 0.8 });
	});

	// A 200 whose body answers nothing is a proxy, a sign-in page or a bug, not
	// Jev: the reference returns one answer per question under the same ids.
	it('calls a reply with no answers garbled, naming the first question it lacks', async () => {
		const result = await askJev({
			model: 'jev-1.13.0',
			answers: {},
			usage: {},
		});
		expect(result).toEqual({
			kind: 'garbled',
			detail: `no answer for '${asked[0]}'`,
		});
	});

	it('calls a reply that lacks one of the questions garbled', async () => {
		const [dropped = ''] = asked.slice(-1);
		const body = answered();
		delete (body.answers as Record<string, unknown>)[dropped];
		expect(await askJev(body)).toEqual({
			kind: 'garbled',
			detail: `no answer for '${dropped}'`,
		});
	});

	it('calls an answer without its value garbled', async () => {
		const [first = ''] = asked;
		expect(await askJev(answered({ [first]: { type: 'noul' } }))).toEqual({
			kind: 'garbled',
			detail: `the answer for '${first}' has no noul`,
		});
	});

	it('reads a choice and a score answer by the field their type requires', async () => {
		const probe = {
			state: { note: 'Cracked lid.' },
			model: 'jev-1.13.0',
			questions: {
				q: {
					type: 'choice',
					instructions: 'What went wrong?',
					criteria: { late: 'Late', damaged: 'Damaged' },
				},
			},
		};
		const asking = (reply: unknown) =>
			ask(
				{ fetch: fakeFetch(reply, []), key: 'k', wait: async () => {} },
				probe,
			);
		const good = await asking({
			answers: {
				q: {
					type: 'choice',
					choice: 'damaged',
					probabilities: { late: 0.1, damaged: 0.9 },
					confidence: 0.8,
				},
			},
		});
		if (isFailure(good)) throw new Error(good.detail);
		expect(good.answers.q).toMatchObject({ choice: 'damaged' });
		expect(
			await asking({ answers: { q: { type: 'choice', confidence: 0.8 } } }),
		).toEqual({
			kind: 'garbled',
			detail: "the answer for 'q' has no choice",
		});
	});
});

describe("a review sent to OpenAI's Decisions API", () => {
	const request = buildRequest(question, 'gpt-6-luna', ALL);
	if (!request) throw new Error('no request');

	it('goes to the Decisions endpoint as predicates, with the question as text input', async () => {
		const sent: Sent[] = [];
		const reply = {
			answers: [{ type: 'predicate', name: 'JEV303', probability: 0.8 }],
			usage: { input_tokens: 321 },
		};
		const result = await ask(
			{ fetch: fakeFetch(reply, sent), key: 'sk-test', wait: async () => {} },
			request,
		);
		expect(sent[0]?.url).toBe('https://api.openai.com/v1/decisions');
		expect(sent[0]?.headers.Authorization).toBe('Bearer sk-test');
		const body = sent[0]?.body as {
			model: string;
			input: string;
			questions: { type: string; name: string; instructions: string }[];
		};
		expect(body.model).toBe('gpt-6-luna');
		expect(JSON.parse(body.input)).toEqual({ question });
		expect(body.questions.every((q) => q.type === 'predicate')).toBe(true);
		// Jev's criteria become part of the instructions, since a predicate has no criteria field.
		const overlap = body.questions.find((q) => q.name === 'JEV303');
		expect(overlap?.instructions).toContain(
			'Answer yes when: Two of the options cover some of the same cases.',
		);
		expect(overlap?.instructions).toContain('Answer no when:');
		// A locating question's dot travels as underscores and comes back.
		expect(body.questions.some((q) => q.name === 'JEV303__0')).toBe(true);
		if (isFailure(result)) throw new Error(result.detail);
		expect(result).toEqual({
			model: 'gpt-6-luna',
			inputTokens: 321,
			answers: { JEV303: { noul: 0.8 } },
		});
	});

	it('maps a locating answer back to its dotted id, and drops a refusal', async () => {
		const reply = {
			model: 'gpt-6-luna',
			answers: [
				{ type: 'predicate', name: 'JEV303', probability: 0.9 },
				{ type: 'predicate', name: 'JEV303__1', probability: 0.7 },
				{ type: 'refusal', name: 'JEV301' },
			],
		};
		const result = await ask(
			{ fetch: fakeFetch(reply, []), key: 'k', wait: async () => {} },
			request,
		);
		if (isFailure(result)) throw new Error(result.detail);
		expect(result.answers).toEqual({
			JEV303: { noul: 0.9 },
			'JEV303.1': { noul: 0.7 },
		});
	});

	it('calls a reply with no answers list garbled, naming Luna', async () => {
		const result = await ask(
			{ fetch: fakeFetch({ choices: [] }, []), key: 'k', wait: async () => {} },
			request,
		);
		expect(result).toEqual({
			kind: 'garbled',
			detail: 'the answer was not a Luna reply',
		});
	});

	it('still sends a Jev request to TypeSafe unchanged', async () => {
		const sent: Sent[] = [];
		const jev = buildRequest(question, 'jev-1.13.0', ALL);
		if (!jev) throw new Error('no request');
		await ask(
			{
				fetch: fakeFetch({ answers: {} }, sent),
				key: 'k',
				wait: async () => {},
			},
			jev,
		);
		expect(sent[0]?.url).toBe('https://api.typesafe.ai/v1/systemone');
		expect(sent[0]?.body).toEqual(jev);
	});
});
