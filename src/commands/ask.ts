import * as vscode from 'vscode';
import type { Failure } from '../ask/client';
import {
	asSubject,
	type Provider,
	providerFor,
	VENDOR_KEYS,
} from '../ask/provider';
import type { Configuration } from '../config/config';
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

export const JEV_COMMANDS = Object.freeze({
	checkWithJev: 'decisionlint-le.checkWithJev',
	setApiKey: 'decisionlint-le.setApiKey',
	setOpenAIApiKey: 'decisionlint-le.setOpenAIApiKey',
	clearApiKey: 'decisionlint-le.clearApiKey',
});

type Keychain = keyof typeof VENDOR_KEYS;

/** How an endpoint is set in the editor, after the sentence that says one is needed. */
const HOW_TO_ROUTE =
	'Set decisionlint-le.jev.endpoint, and decisionlint-le.jev.shape where its path does not say.';

/** Where each vendor's key sits in the keychain. */
const SECRETS: Readonly<Record<Keychain, string>> = Object.freeze({
	typesafe: 'decisionlint-le.typesafeApiKey',
	openai: 'decisionlint-le.openaiApiKey',
});
const SET_COMMANDS: Readonly<Record<Keychain, string>> = Object.freeze({
	typesafe: JEV_COMMANDS.setApiKey,
	openai: JEV_COMMANDS.setOpenAIApiKey,
});
const KEY_SETTINGS: Readonly<Record<Keychain, string>> = Object.freeze({
	typesafe: 'Jev: Api Key',
	openai: 'Jev: Openai Api Key',
});
export const SEND = 'Send';
/** What to do about an untrusted workspace. Saying only that it is one leaves the user stuck. */
const HOW_TO_TRUST =
	" To turn it on, run 'Workspaces: Manage Workspace Trust' and trust this folder.";

