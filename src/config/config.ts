import * as vscode from 'vscode';
import { ENDPOINT_SLOT } from '../ask/provider';
import { DEFAULT_MAX_CALLS } from '../ask/review';
import {
	DEFAULT_FALLBACK_OPTIONS,
	EXTENSIONS,
	MAX_FILE_SIZE_BYTES,
} from '../lint/lint';
import { ASK_TARGETS, type Shape } from '../lint/targets';
import type { LintOptions } from '../types';
import { readLintOptions } from './projectConfig';

/** The settings section, which is the extension's id and stays so for everyone who has it installed. */
export const SECTION = 'decisionlint';

/** `all` shows every message, `important` hides summaries, `silent` shows only why a command could not run. */
export type NotificationsLevel = 'all' | 'important' | 'silent';

/** The key slots: one per platform an Ask command exists for, and one for a host the user names. */
export const KEY_SLOTS: ReadonlyArray<string> = Object.freeze([
	...ASK_TARGETS.map((target) => target.id),
	ENDPOINT_SLOT,
]);

export type Configuration = Readonly<{
	/** The lint settings, or the sentence that says why they cannot be used, as for a settings file. */
	lint: LintOptions | string;
	include: string;
	exclude: string;
	maxFileSizeBytes: number;
	notificationsLevel: NotificationsLevel;
	ask: Readonly<{
		/** The model id each platform's Ask command sends, by the platform's id. */
		models: Readonly<Record<string, string>>;
		/** Each slot's key as typed into the user's settings. Empty when it is kept elsewhere. */
		keys: Readonly<Record<string, string>>;
		/** The full URL Ask the Model at My Endpoint posts to. */
		endpoint: string;
		/** The shape sent to that endpoint, where its path does not say. */
		endpointShape: Shape | '';
		/** The model id sent to that endpoint. */
		endpointModel: string;
		maxCalls: number;
		sendState: boolean;
		confirm: boolean;
	}>;
}>;

const DEFAULT_MODELS: Readonly<Record<string, string>> = Object.freeze(
	Object.fromEntries(
		ASK_TARGETS.map((target) => [target.id, target.defaultModel ?? '']),
	),
);
const EMPTY_KEYS: Readonly<Record<string, string>> = Object.freeze(
	Object.fromEntries(KEY_SLOTS.map((slot) => [slot, ''])),
);

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
	'ask.models': DEFAULT_MODELS,
	'ask.keys': EMPTY_KEYS,
	'ask.endpoint': '',
	'ask.endpointShape': '' as Shape | '',
	'ask.endpointModel': '',
	'ask.maxCalls': DEFAULT_MAX_CALLS,
	'ask.sendState': false,
	'ask.confirm': false,
});

const LEVELS: ReadonlyArray<string> = ['all', 'important', 'silent'];
const SHAPES: ReadonlyArray<string> = ['typesafe', 'openai'];

// An unknown value falls back to the default, which still says when something went wrong.
function readLevel(value: unknown): NotificationsLevel {
	return typeof value === 'string' && LEVELS.includes(value)
		? (value as NotificationsLevel)
		: CONFIG_DEFAULTS.notificationsLevel;
}

// Anything but the two shapes is "not set", which the endpoint's path may still answer.
function readShape(value: unknown): Shape | '' {
	return typeof value === 'string' && SHAPES.includes(value)
		? (value as Shape)
		: '';
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

/**
 * One string per slot out of an object setting, each falling back on its
 * own. The slots come from the table, never from the setting, so a slot the
 * user misspelt is dropped and one they left out keeps its default.
 */
function readBySlot(
	value: unknown,
	defaults: Readonly<Record<string, string>>,
	read: (value: unknown, fallback: string) => string,
): Readonly<Record<string, string>> {
	const given =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return Object.freeze(
		Object.fromEntries(
			Object.keys(defaults).map((slot) => [
				slot,
				read(
					Object.hasOwn(given, slot) ? given[slot] : undefined,
					defaults[slot] ?? '',
				),
			]),
		),
	);
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
		ask: Object.freeze({
			models: readBySlot(
				settings.get('ask.models'),
				DEFAULT_MODELS,
				readString,
			),
			keys: readBySlot(settings.get('ask.keys'), EMPTY_KEYS, (value) =>
				readKey(value),
			),
			endpoint: readKey(settings.get('ask.endpoint')),
			endpointShape: readShape(settings.get('ask.endpointShape')),
			endpointModel: readKey(settings.get('ask.endpointModel')),
			maxCalls: readPositive(
				settings.get('ask.maxCalls'),
				CONFIG_DEFAULTS['ask.maxCalls'],
			),
			// Only a literal true turns it on. State is the user's data, and sending it is their call.
			sendState: settings.get('ask.sendState') === true,
			// Off unless asked for: running the command is itself the decision to send.
			confirm: settings.get('ask.confirm') === true,
		}),
	});
}
