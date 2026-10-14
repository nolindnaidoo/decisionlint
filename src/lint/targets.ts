import type { Dialect } from '../types';
import { LIMITS, MEASURED_ON } from './limits';
import { parseModelId } from './models';

/**
 * Every platform a request can be sent to, as data. A platform is a row
 * here and never a branch in a rule: a rule asks the target for its limits
 * and names it in the message. A limit the platform does not publish is
 * absent, not borrowed from a neighbour, and a rule that needs one stays
 * silent. Each row carries the page it was read from and the date, as
 * `limits.ts` does, and a number enters only from the platform's own page.
 * The research behind the table is in `docs/research/`.
 */

/** The two shapes a request is written in on the wire. The AI SDK's dialect is a client vocabulary that reaches either. */
export type Shape = 'typesafe' | 'openai';

/** A vendor serves its own model, a gateway forwards to vendors, and a runtime is what a user hosts. */
export type TargetKind = 'vendor' | 'gateway' | 'runtime';

export type TargetLimits = Readonly<{
	choiceMaxOptions?: number;
	scoreMaxLevels?: number;
	/** Questions in one request. */
	maxQuestions?: number;
}>;

export type Target = Readonly<{
	id: string;
	/** As a message names it: "LiteLLM accepts at most 128 questions", "Sending 2 requests to TypeSafe". */
	name: string;
	kind: TargetKind;
	shapes: ReadonlyArray<Shape>;
	/** The hosts it is reached at, for an endpoint the user names. Empty for a runtime the user hosts. */
	hosts: ReadonlyArray<string>;
	/** The full URL a request in each shape is posted to, where the platform publishes one. */
	endpoints: Readonly<Partial<Record<Shape, string>>>;
	/** The environment variable the platform's own examples read the key from. */
	envKey: string | undefined;
	/** The id an Ask command sends by default: the platform's own spelling of the measured model, or of what it serves. */
	defaultModel: string | undefined;
	/** Dollars per million input tokens on the platform's price page, and when that was read. */
	price:
		| Readonly<{ perMillionInputTokens: number; readOn: string }>
		| undefined;
	limits: TargetLimits;
	/** The page the row was read from. */
	docs: string;
	verifiedOn: string;
}>;

const TYPESAFE: Target = Object.freeze<Target>({
	id: 'typesafe',
	name: 'TypeSafe',
	kind: 'vendor',
	shapes: ['typesafe'],
	hosts: ['api.typesafe.ai'],
	endpoints: { typesafe: 'https://api.typesafe.ai/v1/systemone' },
	envKey: 'TYPESAFE_API_KEY',
	// The version the checks' cutoffs were set on.
	defaultModel: MEASURED_ON,
	// TypeSafe's published price on the day the checks were calibrated.
	price: { perMillionInputTokens: 0.042, readOn: '2026-10-04' },
	// The numbers in `limits.ts`, which carry their own page and date.
	limits: {
		choiceMaxOptions: LIMITS.choiceMaxOptions,
		scoreMaxLevels: LIMITS.scoreMaxLevels,
	},
	docs: 'https://docs.typesafe.ai/api',
	verifiedOn: '2026-10-14',
});

const OPENAI: Target = Object.freeze<Target>({
	id: 'openai',
	name: 'OpenAI',
	kind: 'vendor',
	shapes: ['openai'],
	hosts: ['api.openai.com'],
	endpoints: { openai: 'https://api.openai.com/v1/decisions' },
	envKey: 'OPENAI_API_KEY',
	// "`gpt-6-luna` is the only model currently available."
	defaultModel: 'gpt-6-luna',
	// OpenAI's published price for the Decisions API beta.
	price: { perMillionInputTokens: 0.1, readOn: '2026-10-08' },
	// The guide states no limit on choices, levels or questions, so none is checked.
	limits: {},
	docs: 'https://developers.openai.com/api/docs/guides/decisions',
	verifiedOn: '2026-10-14',
});

