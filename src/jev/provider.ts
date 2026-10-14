import { MEASURED_ON } from '../lint/limits';
import type { Failure, Reply } from './client';
import type { ReviewRequest } from './reviews';

/**
 * The two APIs a check can be put to. Both take typed questions over evidence
 * and answer with probabilities, so one review runs on either; the shape on
 * the wire and the key differ, and this is the only file that knows how.
 *
 * The cutoffs in `reviews.ts` were set on `MEASURED_ON`. A finding from any
 * other model says so, until that model is calibrated the same way.
 */
export type Provider = Readonly<{
	id: 'typesafe' | 'openai';
	/** Who is sent the request. */
	vendor: string;
	/** What answers it, as the messages name it. */
	model: string;
	endpoint: string;
	/** The environment variable the command line and the editor read the key from. */
	envKey: string;
	/** Dollars per million input tokens on the vendor's price page, and when that was read. */
	pricePerMillionTokens: number;
	pricedOn: string;
	/** The request as the vendor's API wants it. */
	toBody: (request: ReviewRequest) => unknown;
	/** The answers as `runReview` reads them, or why the body is not an answer to `request`. */
	fromBody: (body: unknown, request: ReviewRequest) => Reply | Failure;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const garbled = (detail: string): Failure => ({ kind: 'garbled', detail });

// The field TypeSafe's reference requires on an answer of each type, which is
// also the one this code reads. A Map, because the key comes from the request.
const ANSWER_FIELD: ReadonlyMap<string, 'noul' | 'choice' | 'score'> = new Map([
	['noul', 'noul'],
	['choice', 'choice'],
	['score', 'score'],
]);

/**
 * Why `answers` is not Jev's answer to `request`, or undefined when it is.
 * TypeSafe's API reference returns one answer per question, under the same
 * ids, each carrying its type's value. A 200 whose body answers fewer, or
 * answers without the value, is a proxy, a sign-in page or a bug, and read as
 * answers it would report a clean check that never ran.
 */
function unanswered(
	answers: Record<string, unknown>,
	request: ReviewRequest,
): string | undefined {
	for (const [id, asked] of Object.entries(request.questions)) {
		const answer = answers[id];
		if (!isRecord(answer)) return `no answer for '${id}'`;
		const type = isRecord(asked) ? asked.type : undefined;
		const field = typeof type === 'string' ? ANSWER_FIELD.get(type) : undefined;
		if (!field) continue;
		const wanted = field === 'choice' ? 'string' : 'number';
		if (typeof answer[field] !== wanted)
			return `the answer for '${id}' has no ${field}`;
	}
	return undefined;
}

type Noul = Readonly<{
	instructions: string;
	criteria?: Readonly<{ true: string; false: string }>;
}>;

// A check's id can hold dots, `JEV303.0`, and what OpenAI allows in a name is
// not published. Dots travel as a run of underscores no id contains.
const DOT = '__';
const toWireName = (id: string): string => id.split('.').join(DOT);
const fromWireName = (name: string): string => name.split(DOT).join('.');

// A predicate has no criteria field, so what yes and no mean goes into the
// instructions, where the model reads it either way.
function toPredicate(name: string, question: Noul) {
	const criteria = question.criteria;
	const instructions = criteria
		? `${question.instructions}\n\nAnswer yes when: ${criteria.true}\nAnswer no when: ${criteria.false}`
		: question.instructions;
	return { type: 'predicate', name: toWireName(name), instructions };
}

const TYPESAFE: Provider = Object.freeze({
	id: 'typesafe',
	vendor: 'TypeSafe',
	model: 'Jev',
	endpoint: 'https://api.typesafe.ai/v1/systemone',
	envKey: 'TYPESAFE_API_KEY',
	// TypeSafe's published price on the day the checks were calibrated.
	pricePerMillionTokens: 0.042,
	pricedOn: '2026-10-04',
	toBody: (request) => request,
	fromBody: (body, request) => {
		if (!isRecord(body) || !isRecord(body.answers))
			return garbled('the answer was not a Jev reply');
		const missing = unanswered(body.answers, request);
		if (missing) return garbled(missing);
		const usage = isRecord(body.usage) ? body.usage.input_tokens : undefined;
		return {
			model: typeof body.model === 'string' ? body.model : '',
			answers: body.answers as Reply['answers'],
			inputTokens: typeof usage === 'number' ? usage : 0,
		};
	},
});

const OPENAI: Provider = Object.freeze({
	id: 'openai',
	vendor: 'OpenAI',
	model: 'Luna',
	endpoint: 'https://api.openai.com/v1/decisions',
	envKey: 'OPENAI_API_KEY',
	// OpenAI's published price for the Decisions API beta.
	pricePerMillionTokens: 0.1,
	pricedOn: '2026-10-08',
	toBody: (request) => ({
		model: request.model,
		// The API takes text, not an object. Written out as JSON it reads the same.
		input: JSON.stringify(request.state, null, 2),
		questions: Object.entries(request.questions).map(([name, question]) =>
			toPredicate(name, question as Noul),
		),
	}),
	// OpenAI's contract for a missing answer is not published, and a refusal is a
	// legitimate non-answer there, so only the shape is checked.
	fromBody: (body) => {
		if (!isRecord(body) || !Array.isArray(body.answers))
			return garbled('the answer was not a Luna reply');
		const answers: Record<string, { noul?: number }> = {};
		for (const answer of body.answers) {
			if (!isRecord(answer) || typeof answer.name !== 'string') continue;
			// A refusal is no answer, so the check does not fire. It is not a wrong one.
			if (typeof answer.probability !== 'number') continue;
			answers[fromWireName(answer.name)] = { noul: answer.probability };
		}
		const usage = isRecord(body.usage) ? body.usage.input_tokens : undefined;
		return {
			model: typeof body.model === 'string' ? body.model : 'gpt-6-luna',
			answers,
			inputTokens: typeof usage === 'number' ? usage : 0,
		};
	},
});

export const PROVIDERS: ReadonlyArray<Provider> = Object.freeze([
	TYPESAFE,
	OPENAI,
]);

/** Who answers a model id: `gpt-6-luna` and its dated versions are OpenAI's, everything else is Jev. */
export function providerFor(model: string): Provider {
	return /^gpt-6-luna/.test(model) ? OPENAI : TYPESAFE;
}

/** True for the one version the cutoffs were set on. A finding from any other model, another Jev included, carries a caveat. */
export function isCalibrated(model: string): boolean {
	return model === MEASURED_ON;
}

/** A message written for Jev, reworded for the model that answered. */
export function forProvider(message: string, provider: Provider): string {
	return provider.id === 'typesafe'
		? message
		: message.replace(/\bJev\b/g, provider.model);
}
