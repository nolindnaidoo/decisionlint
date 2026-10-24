import { MEASURED_ON } from '../lint/limits';
import { readQuestions } from '../lint/lint';
import { RULES } from '../lint/rules';
import { suppressor } from '../lint/suppress';
import { targetById } from '../lint/targets';
import type {
	Extraction,
	Finding,
	LintOptions,
	Question,
	QuestionMap,
	ReportedFinding,
	RuleCode,
	Span,
	Syntax,
} from '../types';
import { ask, type Failure, type Fetch, isFailure, type Reply } from './client';
import { type Cutoffs, cutoffsFor, setOn } from './cutoffs';
import { type QuestionLiteral, toLiteral, toPlain } from './literal';
import {
	asSubject,
	forProvider,
	isCalibrated,
	type Provider,
} from './provider';
import {
	buildRequest,
	buildRequestReview,
	REQUEST_REVIEWS,
	REVIEWS,
	type ReviewRequest,
	readAnswers,
	readRequestAnswers,
} from './reviews';

/** Pinned, because the cutoffs of the Jev-backed checks were set on this version. */
export const DEFAULT_MODEL = MEASURED_ON;
export const DEFAULT_MAX_CALLS = 25;

/** What a run needs to know, wherever it is run from. */
export type ReviewSettings = Readonly<{
	/** The rule levels and what is ignored, for the file under review. */
	lint: LintOptions;
	model: string;
	/** Where the requests go and in what shape, resolved once by the caller, where a refusal can be shown. */
	provider: Provider;
	/** Send the state written out in the file to the checks that read it. */
	sendState: boolean;
	/** The most requests this text may cost. */
	maxCalls: number;
}>;

/** What a run would send, worked out before anything is sent. */
export type ReviewPlan = Readonly<{
	requests: number;
	/** An estimate. See `estimateTokens`. */
	inputTokens: number;
	/** Questions with a part built at runtime. Jev is never shown a question with holes. */
	unreadable: number;
	/** Requests left out because the run would pass the limit. */
	overLimit: number;
	/** True when the plan includes the state written in the file. */
	sendsState: boolean;
}>;

export type ReviewRun = Readonly<{
	/** Requests Jev answered. */
	asked: number;
	/** What Jev flagged in what it answered, less anything silenced in the file or the settings. */
	findings: ReadonlyArray<ReportedFinding>;
	inputTokens: number;
	model: string;
	/** True when the run was stopped before every request was answered. */
	cancelled: boolean;
	/** Why the run ended early, when a request failed. */
	failure: Failure | undefined;
}>;

export type Network = Readonly<{
	fetch: Fetch;
	key: string;
	wait: (ms: number) => Promise<void>;
	signal: AbortSignal;
}>;

type Report = (
	code: RuleCode,
	message: string,
	span: Span,
	questionId: string | undefined,
) => void;

/** One request and what to do with its answers. */
type Job = Readonly<{
	request: ReviewRequest;
	read: (reply: Reply, report: Report) => void;
}>;

type Prepared = Readonly<{
	jobs: ReadonlyArray<Job>;
	unreadable: number;
	overLimit: number;
	sendsState: boolean;
}>;

const REVIEW_CODES: ReadonlyArray<RuleCode> = [
	...REVIEWS.map((review) => review.code),
	'DEC310',
	'DEC312',
];

// Characters of the body on the wire per input token the platform billed,
// over each 304-call calibration run on 2026-10-16: Jev 2.2 at TypeSafe and
// 2.47 to 2.79 through the gateways, d1 2.37, Luna 1.67. Each is rounded down
// so the estimate errs high. A model never measured gets Luna's, the lowest.
const CHARS_PER_TOKEN: ReadonlyMap<string, number> = new Map([['Jev', 2]]);
const UNMEASURED_CHARS_PER_TOKEN = 1.5;

/**
 * An estimate as it is shown: rounded up to two significant figures, so five
 * digits do not read as a measurement and the figure still errs high.
 */