const VERCEL: Target = Object.freeze<Target>({
	id: 'vercel',
	name: 'Vercel AI Gateway',
	kind: 'gateway',
	shapes: ['typesafe', 'openai'],
	hosts: ['ai-gateway.vercel.sh'],
	// Its TypeSafe-compatible base, `/typesafe`, is documented without the
	// path a request is posted to, so only the OpenAI-shaped endpoint is here.
	endpoints: { openai: 'https://ai-gateway.vercel.sh/v1/decisions' },
	envKey: 'AI_GATEWAY_API_KEY',
	defaultModel: 'typesafe-ai/jev',
	price: undefined,
	// On its OpenAI-compatible path: "between 1 and 255 `choices`" and
	// "between 2 and 10 `levels`". Its TypeSafe-compatible path states none.
	limits: { choiceMaxOptions: 255, scoreMaxLevels: 10 },
	docs: 'https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md',
	verifiedOn: '2026-10-14',
});

const LITELLM: Target = Object.freeze<Target>({
	id: 'litellm',
	name: 'LiteLLM',
	kind: 'gateway',
	shapes: ['typesafe', 'openai'],
	// A proxy the user runs, at a host of their own.
	hosts: [],
	endpoints: {},
	envKey: undefined,
	defaultModel: undefined,
	price: undefined,
	// "more than 128 questions, a single-option question or a body that is
	// not JSON returns 400", before anything is sent upstream.
	limits: { maxQuestions: 128 },
	docs: 'https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md',
	verifiedOn: '2026-10-14',
});

const OPENROUTER: Target = Object.freeze<Target>({
	id: 'openrouter',
	name: 'OpenRouter',
	kind: 'gateway',
	shapes: ['typesafe', 'openai'],
	hosts: ['openrouter.ai'],
	// Its OpenAI-shaped route is `/api/alpha/decisions`, alpha, so only the
	// System One one is here. The key variable is the one its curl example
	// reads: https://openrouter.ai/docs/guides/community/typesafe-sdk.md.
	endpoints: { typesafe: 'https://openrouter.ai/api/v1/systemone' },
	envKey: 'OPENROUTER_API_KEY',
	// "**Model ID:** `typesafe/jev-1.13`", the pinned spelling.
	defaultModel: 'typesafe/jev-1.13',
	price: undefined,
	// The guide states the context length and no limit on options, levels or questions.
	limits: {},
	docs: 'https://openrouter.ai/docs/guides/community/jev',
	verifiedOn: '2026-10-14',
});

const LLM_GATEWAY: Target = Object.freeze<Target>({
	id: 'llmgateway',
	name: 'LLM Gateway',
	kind: 'gateway',
	shapes: ['openai', 'typesafe'],
	hosts: ['api.llmgateway.io'],
	// Its `/v1/systemone` is marked "deprecated soon", so only the OpenAI-shaped one is here.
	endpoints: { openai: 'https://api.llmgateway.io/v1/decisions' },
	envKey: 'LLM_GATEWAY_API_KEY',
	// Its ids carry no prefix: "Text-only models such as `jev-1.13.0`".
	defaultModel: 'jev-1.13.0',
	price: undefined,
	limits: {},
	docs: 'https://docs.llmgateway.io/features/decisions',
	verifiedOn: '2026-10-14',
});

const EDEN_AI: Target = Object.freeze<Target>({
	id: 'edenai',
	name: 'Eden AI',
	kind: 'gateway',
	shapes: ['typesafe'],
	// Reached at its own path, `/v3/alpha/decisions`, which the page gives without a host.
	hosts: [],
	endpoints: {},
	envKey: undefined,
	defaultModel: undefined,
	price: undefined,
	// "Up to 255 options."
	limits: { choiceMaxOptions: 255 },
	docs: 'https://www.edenai.co/docs/v3/llms/decisions',
	verifiedOn: '2026-10-14',
});

