import * as vscode from 'vscode';
import type { Failure } from '../ask/client';
import {
	asSubject,
	ENDPOINT_SLOT,
	type Provider,
	providerFor,
	providerForTarget,
} from '../ask/provider';
import type { Configuration } from '../config/config';
import { targetById } from '../lint/targets';
import type { Resolved } from '../services/projectConfigs';
import type {
	Reviewer,
	ReviewOutcome,
	ReviewPlan,
	ReviewSettings,
} from '../services/reviewer';
import { blocked, caution, offer, result } from '../ui/notifier';
import { guarded } from './guard';

/** Where a key can come from. */
export type KeySource = Readonly<{
	getConfiguration: () => Configuration;
	secrets: vscode.SecretStorage;
	/** The environment, passed in so a test can supply one. */
	env: Readonly<Record<string, string | undefined>>;
}>;

type Deps = KeySource &
	Readonly<{
		reviewer: Reviewer;
		lintOptionsFor: (document: vscode.TextDocument) => Resolved;
	}>;

/**
 * One Ask command per platform with a published host, keyed by the
 * platform's id, and one for a host the user names. A command names its
 * platform outright, so nothing is read from a model id's spelling: Ask via
 * OpenRouter sends `ask.models.openrouter` to OpenRouter with the OpenRouter
 * key, whatever the id looks like. The titles are in `package.json`, and
 * `extension.test.ts` holds every declared command to a registered one.
 */
/** A key slot: a platform's id, or `endpoint` for a host the user names. */
export type Slot =
	| 'typesafe'
	| 'openai'
	| 'openrouter'
	| 'vercel'
	| 'llmgateway'
	| 'liquid'
	| typeof ENDPOINT_SLOT;

export const ASK_COMMANDS = Object.freeze({
	ask: Object.freeze({
		typesafe: 'jevlint-le.askJev',
		openai: 'jevlint-le.askLuna',
		openrouter: 'jevlint-le.askOpenRouter',
		vercel: 'jevlint-le.askVercel',
		llmgateway: 'jevlint-le.askLlmGateway',
		liquid: 'jevlint-le.askLiquid',
		[ENDPOINT_SLOT]: 'jevlint-le.askEndpoint',
	}) as Readonly<Record<Slot, string>>,
	setKey: Object.freeze({
		typesafe: 'jevlint-le.setTypeSafeApiKey',
		openai: 'jevlint-le.setOpenAIApiKey',
		openrouter: 'jevlint-le.setOpenRouterApiKey',
		vercel: 'jevlint-le.setVercelApiKey',
		llmgateway: 'jevlint-le.setLlmGatewayApiKey',
		liquid: 'jevlint-le.setLiquidApiKey',
		[ENDPOINT_SLOT]: 'jevlint-le.setEndpointApiKey',
	}) as Readonly<Record<Slot, string>>,
	clearKeys: 'jevlint-le.clearApiKeys',
});

/** The slots, in the order the commands are declared. `extension.test.ts` holds it to the table's platforms. */
export const SLOTS: ReadonlyArray<Slot> = Object.freeze([
	'typesafe',
	'openai',
	'openrouter',
	'vercel',
	'llmgateway',
	'liquid',
	ENDPOINT_SLOT,
]);

/** The title of a slot's Set API Key command, as `package.json` declares it, for a message that points at it. */
const KEY_TITLES: ReadonlyMap<Slot, string> = new Map<Slot, string>([
	['typesafe', 'Set TypeSafe API Key'],
	['openai', 'Set OpenAI API Key'],
	['openrouter', 'Set OpenRouter API Key'],
	['vercel', 'Set Vercel AI Gateway API Key'],
	['llmgateway', 'Set LLM Gateway API Key'],
	['liquid', 'Set Liquid AI API Key'],
	[ENDPOINT_SLOT, 'Set Endpoint API Key'],
]);

/** Where a slot's key sits in the keychain. */
const secretFor = (slot: Slot): string => `decisionlint-le.key.${slot}`;

// Where JevLint-LE kept its two keys. The extension id is the same, so the
// keychain is the same, and a key stored under the old name is still read.
const LEGACY_SECRETS: ReadonlyMap<Slot, string> = new Map<Slot, string>([
	['typesafe', 'jevlint-le.typesafeApiKey'],
	['openai', 'jevlint-le.openaiApiKey'],
]);