export function roughTokens(estimate: number): string {
	const digits = Math.floor(Math.log10(Math.max(estimate, 1))) + 1;
	const step = 10 ** Math.max(0, digits - 2);
	return (Math.ceil(estimate / step) * step).toLocaleString('en-US');
}

/** Input tokens for a request as `provider` sends it. */
export function estimateTokens(
	request: ReviewRequest,
	provider: Provider,
): number {
	const chars = JSON.stringify(provider.toBody(request)).length;
	const ratio =
		CHARS_PER_TOKEN.get(provider.model) ?? UNMEASURED_CHARS_PER_TOKEN;
	return chars / ratio;
}

// The checks a run asks: the ones not switched off, that have a cutoff on
// the model asked. A check with none there could not tell the examples with
// the defect from those without, so asking it would only spend tokens.
function enabledReviews(
	lint: LintOptions,
	cutoffs: Cutoffs,
): ReadonlySet<string> {
	return new Set(
		REVIEW_CODES.filter(
			(code) =>
				(lint.rules[code] ?? RULES[code].severity) !== 'off' &&
				cutoffs[code as keyof Cutoffs] !== undefined,
		),
	);
}

// The option or level at a position, as the thing to underline and a name to call it by.
function entryOf(
	question: Question,
	index: number,
): Readonly<{ name: string; span: Span }> | undefined {
	const criteria = question.criteria;
	if (criteria?.kind === 'object') {
		const prop = criteria.props[index];
		return prop && { name: prop.key, span: prop.keySpan };
	}
	if (criteria?.kind !== 'array') return undefined;
	const item = criteria.items[index];
	return item && { name: `level ${index}`, span: item.span };
}

// The number behind a finding, and, from a model the cutoffs were not set on, that fact.
function rated(
	probability: number,
	request: ReviewRequest,
	provider: Provider,
): string {
	const number = `(${asSubject(provider.model)} put this at ${probability.toFixed(2)}.)`;
	if (isCalibrated(request.model, provider)) return number;
	const on = setOn(request.model);
	// The same id by another route differs only in how it was reached.
	if (request.model === on.model)
		return `${number} The cutoff was set on ${on.model} at ${targetById(on.slot)?.name}, not through ${provider.vendor}.`;
	// Another Jev is still Jev by name, so only its id tells the two apart.
	return `${number} The cutoff was set on ${on.model}, not on ${request.model}.`;
}

function questionJob(
	question: Question,
	request: ReviewRequest,
	provider: Provider,
	cutoffs: Cutoffs,
): Job {
	return {
		request,
		read: (reply, report) => {
			for (const found of readAnswers(reply.answers, cutoffs)) {
				const places = found.culprits.flatMap(
					(index) => entryOf(question, index) ?? [],
				);
				const named = places.map((place) => `'${place.name}'`).join(' and ');
				report(
					found.code,
					forProvider(
						`${found.message}${named ? ` Jev points at ${named}.` : ''} ${rated(found.probability, request, provider)}`,
						provider,
					),
					places[0]?.span ?? question.anchor,
					question.id,
				);
			}
		},
	};
}

function mapJob(
	map: QuestionMap,
	ids: ReadonlyArray<string>,
	request: ReviewRequest,
	provider: Provider,
	cutoffs: Cutoffs,
): Job {
	const spanOf = (id: string) =>
		map.entries.find((entry) => entry.id === id)?.idSpan;
	return {
		request,
		read: (reply, report) => {
			for (const found of readRequestAnswers(ids, reply.answers, cutoffs)) {
				const pair = found.code === 'DEC310';
				const span = pair
					? spanOf(found.second)
					: (map.stateKey ?? map.entries[0]?.idSpan);
				if (!span) continue;
				const message = pair
					? REQUEST_REVIEWS.DEC310.message(found.first)
					: REQUEST_REVIEWS.DEC312.message;
				report(
					found.code,
					forProvider(
						`${message} ${rated(found.probability, request, provider)}`,
						provider,
					),
					span,
					pair ? found.second : undefined,
				);
			}
		},
	};
}

/**
 * Everything a run would send, in order, built without sending anything. The
 * confirmation the user sees and the run itself both come from this, so the
 * count they agree to is the count that is sent.
 */
