import type { Failure } from '../ask/client';
import {
	type Provider,
	providerFor,
	providerForTarget,
	type Route,
} from '../ask/provider';
import {
	DEFAULT_MAX_CALLS,
	DEFAULT_MODEL,
	type Network,
	planReview,
	type ReviewSettings,
	runReview,
} from '../ask/review';
import { syntaxForPath } from '../lint/lint';
import { ASK_PLATFORM_IDS, targetById } from '../lint/targets';
import type { LintOptions } from '../types';
import type { CliOptions } from './args';
import type { AskTotals, FileReport } from './format';

/** One file's share of the run: the settings it is checked under and what that will send. */
type Share = Readonly<{
	report: FileReport;
	settings: ReviewSettings;
	requests: number;
}>;

export type AskPlan = Readonly<{
	shares: ReadonlyArray<Share>;
	totals: AskTotals;
}>;

export type AskRun = Readonly<{
	reports: ReadonlyArray<FileReport>;
	totals: AskTotals;
	failure: Failure | undefined;
	stopped: boolean;
}>;

/** Why a run ended early, naming the vendor it was talking to. */
export function failureMessage(
	kind: Failure['kind'],
	provider: Provider,
): string {
	const { vendor } = provider;
	const messages: Readonly<Record<Failure['kind'], string>> = {
		key: `${vendor} rejected the API key`,
		rejected: `${vendor} rejected the request`,
		busy: `${vendor} is busy or the rate limit was reached`,
		server: `${vendor} had an error of its own`,
		network: `Could not reach ${vendor}`,
		garbled: `${vendor} did not answer with a decision reply`,
	};
	return messages[kind];
}

/** The environment variables that stand in for `--ask-endpoint` and `--ask-shape`, for a server started without flags. */
export const ROUTE_ENV = Object.freeze({
	endpoint: 'DECISIONLINT_ASK_ENDPOINT',
	shape: 'DECISIONLINT_ASK_SHAPE',
});

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where a run's requests go: the flags, else the environment the process was
 * started with. Never a project's `.env` file, which `cli/dotenv.ts` reads
 * only for a key: a cloned repository could otherwise point that key at a
 * host of its choosing.
 */
export function routeFrom(
	options: Pick<CliOptions, 'askEndpoint' | 'askShape'>,
	env: Env,
): Route | string {
	const endpoint = options.askEndpoint ?? env[ROUTE_ENV.endpoint]?.trim();
	const shape = options.askShape ?? env[ROUTE_ENV.shape]?.trim();
	if (shape && shape !== 'typesafe' && shape !== 'openai')
		return `${ROUTE_ENV.shape} is '${shape}', which is not a shape. Use typesafe or openai.`;
	return { endpoint, shape: shape as Route['shape'] };
}

/** Where the model named by the flags is sent, or why it cannot be, with how to say where on the command line. */
/** Where a run goes and the model it sends, resolved once, or why it cannot be. */
export type Routed = Readonly<{ provider: Provider; model: string }>;

/**
 * Where the flags send, or why they cannot, with how to say where on the
 * command line. A platform named outright wins, with its default model where
 * none is given. Else an endpoint, else what the model id's spelling says.
 */
export function providerFromFlags(
	options: Pick<
		CliOptions,
		'askPlatform' | 'askModel' | 'askEndpoint' | 'askShape'
	>,
	env: Env,
): Routed | string {
	const route = routeFrom(options, env);
	if (typeof route === 'string') return route;
	if (options.askPlatform) {
		if (route.endpoint)
			return '--ask-platform and --ask-endpoint name two places. Use one of them.';
		const target = targetById(options.askPlatform);
		if (!target || !target.defaultModel)
			return `'${options.askPlatform}' is not a platform. Use one of ${ASK_PLATFORM_IDS.join(', ')}.`;
		const model = options.askModel ?? target.defaultModel;
		const provider = providerForTarget(target, model);
		return typeof provider === 'string' ? provider : { provider, model };
	}
	const model = options.askModel ?? DEFAULT_MODEL;
	const provider = providerFor(model, route);
	return typeof provider === 'string'
		? `${provider} Use --ask-endpoint, and --ask-shape where its path does not say, or --ask-platform.`
		: { provider, model };
}

/**
 * What the run would send, file by file, with nothing sent. The limit is for
 * the whole run: each file is planned with what the files before it left.
 * The run sends from these same shares, so the count said is the count sent.
 */
/** What the plan reads of the flags, so the MCP server can hand it the same three from a tool's arguments. */
export type AskOptions = Pick<CliOptions, 'askMaxCalls' | 'askSendState'> &
	Routed;

export function planAsk(
	reports: ReadonlyArray<FileReport>,
	optionsFor: (file: string) => LintOptions | string,
	options: AskOptions,
): AskPlan | string {
	const { model } = options;
	let left = options.askMaxCalls ?? DEFAULT_MAX_CALLS;
	let totals: AskTotals = {
		sent: false,
		planned: 0,
		answered: 0,
		runtime: 0,
		overLimit: 0,
		estimatedInputTokens: 0,
		inputTokens: 0,
		model,
		vendor: options.provider.vendor,
		answerer: options.provider.model,
		state: false,
	};
	const shares: Share[] = [];
	for (const report of reports) {
		const lint = optionsFor(report.path);
		if (typeof lint === 'string') return lint;
		const settings: ReviewSettings = {
			lint,
			model,
			provider: options.provider,
			sendState: options.askSendState,
			maxCalls: left,
		};
		const plan = planReview(
			report.text,
			syntaxForPath(report.path) ?? 'js',
			settings,
		);
		left -= plan.requests;
		totals = {
			...totals,
			planned: totals.planned + plan.requests,
			runtime: totals.runtime + plan.unreadable,
			overLimit: totals.overLimit + plan.overLimit,
			estimatedInputTokens: totals.estimatedInputTokens + plan.inputTokens,
			state: totals.state || plan.sendsState,
		};
		shares.push({ report, settings, requests: plan.requests });
	}
	return { shares, totals };
}

function withFindings(share: Share, found: FileReport['findings']): FileReport {
	if (!found.length) return share.report;
	return {
		...share.report,
		findings: [...share.report.findings, ...found].sort(
			(a, b) => a.span.start - b.span.start,
		),
	};
}

/** Sends the plan. A failed request or a stop ends the sending, and the files after it are left as linted. */
export async function runAsk(
	plan: AskPlan,
	network: Network,
	quiet: boolean,
): Promise<AskRun> {
	const reports: FileReport[] = [];
	let { totals } = plan;
	let failure: Failure | undefined;
	let stopped = false;
	for (const share of plan.shares) {
		if (failure || stopped || !share.requests) {
			reports.push(share.report);
			continue;
		}
		const run = await runReview(
			share.report.text,
			syntaxForPath(share.report.path) ?? 'js',
			share.settings,
			network,
		);
		totals = {
			...totals,
			answered: totals.answered + run.asked,
			inputTokens: totals.inputTokens + run.inputTokens,
			model: run.model || totals.model,
		};
		failure = run.failure;
		stopped = run.cancelled;
		reports.push(
			withFindings(
				share,
				quiet
					? run.findings.filter((finding) => finding.severity === 'error')
					: run.findings,
			),
		);
	}
	return { reports, totals: { ...totals, sent: true }, failure, stopped };
}