/** What a slot is called where a key is asked for. */
const labelOf = (slot: Slot): string => targetById(slot)?.name ?? 'Endpoint';

export const SEND = 'Send';
/** What to do about an untrusted workspace. Saying only that it is one leaves the user stuck. */
const HOW_TO_TRUST =
	" To turn it on, run 'Workspaces: Manage Workspace Trust' and trust this folder.";
const HOW_TO_ROUTE =
	'Set jevlint-le.ask.endpoint to the full URL the host listens at, jevlint-le.ask.endpointShape where its path does not say, and jevlint-le.ask.endpointModel to the model id it serves.';

/** Why a run failed, naming the platform and, for a bad key, the command that sets a new one. */
export function failureMessage(
	kind: Failure['kind'],
	provider: Provider,
): string {
	const { vendor } = provider;
	const set = KEY_TITLES.get(provider.slot as Slot) ?? 'Set Endpoint API Key';
	const messages: Readonly<Record<Failure['kind'], string>> = {
		key: `${vendor} rejected the API key. Set a new one with "DecisionLint-LE: ${set}".`,
		rejected: `${vendor} rejected the request.`,
		busy: `${vendor} is busy or the rate limit was reached. Try again in a moment.`,
		server: `${vendor} had an error of its own. Try again in a moment.`,
		network: `Could not reach ${vendor}.`,
		garbled: `${vendor} did not answer with a decision reply. A proxy or a sign-in page may be in the way.`,
	};
	return messages[kind];
}

const TRUST = Object.freeze({
	button: 'Manage Workspace Trust',
	command: 'workbench.trust.manage',
});
const SET_KEY = 'Set API Key';

/** Says a paid command is off in an untrusted workspace, with the way to trust it. */
export function refuseUntrusted(what: string): void {
	offer(
		`${what}, so it is disabled in an untrusted workspace.${HOW_TO_TRUST}`,
		TRUST.button,
		TRUST.command,
	);
}

