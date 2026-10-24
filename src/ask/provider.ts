import { MEASURED_ON } from '../lint/limits';
import { parseModelId } from '../lint/models';
import {
	type Shape,
	type Target,
	targetByHost,
	targetOfModel,
} from '../lint/targets';
import type { Failure, Reply } from './client';
import { MEASURED } from './cutoffs';
import type { ReviewRequest } from './reviews';

/**
 * Where a check is sent and in what shape. Every platform takes typed
 * questions over evidence and answers with probabilities, so one review runs
 * on any of them; what differs is the shape on the wire, the host and the
 * key, and this is the only file that puts the three together.
 *
 * The host is never guessed. It comes from the target table when a model
 * id's spelling names a platform with a published endpoint, or from an
 * endpoint the user set, and from nowhere else: a gateway's spelling such as
 * `openai/gpt-6-luna-decisions` names no host, and sending it to OpenAI
 * would spend the key on a request that fails there.
 *
 * The cutoffs in `cutoffs.ts` were set on the runs listed there. A finding
 * from any other model, or the same model through another host, says so,
 * until that one is calibrated the same way.
 */
export type Provider = Readonly<{
	shape: Shape;
	/** Who is sent the request: the platform's name, or the host of an endpoint the user named. */
	vendor: string;
	/** What answers it, as the messages name it: Jev, Luna, or "the model" where the id says neither. */
	model: string;
	endpoint: string;
	/** The environment variable the command line and the editor read the key from. */
	envKey: string;
	/** The key's slot in the editor, in the keychain and in `ask.keys`: the platform's id, or `endpoint` for a host the user names. */
	slot: string;
	/** True for a host the user runs, whose examples send no key. */
	keyOptional: boolean;
	/** Dollars per million input tokens on the platform's price page, and when that was read. */
	pricePerMillionTokens: number | undefined;
	pricedOn: string | undefined;
	/** The request as the platform wants it. */
	toBody: (request: ReviewRequest) => unknown;
	/** The answers as `runReview` reads them, or why the body is not an answer to `request`. */
	fromBody: (body: unknown, request: ReviewRequest) => Reply | Failure;
}>;

/** How a user says where a check goes, beyond the model id. */
export type Route = Readonly<{
	/** The full URL to post to. Set for a host the user runs, or a gateway spelling that names no host. */
	endpoint?: string | undefined;
	/** The shape to send, where the endpoint's path does not say. */
	shape?: Shape | '' | undefined;
}>;

/** The key slot for a host the user names, beside the platforms' own ids. */
export const ENDPOINT_SLOT = 'endpoint';

/** The two shapes' own vendors, whose key variables a host the user names is sent. */
export const VENDOR_KEYS: Readonly<
	Record<'typesafe' | 'openai', Readonly<{ vendor: string; envKey: string }>>
> = Object.freeze({
	typesafe: { vendor: 'TypeSafe', envKey: 'TYPESAFE_API_KEY' },
	openai: { vendor: 'OpenAI', envKey: 'OPENAI_API_KEY' },
});

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
 * Why `answers` is not an answer to `request`, or undefined when it is.
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

// A check's id can hold dots, `DEC303.0`, and what OpenAI allows in a name is
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

type Wire = Pick<Provider, 'toBody' | 'fromBody'>;