/** Why a run failed, naming the vendor and, for a bad key, the command that sets a new one. */
export function failureMessage(
	kind: Failure['kind'],
	provider: Provider,
): string {
	const { vendor, keychain } = provider;
	const set =
		keychain === 'typesafe' ? 'Set TypeSafe API Key' : 'Set OpenAI API Key';
	const messages: Readonly<Record<Failure['kind'], string>> = {
		key: keychain
			? `${vendor} rejected the API key. Set a new one with "DecisionLint-LE: ${set}".`
			: `${vendor} rejected the API key in ${provider.envKey}.`,
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
	// Only the two vendors with a keychain slot have a command to offer.
	const command = provider.keychain && SET_COMMANDS[provider.keychain];
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
		parts.push(`${plan.overLimit} over the jev.maxCalls limit and not sent`);
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
		return `The file changed while ${model} was answering, so nothing is shown. ${subject} had answered ${outcome.asked} of ${plural(plan.requests, 'request')}. Run the check again.`;
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
	// The vendor's published price on the day it was read. Shown as "about".
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
	provider.keychain
		? `No ${provider.vendor} API key. Set one with the button, in Settings under "DecisionLint-LE: ${KEY_SETTINGS[provider.keychain]}", or as ${provider.envKey} in the environment.`
		: `No ${provider.vendor} API key. Set it as ${provider.envKey} in the environment.`;

/** The key a user typed into settings for a vendor. Empty when it is kept elsewhere, or the vendor has no setting. */
function typedKey(configuration: Configuration, provider: Provider): string {
	if (provider.keychain === 'typesafe') return configuration.jev.apiKey;
	if (provider.keychain === 'openai') return configuration.jev.openaiApiKey;
	return '';
}

/**
 * The key for the vendor the model belongs to, or the sentence that says why
 * there is none. One typed into the user's settings comes first, because it
 * is the one the user can see. Then the keychain, then the environment. A
 * keychain that cannot be read is not the same as one with no key in it.
 * `configuration` is the caller's one reading, so the key and the vendor it
 * is sent to come from the same moment.
 */
export async function findKey(
	deps: KeySource,
	provider: Provider,
	configuration: Configuration,
): Promise<Readonly<{ key: string } | { missing: string }>> {
	const typed = typedKey(configuration, provider);
	if (typed) return { key: typed };
	// Only TypeSafe's and OpenAI's keys have a keychain slot. Every other
	// platform's key, and a host the user runs, is read from the environment.
	const stored = provider.keychain
		? await deps.secrets.get(SECRETS[provider.keychain]).then(
				(key) => ({ key }),
				() => ({ locked: true as const }),
			)
		: { key: undefined };
	const key = ('key' in stored && stored.key) || deps.env[provider.envKey];
	if (key) return { key };
	// A host the user runs may take no key, and then none is sent.
	if (provider.keyOptional) return { key: '' };
	return { missing: 'locked' in stored ? locked(provider) : noKey(provider) };
}

async function checkWithJev(deps: Deps): Promise<void> {
	const document = vscode.window.activeTextEditor?.document;
	if (!document) {
		blocked('No file is open.');
		return;
	}
	// Read once, before the first await. The user can change the model while the
	// confirmation is on screen, and the key, the plan and the run must agree.
	const config = deps.getConfiguration();
	const provider = providerFor(config.jev.model, {
		endpoint: config.jev.endpoint,
		shape: config.jev.shape,
	});
	if (typeof provider === 'string') {
		blocked(`${provider} ${HOW_TO_ROUTE}`);
		return;
	}
	if (!vscode.workspace.isTrusted) {
		refuseUntrusted(
			`Checking with ${provider.model} sends the questions in this file to ${provider.vendor}`,
		);
		return;
	}
	// A second run would pay for the same answers and race the first to show them.
	if (deps.reviewer.running(document)) {
		blocked(`${asSubject(provider.model)} is already checking this file.`);
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
		model: config.jev.model,
		provider,
		sendState: config.jev.sendState,
		maxCalls: config.jev.maxCalls,
	};
	const plan = deps.reviewer.plan(document, settings);
	if (!plan.requests) {
		const why = heldBack(plan).join(', ');
		result(
			`No questions to check in this file${why ? `: ${why}` : ''}. Nothing was sent.`,
		);
		return;
	}
	if (config.jev.confirm) {
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
			title: `DecisionLint-LE: asking ${provider.model} about the questions in this file`,
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

async function setApiKey(deps: Deps, keychain: Keychain): Promise<void> {
	const { vendor } = VENDOR_KEYS[keychain];
	const entered = await vscode.window.showInputBox({
		title: `${vendor} API key`,
		prompt:
			'Stored in your operating system keychain by VS Code, not in a settings file.',
		password: true,
		ignoreFocusOut: true,
	});
	const key = entered?.trim();
	if (!key) return;
	const stored = await deps.secrets.store(SECRETS[keychain], key).then(
		() => true,
		() => false,
	);
	if (!stored) {
		blocked('The key was not stored: the keychain could not be used.');
		return;
	}
	result(`${vendor} API key saved to the keychain.`);
}

// Both vendors' keys go, so one command leaves nothing behind.
async function clearApiKey(deps: Deps): Promise<void> {
	const cleared = await Promise.all(
		Object.values(SECRETS).map((secret) =>
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

export function registerJevCommands(
	deps: Deps,
): ReadonlyArray<vscode.Disposable> {
	return [
		vscode.commands.registerCommand(
			JEV_COMMANDS.checkWithJev,
			guarded('The check with Jev', () => checkWithJev(deps)),
		),
		vscode.commands.registerCommand(
			JEV_COMMANDS.setApiKey,
			guarded('Setting the API key', () => setApiKey(deps, 'typesafe')),
		),
		vscode.commands.registerCommand(
			JEV_COMMANDS.setOpenAIApiKey,
			guarded('Setting the API key', () => setApiKey(deps, 'openai')),
		),
		vscode.commands.registerCommand(
			JEV_COMMANDS.clearApiKey,
			guarded('Clearing the API keys', () => clearApiKey(deps)),
		),
	];
}