/** Says why there is no key. When none was ever set, offers to set one. */
export function reportNoKey(missing: string, provider: Provider): void {
	const command = ASK_COMMANDS.setKey[provider.slot as Slot];
	if (missing !== noKey(provider) || !command) {
		blocked(missing);
		return;
	}
	offer(missing, SET_KEY, command);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// What was not sent, said the same way before a run and after it.
function heldBack(plan: ReviewPlan): ReadonlyArray<string> {
	const parts: string[] = [];
	if (plan.unreadable)
		parts.push(`${plan.unreadable} built at runtime and not sent`);
	if (plan.overLimit)
		parts.push(`${plan.overLimit} over the ask.maxCalls limit and not sent`);
	return parts;
}

function describe(
	outcome: ReviewOutcome,
	plan: ReviewPlan,
	provider: Provider,
): string {
	const { model } = provider;
	const subject = asSubject(model);
	if (outcome.kind === 'stale')
		return `The file changed while ${model} was answering, so nothing is shown. ${subject} had answered ${outcome.asked} of ${plural(plan.requests, 'request')}. Run the command again.`;
	if (outcome.kind === 'failed') {
		const sent = outcome.asked
			? ` after ${plural(outcome.asked, 'request')}`
			: '';
		return `${failureMessage(outcome.failure.kind, provider)} (${outcome.failure.detail})${sent}`;
	}
	// A run the user stopped must not read as one that finished.
	const ran = outcome.cancelled
		? `Cancelled after ${outcome.asked} of ${plural(plan.requests, 'request')}. ${subject} flagged ${outcome.findings} in what it answered`
		: `${subject} answered ${plural(outcome.asked, 'request')} and flagged ${outcome.findings}`;
	const parts = [
		ran,
		`${outcome.inputTokens} input tokens on ${outcome.model || 'no model'}`,
		...heldBack(plan),
	];
	return `${parts.join(', ')}.`;
}

type Prompt = Readonly<{ message: string; detail: string }>;

// One line to answer and one to read: how much, what it costs, what leaves the machine.
function ask(plan: ReviewPlan, provider: Provider): Prompt {
	// The platform's published price on the day it was read. Shown as "about".
	const price = provider.pricePerMillionTokens;
	const cents =
		price === undefined
			? undefined
			: (plan.inputTokens / 1_000_000) * price * 100;
	const cost =
		cents === undefined
			? `${provider.vendor} publishes no price this tool has read`
			: cents < 1
				? 'under 1¢'
				: `about ${Math.ceil(cents)}¢`;
	const state = plan.sendsState
		? 'Your state is sent too.'
		: 'Your state is not sent.';
	// "Skipped" already says they were not sent.
	const skipped = heldBack(plan).map((part) =>
		part.replace(' and not sent', ''),
	);
	return {
		message: `Send ${plural(plan.requests, 'request')} to ${provider.vendor}?`,
		detail: [
			`About ${plan.inputTokens.toLocaleString('en-US')} tokens, ${cost}. ${state}`,
			...(skipped.length ? [`Skipped: ${skipped.join(', ')}.`] : []),
		].join('\n'),
	};
}

const locked = (provider: Provider) =>
	`The keychain could not be read. Unlock it and try again, or set ${provider.envKey} in the environment.`;
const noKey = (provider: Provider) =>
	`No ${provider.vendor} API key. Set one with the button, in Settings under "DecisionLint-LE: Ask: Keys" as ${provider.slot}, or as ${provider.envKey} in the environment.`;

/**
 * The key for the slot the provider names, or the sentence that says why
 * there is none. One typed into the user's settings comes first, because it
 * is the one the user can see. Then the keychain, then the environment. A
 * keychain that cannot be read is not the same as one with no key in it.
 * `configuration` is the caller's one reading, so the key and the platform
 * it is sent to come from the same moment.
 */
export async function findKey(
	deps: KeySource,
	provider: Provider,
	configuration: Configuration,
): Promise<Readonly<{ key: string } | { missing: string }>> {
	const typed = configuration.ask.keys[provider.slot] ?? '';
	if (typed) return { key: typed };
	const stored = await deps.secrets.get(secretFor(provider.slot as Slot)).then(
		(key) => ({ key }),
		() => ({ locked: true as const }),
	);
	const legacy = LEGACY_SECRETS.get(provider.slot as Slot);
	const kept =
		legacy && 'key' in stored && !stored.key
			? await deps.secrets.get(legacy).then(
					(key) => key,
					() => undefined,
				)
			: undefined;
	const key =
		('key' in stored && stored.key) || kept || deps.env[provider.envKey];
	if (key) return { key };
	// A host the user runs may take no key, and then none is sent.
	if (provider.keyOptional) return { key: '' };
	return { missing: 'locked' in stored ? locked(provider) : noKey(provider) };
}

type Routed = Readonly<{ provider: Provider; model: string }>;

/**
 * Where a slot's command sends, from one reading of the configuration: the
 * platform's published endpoint and its model setting, or the endpoint the
 * user named with the shape and model they set for it. Or why it cannot.
 */
export function providerForSlot(
	configuration: Configuration,
	slot: Slot,
): Routed | string {
	const { ask } = configuration;
	if (slot === ENDPOINT_SLOT) {
		if (!ask.endpoint) return `No endpoint is set. ${HOW_TO_ROUTE}`;
		if (!ask.endpointModel)
			return `No model is set for the endpoint. ${HOW_TO_ROUTE}`;
		const provider = providerFor(ask.endpointModel, {
			endpoint: ask.endpoint,
			shape: ask.endpointShape,
		});
		return typeof provider === 'string'
			? `${provider} ${HOW_TO_ROUTE}`
			: { provider, model: ask.endpointModel };
	}
	const target = targetById(slot);
	if (!target) return `'${slot}' is not a platform this tool knows.`;
	const model = ask.models[slot] || target.defaultModel || '';
	const provider = providerForTarget(target, model);
	return typeof provider === 'string' ? provider : { provider, model };
}

async function askModel(deps: Deps, slot: Slot): Promise<void> {
	const document = vscode.window.activeTextEditor?.document;
	if (!document) {
		blocked('No file is open.');
		return;
	}
	// Read once, before the first await. The user can change a setting while the
	// confirmation is on screen, and the key, the plan and the run must agree.
	const config = deps.getConfiguration();
	const routed = providerForSlot(config, slot);
	if (typeof routed === 'string') {
		blocked(routed);
		return;
	}
	const { provider, model } = routed;
	if (!vscode.workspace.isTrusted) {
		refuseUntrusted(
			`Asking ${provider.model} sends the questions in this file to ${provider.vendor}`,
		);
		return;
	}
	// A second run would pay for the same answers and race the first to show them.
	if (deps.reviewer.running(document)) {
		blocked(
			`${asSubject(provider.model)} is already answering about this file.`,
		);
		return;
	}
	const found = await findKey(deps, provider, config);
	if ('missing' in found) {
		reportNoKey(found.missing, provider);
		return;
	}
	const { key } = found;
	const resolved = deps.lintOptionsFor(document);
	if ('problem' in resolved) {
		blocked(resolved.problem);
		return;
	}
	const settings: ReviewSettings = {
		lint: resolved.options,
		model,
		provider,
		sendState: config.ask.sendState,
		maxCalls: config.ask.maxCalls,
	};
	const plan = deps.reviewer.plan(document, settings);
	if (!plan.requests) {
		const why = heldBack(plan).join(', ');
		result(
			`No questions to ask about in this file${why ? `: ${why}` : ''}. Nothing was sent.`,
		);
		return;
	}
	if (config.ask.confirm) {
		// A modal settles only when the user answers, so this one is awaited.
		const prompt = ask(plan, provider);
		const answer = await vscode.window.showInformationMessage(
			prompt.message,
			{ modal: true, detail: prompt.detail },
			SEND,
		);
		if (answer !== SEND) return;
	}
	const outcome = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `DecisionLint-LE: asking ${provider.model} at ${provider.vendor} about the questions in this file`,
			cancellable: true,
		},
		(_progress, token) => {
			const abort = new AbortController();
			token.onCancellationRequested(() => abort.abort());
			return deps.reviewer.review(document, key, abort.signal, settings);
		},
	);
	const message = describe(outcome, plan, provider);
	if (outcome.kind === 'failed') {
		blocked(message);
		return;
	}
	// A run that was stopped is worth saying even to someone who hides summaries.
	if (outcome.kind === 'stale' || outcome.cancelled) {
		caution(message);
		return;
	}
	result(message);
}

