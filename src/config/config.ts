import * as vscode from 'vscode';
import { DEFAULT_MAX_CALLS, DEFAULT_MODEL } from '../ask/review';
import {
	DEFAULT_FALLBACK_OPTIONS,
	EXTENSIONS,
	MAX_FILE_SIZE_BYTES,
} from '../lint/lint';
import type { Shape } from '../lint/targets';
import type { LintOptions } from '../types';
import { readLintOptions } from './projectConfig';

export const SECTION = 'decisionlint-le';

/** `all` shows every message, `important` hides summaries, `silent` shows only why a command could not run. */
export type NotificationsLevel = 'all' | 'important' | 'silent';

export type Configuration = Readonly<{
	/** The lint settings, or the sentence that says why they cannot be used, as for a settings file. */
	lint: LintOptions | string;
	include: string;
	exclude: string;
	maxFileSizeBytes: number;
	notificationsLevel: NotificationsLevel;
	jev: Readonly<{
		model: string;
		maxCalls: number;
		sendState: boolean;
		confirm: boolean;
		/** The TypeSafe key as typed into the user's settings. Empty when it is kept elsewhere. */
		apiKey: string;
		/** The OpenAI key the same way, for `gpt-6-luna`. */
		openaiApiKey: string;
		/** The full URL to post to, for a host the user runs. Empty sends a model id where its spelling says. */
		endpoint: string;
		/** The shape sent to that endpoint, where its path does not say. */
		shape: Shape | '';
	}>;
}>;

/** Must equal the defaults declared in package.json. `extension.test.ts` holds the two together. */
export const CONFIG_DEFAULTS = Object.freeze({
	rules: Object.freeze({}),
	fallbackOptions: DEFAULT_FALLBACK_OPTIONS,
	ignore: Object.freeze([] as string[]),
	target: '',
	include: `**/*.{${[...EXTENSIONS.keys()].join(',')}}`,
	exclude: '**/{node_modules,dist,out,build,coverage,.git}/**',
	maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
	notificationsLevel: 'important' as NotificationsLevel,
	'jev.model': DEFAULT_MODEL,
	'jev.maxCalls': DEFAULT_MAX_CALLS,
	'jev.sendState': false,
	'jev.confirm': false,
	'jev.apiKey': '',
	'jev.openaiApiKey': '',
	'jev.endpoint': '',
	'jev.shape': '' as Shape | '',
});

const SHAPES: ReadonlyArray<string> = ['typesafe', 'openai'];

// Anything but the two shapes is "not set", which the endpoint's path may still answer.
function readShape(value: unknown): Shape | '' {
	return typeof value === 'string' && SHAPES.includes(value)
		? (value as Shape)
		: '';
}

const LEVELS: ReadonlyArray<string> = ['all', 'important', 'silent'];

// An unknown value falls back to the default, which still says when something went wrong.
function readLevel(value: unknown): NotificationsLevel {
	return typeof value === 'string' && LEVELS.includes(value)
		? (value as NotificationsLevel)
		: CONFIG_DEFAULTS.notificationsLevel;
}

function readKey(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function readString(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value : fallback;
}

function readPositive(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? value
		: fallback;
}

// The settings file's reader, so the two refuse the same things in the same
// words. An entry dropped quietly here once left a typo'd rule on with no word.
function readLint(
	settings: vscode.WorkspaceConfiguration,
): LintOptions | string {
	const read = readLintOptions({
		rules: settings.get('rules'),
		fallbackOptions: settings.get('fallbackOptions'),
		ignore: settings.get('ignore'),
		target: settings.get('target'),
	});
	return typeof read === 'string' ? `${SECTION} settings: ${read}` : read;
}

export function getConfiguration(): Configuration {
	const settings = vscode.workspace.getConfiguration(SECTION);
	return Object.freeze({
		lint: readLint(settings),
		notificationsLevel: readLevel(settings.get('notificationsLevel')),
		include: readString(settings.get('include'), CONFIG_DEFAULTS.include),
		exclude: readString(settings.get('exclude'), CONFIG_DEFAULTS.exclude),
		maxFileSizeBytes: readPositive(
			settings.get('maxFileSizeBytes'),
			CONFIG_DEFAULTS.maxFileSizeBytes,
		),
		jev: Object.freeze({
			model: readString(
				settings.get('jev.model'),
				CONFIG_DEFAULTS['jev.model'],
			),
			maxCalls: readPositive(
				settings.get('jev.maxCalls'),
				CONFIG_DEFAULTS['jev.maxCalls'],
			),
			// Only a literal true turns it on. State is the user's data, and sending it is their call.
			sendState: settings.get('jev.sendState') === true,
			// Off unless asked for: running the command is itself the decision to send.
			confirm: settings.get('jev.confirm') === true,
			apiKey: readKey(settings.get('jev.apiKey')),
			openaiApiKey: readKey(settings.get('jev.openaiApiKey')),
			endpoint: readKey(settings.get('jev.endpoint')),
			shape: readShape(settings.get('jev.shape')),
		}),
	});
}