const SYSTEM_ONE: Wire = Object.freeze({
	toBody: (request) => request,
	fromBody: (body, request) => {
		if (!isRecord(body) || !isRecord(body.answers))
			return garbled('the answer was not a System One reply');
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

const DECISIONS: Wire = Object.freeze({
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
	fromBody: (body, request) => {
		if (!isRecord(body) || !Array.isArray(body.answers))
			return garbled('the answer was not a Decisions reply');
		const answers: Record<string, { noul?: number }> = {};
		for (const answer of body.answers) {
			if (!isRecord(answer) || typeof answer.name !== 'string') continue;
			// A refusal is no answer, so the check does not fire. It is not a wrong one.
			if (typeof answer.probability !== 'number') continue;
			answers[fromWireName(answer.name)] = { noul: answer.probability };
		}
		const usage = isRecord(body.usage) ? body.usage.input_tokens : undefined;
		return {
			model: typeof body.model === 'string' ? body.model : request.model,
			answers,
			inputTokens: typeof usage === 'number' ? usage : 0,
		};
	},
});

const WIRES: Readonly<Record<Shape, Wire>> = Object.freeze({
	typesafe: SYSTEM_ONE,
	openai: DECISIONS,
});

/** The only two platforms that answer with a model the messages can name. */
const ANSWERERS: ReadonlyMap<string, string> = new Map([
	['jev', 'Jev'],
	['luna', 'Luna'],
]);

/** What answers a model id, as a message names it. */
function answererOf(model: string): string {
	const family = parseModelId(model)?.family;
	return (family && ANSWERERS.get(family)) ?? 'the model';
}

/** The shape an endpoint's path says it takes, where it says. */
function shapeOfPath(pathname: string): Shape | undefined {
	if (/\/systemone\/?$/.test(pathname)) return 'typesafe';
	if (/\/decisions\/?$/.test(pathname)) return 'openai';
	return undefined;
}

function fromTarget(
	target: Target,
	shape: Shape,
	endpoint: string,
	model: string,
): Provider {
	return Object.freeze({
		shape,
		vendor: target.name,
		model: answererOf(model),
		endpoint,
		// A platform without a variable of its own is reached through the SDK
		// of the shape it takes, which reads that vendor's variable.
		envKey: target.envKey ?? VENDOR_KEYS[shape].envKey,
		slot: target.id,
		keyOptional: false,
		pricePerMillionTokens: target.price?.perMillionInputTokens,
		pricedOn: target.price?.readOn,
		...WIRES[shape],
	});
}

/** A provider for an endpoint the user named, or the sentence that says why there is none. */
function fromEndpoint(
	model: string,
	endpoint: string,
	asked: Shape | undefined,
): Provider | string {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return `'${endpoint}' is not a URL.`;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:')
		return `'${endpoint}' is not an http or https URL.`;
	const target = targetByHost(url.hostname);
	const shape =
		asked ??
		(target?.shapes.length === 1 ? target.shapes[0] : undefined) ??
		shapeOfPath(url.pathname);
	if (!shape)
		return `'${endpoint}' does not say which shape it takes. Set the shape to typesafe or openai.`;
	if (target && !target.shapes.includes(shape))
		return `${target.name} does not take the ${shape} shape.`;
	if (target) return fromTarget(target, shape, endpoint, model);
	// A host the table does not list is one the user runs. The key is the one
	// the shape's SDK would send there, and a runtime may want none.
	return Object.freeze({
		shape,
		vendor: url.host,
		model: answererOf(model),
		endpoint,
		envKey: VENDOR_KEYS[shape].envKey,
		slot: ENDPOINT_SLOT,
		keyOptional: true,
		pricePerMillionTokens: undefined,
		pricedOn: undefined,
		...WIRES[shape],
	});
}

/** Where a check goes when the platform is named outright, as an Ask command names it, or why it cannot. */
export function providerForTarget(
	target: Target,
	model: string,
): Provider | string {
	const shape = target.shapes.find((each) => target.endpoints[each]);
	const endpoint = shape && target.endpoints[shape];
	if (!shape || !endpoint)
		return `${target.name} runs at a host of your own. Set the endpoint it is sent to.`;
	return fromTarget(target, shape, endpoint, model);
}

/**
 * Where a check of `model` goes, or the sentence that says why nothing can
 * be sent. With an endpoint set, that; otherwise the platform the model id's
 * spelling names, when it publishes an endpoint for a shape it takes. The
 * caller adds how an endpoint is set on its own surface.
 */
export function providerFor(
	model: string,
	route: Route = {},
): Provider | string {
	const endpoint = route.endpoint?.trim();
	const asked = route.shape || undefined;
	if (endpoint) return fromEndpoint(model, endpoint, asked);
	const target = targetOfModel(model);
	if (!target)
		return `'${model}' names no platform this tool knows the host of. Set the endpoint it is sent to.`;
	const shape = asked ?? target.shapes.find((each) => target.endpoints[each]);
	const endpointFor = shape && target.endpoints[shape];
	if (!shape || !endpointFor) {
		return asked
			? `${target.name} publishes no endpoint for the ${asked} shape. Set the endpoint it is sent to.`
			: `${target.name} runs at a host of your own. Set the endpoint it is sent to.`;
	}
	return fromTarget(target, shape, endpointFor, model);
}

type Asked = Readonly<{ slot?: string; shape?: Shape }>;

/**
 * True for the version Jev's cutoffs were set on, asked in TypeSafe's shape,
 * and for a run in `MEASURED`: a model with cutoffs of its own at the
 * platform they were fit on, or a route measured to answer as that run does.
 * Jev asked in the Decisions shape through Vercel and LLM Gateway was 0.033
 * from TypeSafe on average and flipped 8 of 1114 verdicts, and the two
 * gateways were 0.010 from each other, so the shape moves the answers, not
 * the gateway or the id. A finding from anything else, another Jev
 * included, carries a caveat.
 */
export function isCalibrated(model: string, asked: Asked = {}): boolean {
	const { slot, shape = 'typesafe' } = asked;
	if (model === MEASURED_ON && shape === 'typesafe') return true;
	return (
		slot !== undefined &&
		MEASURED.some((run) => run.slot === slot && run.model === model)
	);
}

/** The model's name where it starts a sentence: "The model answered", "Jev answered". */
export const asSubject = (model: string): string =>
	model.replace(/^the /, 'The ');

/** A message written for Jev, reworded for the model that answered. */
export function forProvider(message: string, provider: Provider): string {
	if (provider.model === 'Jev') return message;
	return message
		.replace(/\bJev\b/g, provider.model)
		.replace(/(^|[.!?]\s+)the model\b/g, '$1The model');
}
