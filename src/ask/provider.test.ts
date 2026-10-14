import { describe, expect, it } from 'vitest';
import { MEASURED_ON } from '../lint/limits';
import { ask, type Fetch, isFailure } from './client';
import {
	forProvider,
	isCalibrated,
	type Provider,
	providerFor,
} from './provider';
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

const must = (provider: Provider | string): Provider => {
	if (typeof provider === 'string') throw new Error(provider);
	return provider;
};
const JEV = must(providerFor('jev-1.13.0'));
const LUNA = must(providerFor('gpt-6-luna'));

describe('where a model id is sent', () => {
	it.each([
		[
			'jev-1.13.0',
			'TypeSafe',
			'typesafe',
			'https://api.typesafe.ai/v1/systemone',
			'TYPESAFE_API_KEY',
			'Jev',
		],
		[
			'jev-latest',
			'TypeSafe',
			'typesafe',
			'https://api.typesafe.ai/v1/systemone',
			'TYPESAFE_API_KEY',
			'Jev',
		],
		[
			'gpt-6-luna',
			'OpenAI',
			'openai',
			'https://api.openai.com/v1/decisions',
			'OPENAI_API_KEY',
			'Luna',
		],
		[
			'~typesafe/jev-latest',
			'OpenRouter',
			'typesafe',
			'https://openrouter.ai/api/v1/systemone',
			'OPENROUTER_API_KEY',
			'Jev',
		],
		[
			'typesafe-ai/jev',
			'Vercel AI Gateway',
			'openai',
			'https://ai-gateway.vercel.sh/v1/decisions',
			'AI_GATEWAY_API_KEY',
			'Jev',
		],
		[
			'gpt-6-luna-decisions',
			'LLM Gateway',
			'openai',
			'https://api.llmgateway.io/v1/decisions',
			'LLM_GATEWAY_API_KEY',
			'Luna',
		],
		[
			'd1:free',
			'Liquid AI',
			'typesafe',
			'https://api.liquid.ai/decisions/v1/systemone',
			'LIQUID_API_KEY',
			'the model',
		],
	])('%s goes to %s', (model, vendor, shape, endpoint, envKey, answerer) => {
		const provider = must(providerFor(model));
		expect(provider).toMatchObject({
			vendor,
			shape,
			endpoint,
			envKey,
			model: answerer,
			keyOptional: false,
		});
	});

	it('keeps a keychain slot only for the two vendors that have one', () => {
		expect(JEV.keychain).toBe('typesafe');
		expect(LUNA.keychain).toBe('openai');
		expect(must(providerFor('~typesafe/jev-latest')).keychain).toBeUndefined();
	});

	it.each(['openai/gpt-6-luna-decisions', 'ZefanCai/Open-Jev-9B', 'laya:en'])(
		'refuses %s, whose spelling names no host, rather than send it to a vendor',
		(model) => {
			expect(providerFor(model)).toBe(
				`'${model}' names no platform this tool knows the host of. Set the endpoint it is sent to.`,
			);
		},
	);

	it('refuses a shape the platform publishes no endpoint for', () => {
		expect(providerFor('~typesafe/jev-latest', { shape: 'openai' })).toBe(
			'OpenRouter publishes no endpoint for the openai shape. Set the endpoint it is sent to.',
		);
	});

	it('sends to an endpoint the user names, in the shape its path says, with no key required', () => {
		const local = must(
			providerFor('ggml-org/OpenJev-GGUF', {
				endpoint: 'http://localhost:8080/v1/systemone',
			}),
		);
		expect(local).toMatchObject({
			shape: 'typesafe',
			vendor: 'localhost:8080',
			model: 'the model',
			endpoint: 'http://localhost:8080/v1/systemone',
			envKey: 'TYPESAFE_API_KEY',
			keychain: undefined,
			keyOptional: true,
			pricePerMillionTokens: undefined,
		});
		const proxy = must(
			providerFor('openai/gpt-6-luna', {
				endpoint: 'http://litellm.internal:4000/v1/decisions',
			}),
		);
		expect(proxy).toMatchObject({
			shape: 'openai',
			vendor: 'litellm.internal:4000',
			model: 'Luna',
			envKey: 'OPENAI_API_KEY',
			keyOptional: true,
		});
	});

	it('takes the shape from the user where the path does not say, and refuses without one', () => {
		expect(
			providerFor('laya', { endpoint: 'http://localhost:11435/api/decide' }),
		).toBe(
			"'http://localhost:11435/api/decide' does not say which shape it takes. Set the shape to typesafe or openai.",
		);
		expect(
			must(
				providerFor('laya', {
					endpoint: 'http://localhost:11435/api/decide',
					shape: 'typesafe',
				}),
			).shape,
		).toBe('typesafe');
		// Ollaya serves TypeSafe bodies on a path named for OpenAI's. The user's word wins over the path.
		expect(
			must(
				providerFor('laya', {
					endpoint: 'http://localhost:11435/v1/decisions',
					shape: 'typesafe',
				}),
			).shape,
		).toBe('typesafe');
	});

	it('knows a named endpoint at a platform in the table, and holds it to the shapes that platform takes', () => {
		const vercel = must(
			providerFor('openai/gpt-6-luna-decisions', {
				endpoint: 'https://ai-gateway.vercel.sh/v1/decisions',
			}),
		);
		expect(vercel).toMatchObject({
			vendor: 'Vercel AI Gateway',
			shape: 'openai',
			envKey: 'AI_GATEWAY_API_KEY',
			keyOptional: false,
		});
		const liquid = must(
			providerFor('d1', {
				endpoint: 'https://api.liquid.ai/decisions/v1/systemone',
			}),
		);
		expect(liquid).toMatchObject({
			vendor: 'Liquid AI',
			shape: 'typesafe',
			envKey: 'LIQUID_API_KEY',
		});
		expect(
			providerFor('d1', {
				endpoint: 'https://api.liquid.ai/decisions/v1/systemone',
				shape: 'openai',
			}),
		).toBe('Liquid AI does not take the openai shape.');
	});

	it.each([
		['not a url', "'not a url' is not a URL."],
		[
			'ftp://host/v1/systemone',
			"'ftp://host/v1/systemone' is not an http or https URL.",
		],
	])('refuses %s as an endpoint', (endpoint, reason) => {
		expect(providerFor('jev-1.13.0', { endpoint })).toBe(reason);
	});

	it('counts only the version the cutoffs were set on as calibrated', () => {
		expect(isCalibrated(MEASURED_ON)).toBe(true);
		expect(isCalibrated('jev-99.0.0')).toBe(false);
		expect(isCalibrated('jev-latest')).toBe(false);
		expect(isCalibrated('gpt-6-luna')).toBe(false);
	});

	it('rewords a message for the model that answered', () => {
		expect(forProvider('Jev reads this as counting.', LUNA)).toBe(
			'Luna reads this as counting.',
		);
		expect(forProvider('Jev reads this as counting.', JEV)).toBe(
			'Jev reads this as counting.',
		);
		const local = must(
			providerFor('ggml-org/OpenJev-GGUF', {
				endpoint: 'http://localhost:8080/v1/systemone',
			}),
		);
		expect(
			forProvider('Jev reads this as counting. Ask Jev less.', local),
		).toBe('The model reads this as counting. Ask the model less.');
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
			{
				fetch: fakeFetch(reply, []),
				key: 'k',
				provider: JEV,
				wait: async () => {},
			},
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
				{
					fetch: fakeFetch(reply, []),
					key: 'k',
					provider: JEV,
					wait: async () => {},
				},
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
			{
				fetch: fakeFetch(reply, sent),
				key: 'sk-test',
				provider: LUNA,
				wait: async () => {},
			},
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
			{
				fetch: fakeFetch(reply, []),
				key: 'k',
				provider: LUNA,
				wait: async () => {},
			},
			request,
		);
		if (isFailure(result)) throw new Error(result.detail);
		expect(result.answers).toEqual({
			JEV303: { noul: 0.9 },
			'JEV303.1': { noul: 0.7 },
		});
	});

	it('calls a reply with no answers list garbled, naming the shape', async () => {
		const result = await ask(
			{
				fetch: fakeFetch({ choices: [] }, []),
				key: 'k',
				provider: LUNA,
				wait: async () => {},
			},
			request,
		);
		expect(result).toEqual({
			kind: 'garbled',
			detail: 'the answer was not a Decisions reply',
		});
	});

	it('sends no Authorization header to a host the user runs when there is no key', async () => {
		const sent: Sent[] = [];
		const local = must(
			providerFor('openai/gpt-6-luna', {
				endpoint: 'http://localhost:4000/v1/decisions',
			}),
		);
		await ask(
			{
				fetch: fakeFetch({ answers: [] }, sent),
				key: '',
				provider: local,
				wait: async () => {},
			},
			request,
		);
		expect(sent[0]?.url).toBe('http://localhost:4000/v1/decisions');
		expect(sent[0]?.headers).not.toHaveProperty('Authorization');
	});

	it('still sends a Jev request to TypeSafe unchanged', async () => {
		const sent: Sent[] = [];
		const jev = buildRequest(question, 'jev-1.13.0', ALL);
		if (!jev) throw new Error('no request');
		await ask(
			{
				fetch: fakeFetch({ answers: {} }, sent),
				key: 'k',
				provider: JEV,
				wait: async () => {},
			},
			jev,
		);
		expect(sent[0]?.url).toBe('https://api.typesafe.ai/v1/systemone');
		expect(sent[0]?.body).toEqual(jev);
	});
});