async function setApiKey(deps: Deps, slot: Slot): Promise<void> {
	const label = labelOf(slot);
	const entered = await vscode.window.showInputBox({
		title: `${label} API key`,
		prompt:
			'Stored in your operating system keychain by VS Code, not in a settings file.',
		password: true,
		ignoreFocusOut: true,
	});
	const key = entered?.trim();
	if (!key) return;
	const stored = await deps.secrets.store(secretFor(slot), key).then(
		() => true,
		() => false,
	);
	if (!stored) {
		blocked('The key was not stored: the keychain could not be used.');
		return;
	}
	result(`${label} API key saved to the keychain.`);
}

// Every slot's key goes, so one command leaves nothing behind.
async function clearApiKeys(deps: Deps): Promise<void> {
	const cleared = await Promise.all(
		[...SLOTS.map(secretFor), ...LEGACY_SECRETS.values()].map((secret) =>
			deps.secrets.delete(secret).then(
				() => true,
				() => false,
			),
		),
	);
	if (cleared.includes(false)) {
		blocked('The keys are unchanged: the keychain could not be used.');
		return;
	}
	result('API keys removed from the keychain.');
}

export function registerAskCommands(
	deps: Deps,
): ReadonlyArray<vscode.Disposable> {
	return [
		...SLOTS.map((slot) =>
			vscode.commands.registerCommand(
				ASK_COMMANDS.ask[slot],
				guarded(`Asking ${labelOf(slot)}`, () => askModel(deps, slot)),
			),
		),
		...SLOTS.map((slot) =>
			vscode.commands.registerCommand(
				ASK_COMMANDS.setKey[slot],
				guarded('Setting the API key', () => setApiKey(deps, slot)),
			),
		),
		vscode.commands.registerCommand(
			ASK_COMMANDS.clearKeys,
			guarded('Clearing the API keys', () => clearApiKeys(deps)),
		),
	];
}