function prepare(
	text: string,
	settings: ReviewSettings,
	syntax: Syntax,
): Prepared {
	const extraction: Extraction = readQuestions(text, syntax);
	const { model, provider } = settings;
	const cutoffs = cutoffsFor(model);
	const enabled = enabledReviews(settings.lint, cutoffs);
	const stateOf = (map: QuestionMap | undefined): unknown =>
		settings.sendState && map?.state ? toPlain(map.state) : undefined;
	const jobs: Job[] = [];
	let unreadable = 0;
	let sendsState = false;

	for (const question of extraction.questions) {
		const literal = toLiteral(question);
		if (!literal) {
			unreadable += 1;
			continue;
		}
		const map =
			question.map === undefined ? undefined : extraction.maps[question.map];
		const siblings = (map?.entries ?? [])
			.map((entry) => entry.id)
			.filter((id) => id !== question.id);
		const state = stateOf(map);
		const request = buildRequest(literal, model, enabled, { siblings, state });
		if (!request) continue;
		sendsState ||= 'state' in request.state;
		jobs.push(questionJob(question, request, provider, cutoffs));
	}

	for (const [index, map] of extraction.maps.entries()) {
		const literals: Record<string, QuestionLiteral> = {};
		for (const question of extraction.questions) {
			const literal = question.map === index ? toLiteral(question) : undefined;
			if (literal && question.id !== undefined) literals[question.id] = literal;
		}
		const request = buildRequestReview(literals, model, enabled, stateOf(map));
		if (!request) continue;
		sendsState ||= 'state' in request.state;
		jobs.push(mapJob(map, Object.keys(literals), request, provider, cutoffs));
	}

	const limit = settings.maxCalls;
	return {
		jobs: jobs.slice(0, limit),
		unreadable,
		overLimit: Math.max(0, jobs.length - limit),
		sendsState,
	};
}

/** What a run on this text would send. Nothing is sent. */
export function planReview(
	text: string,
	syntax: Syntax,
	settings: ReviewSettings,
): ReviewPlan {
	const prepared = prepare(text, settings, syntax);
	const tokens = prepared.jobs.reduce(
		(sum, job) => sum + estimateTokens(job.request, settings.provider),
		0,
	);
	return {
		requests: prepared.jobs.length,
		inputTokens: Math.ceil(tokens),
		unreadable: prepared.unreadable,
		overLimit: prepared.overLimit,
		sendsState: prepared.sendsState,
	};
}

/** Sends what `planReview` counted, one request at a time, and reads the answers. */
export async function runReview(
	text: string,
	syntax: Syntax,
	settings: ReviewSettings,
	network: Network,
): Promise<ReviewRun> {
	const { rules, ignore } = settings.lint;
	const findings: ReportedFinding[] = [];
	const report: Report = (code, message, span, questionId) => {
		const severity = rules[code] ?? RULES[code].severity;
		if (severity === 'off') return;
		findings.push({
			code,
			message,
			span,
			questionId,
			fix: undefined,
			severity,
		});
	};
	let asked = 0;
	let inputTokens = 0;
	let model = '';
	let failure: Failure | undefined;
	for (const job of prepare(text, settings, syntax).jobs) {
		if (network.signal.aborted) break;
		const reply = await ask(
			{ ...network, provider: settings.provider },
			job.request,
		);
		// A request the user cut off fails too, and that is not a failure to report.
		if (network.signal.aborted && isFailure(reply)) break;
		// A bad key or a rejected request will fail the same way on every question.
		if (isFailure(reply)) {
			failure = reply;
			break;
		}
		asked += 1;
		inputTokens += reply.inputTokens;
		model = reply.model;
		job.read(reply, report);
	}
	const isSuppressed = suppressor(text);
	return {
		asked,
		findings: findings.filter(
			(finding: Finding) =>
				!isSuppressed(finding) &&
				!ignore.includes(`${finding.code}:${finding.questionId}`),
		),
		inputTokens,
		model,
		cancelled: network.signal.aborted,
		failure,
	};
}