const LIQUID: Target = Object.freeze<Target>({
	id: 'liquid',
	name: 'Liquid AI',
	kind: 'vendor',
	shapes: ['typesafe'],
	hosts: ['api.liquid.ai'],
	endpoints: { typesafe: 'https://api.liquid.ai/decisions/v1/systemone' },
	envKey: 'LIQUID_API_KEY',
	// "the paid `d1` model. `d1:free` is text-only."
	defaultModel: 'd1',
	price: undefined,
	// The page limits images and body size, and states no limit on options, levels or questions.
	limits: {},
	docs: 'https://docs.liquid.ai/lfm/models/d1',
	verifiedOn: '2026-10-14',
});

const LLAMA_CPP: Target = Object.freeze<Target>({
	id: 'llamacpp',
	name: 'llama.cpp',
	kind: 'runtime',
	shapes: ['typesafe'],
	// A server the user runs. Its examples send no key.
	hosts: [],
	endpoints: {},
	envKey: undefined,
	defaultModel: undefined,
	price: undefined,
	// A Score takes "2 to 10 levels, lowest first".
	limits: { scoreMaxLevels: 10 },
	docs: 'https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp',
	verifiedOn: '2026-10-14',
});

export const TARGETS: ReadonlyArray<Target> = Object.freeze([
	TYPESAFE,
	OPENAI,
	VERCEL,
	LITELLM,
	OPENROUTER,
	LLM_GATEWAY,
	EDEN_AI,
	LIQUID,
	LLAMA_CPP,
]);

export const TARGET_IDS: ReadonlyArray<string> = Object.freeze(
	TARGETS.map((target) => target.id),
);

/** The platforms an Ask command exists for: those with a published endpoint and a default model. */
export const ASK_TARGETS: ReadonlyArray<Target> = Object.freeze(
	TARGETS.filter(
		(target) =>
			target.defaultModel !== undefined &&
			target.shapes.some((shape) => target.endpoints[shape]),
	),
);

export const ASK_PLATFORM_IDS: ReadonlyArray<string> = Object.freeze(
	ASK_TARGETS.map((target) => target.id),
);

// A Map: the id comes from a settings file or an editor setting.
const BY_ID: ReadonlyMap<string, Target> = new Map(
	TARGETS.map((target) => [target.id, target]),
);

/** The target with this id, or undefined for an id the table does not have. */
export function targetById(id: string): Target | undefined {
	return BY_ID.get(id);
}

/** The platform reached at this host, or undefined for a host the table does not list: one the user runs. */
export function targetByHost(host: string): Target | undefined {
	return TARGETS.find((target) => target.hosts.includes(host));
}

/**
 * The platform a model id names by its spelling, or undefined when the
 * spelling does not settle it. `openai/` is written by every gateway, so it
 * resolves to none of them. A bare Jev or Luna id is the vendor's own
 * spelling; a project that sends it through a gateway that takes the bare
 * id says so in its `target` setting.
 */
export function targetOfModel(value: string): Target | undefined {
	const id = parseModelId(value);
	if (!id) return undefined;
	// Only OpenRouter writes the tilde, and only Vercel writes `typesafe-ai/`.
	if (id.prefix === '~typesafe/') return OPENROUTER;
	if (id.prefix === 'typesafe-ai/') return VERCEL;
	if (id.family === 'd1') return LIQUID;
	if (id.prefix !== '') return undefined;
	// LLM Gateway writes `gpt-6-luna-decisions` and `microsoft-decision-1` with no prefix.
	if (id.decisions || id.family === 'decision-1') return LLM_GATEWAY;
	if (id.family === 'luna') return OPENAI;
	return TYPESAFE;
}

/**
 * The limits a question is held to, and who holds it to them: its target's
 * when the target is known, TypeSafe's for a question in TypeSafe's shape
 * sent nobody knows where, and none for any other shape, because borrowing
 * one platform's number for another would report a mistake the API may not
 * make.
 */
export function limitsFor(
	dialect: Dialect,
	target: Target | undefined,
): Readonly<{ owner: string; limits: TargetLimits }> {
	if (target) return { owner: target.name, limits: target.limits };
	if (dialect === 'typesafe')
		return { owner: TYPESAFE.name, limits: TYPESAFE.limits };
	return { owner: '', limits: {} };
}
