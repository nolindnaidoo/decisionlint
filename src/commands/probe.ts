import * as vscode from 'vscode';
import { ask, type Failure, type Fetch, isFailure } from '../ask/client';
import { type QuestionLiteral, toLiteral, toPlain } from '../ask/literal';
import {
	buildProbe,
	type ProbeResult,
	readProbe,
	summarize,
} from '../ask/probe';
import type { Provider } from '../ask/provider';
import { readQuestions, syntaxFor } from '../lint/lint';
import { blocked, caution } from '../ui/notifier';
import {
	failureMessage,
	findKey,
	type KeySource,
	providerForSlot,
	refuseUntrusted,
	reportNoKey,
	SEND,
} from './ask';
import { guarded } from './guard';

type Deps = KeySource &
	Readonly<{
		fetch: Fetch;
		wait: (ms: number) => Promise<void>;
	}>;

export const PROBE_COMMAND = 'decisionlint.probeQuestion';

type Target = Readonly<{
	id: string;
	question: QuestionLiteral;
	state: unknown;
}>;

/**
 * The question under the cursor, with the state written beside it. A probe
 * sends the real question against the real state, so it needs both as
 * literals. The reason it cannot run is returned as a sentence for the user.
 */
function targetAt(
	document: vscode.TextDocument,
	offset: number,
): Target | string {
	const extraction = readQuestions(
		document.getText(),
		syntaxFor(document.languageId),
	);
	const question = extraction.questions.find(
		(candidate) =>
			candidate.span.start <= offset && offset <= candidate.span.end,
	);
	if (!question) return 'Put the cursor inside a decision question first.';
	const literal = toLiteral(question);
	if (!literal)
		return 'Part of this question is built at runtime, so it cannot be sent as written.';
	const map =
		question.map === undefined ? undefined : extraction.maps[question.map];
	const state = map?.state ? toPlain(map.state) : undefined;
	if (state === undefined) {
		return 'A probe sends the question against its state, so it needs a request with the state written out in the file.';
	}
	return { id: question.id ?? 'question', question: literal, state };
}

type Probed =
	| Readonly<{ kind: 'done'; results: ReadonlyArray<ProbeResult> }>
	| Readonly<{ kind: 'cancelled'; answered: number; planned: number }>
	| Readonly<{ kind: 'failed'; failure: Failure }>;

async function runProbe(
	deps: Deps,
	target: Target,
	key: string,
	provider: Provider,
	signal: AbortSignal,
	model: string,
): Promise<Probed> {
	const variants = buildProbe(target.state, target.question, model);
	const results: ProbeResult[] = [];
	const cancelled = (): Probed => ({
		kind: 'cancelled',
		answered: results.length,
		planned: variants.length,
	});
	for (const variant of variants) {
		if (signal.aborted) return cancelled();
		const reply = await ask(
			{ fetch: deps.fetch, key, provider, wait: deps.wait, signal },
			variant.request,
		);
		// A request the user cut off fails too, and that is not a failure to report.
		if (signal.aborted && isFailure(reply)) return cancelled();
		if (isFailure(reply)) return { kind: 'failed', failure: reply };
		results.push({ variant, reading: readProbe(variant, reply.answers) });
	}
	// Cancelled while the last answer was on its way back still counts as cancelled.
	if (signal.aborted && results.length < variants.length) return cancelled();
	return { kind: 'done', results };
}

type ShowReport = (id: string, markdown: string) => Promise<boolean>;

async function probeQuestion(deps: Deps, show: ShowReport): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		blocked('No file is open.');
		return;
	}
	// Read once, before the first await, so the key, the count the user agrees
	// to and the requests all name the same model.
	const config = deps.getConfiguration();
	// The variants are built and read in System One's shape, so the probe asks
	// Jev at TypeSafe, with the model Ask Jev sends. Luna's reply for a Choice
	// or a Score is not read yet.
	const routed = providerForSlot(config, 'typesafe');
	if (typeof routed === 'string') {
		blocked(routed);
		return;
	}
	const { provider, model } = routed;
	if (!vscode.workspace.isTrusted) {
		refuseUntrusted(
			`A probe sends a question and its state to ${provider.vendor}`,
		);
		return;
	}
	const target = targetAt(
		editor.document,
		editor.document.offsetAt(editor.selection.active),
	);
	if (typeof target === 'string') {
		blocked(target);
		return;
	}
	const found = await findKey(deps, provider, config);
	if ('missing' in found) {
		reportNoKey(found.missing, provider);
		return;
	}
	const { key } = found;
	const count = buildProbe(target.state, target.question, model).length;
	if (config.ask.confirm) {
		const answer = await vscode.window.showInformationMessage(
			`Probe '${target.id}' with ${count} requests to ${provider.vendor}?`,
			{
				modal: true,
				detail: `${provider.pricePerMillionTokens === undefined ? `${provider.vendor} publishes no price this tool has read.` : 'Under 1¢.'} The question and its state are sent.`,
			},
			SEND,
		);
		if (answer !== SEND) return;
	}
	const probed = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `DecisionLint: probing '${target.id}'`,
			cancellable: true,
		},
		(_progress, token) => {
			const abort = new AbortController();
			token.onCancellationRequested(() => abort.abort());
			return runProbe(deps, target, key, provider, abort.signal, model);
		},
	);
	if (probed.kind === 'failed') {
		blocked(
			`${failureMessage(probed.failure.kind, provider)} (${probed.failure.detail})`,
		);
		return;
	}
	if (probed.kind === 'cancelled') {
		// A report built from some of the variants would compare against repeats that never ran.
		caution(
			`Probe cancelled after ${probed.answered} of ${probed.planned} requests. No report was made, because part of one would mislead.`,
		);
		return;
	}
	const report = summarize(target.id, target.question.type, probed.results);
	const opened = await show(target.id, report.markdown);
	// The requests are already paid for, so the answer is given whatever happens to the page.
	if (!opened)
		blocked(`${report.verdict} The full report could not be opened.`);
}

const REPORT_SCHEME = 'decisionlint-probe';
const KEPT_REPORTS = 20;

/** The report pages, served from memory, and the event that tells an open one to reload. */
type Pages = Readonly<{
	reports: Map<string, string>;
	changed: vscode.EventEmitter<vscode.Uri>;
}>;

/**
 * Shows the report as a rendered page. It is served from memory under its own
 * scheme, so it is read-only and closing it never asks to save, which an
 * untitled document full of Markdown source did.
 */
async function showReport(
	{ reports, changed }: Pages,
	id: string,
	markdown: string,
): Promise<boolean> {
	const uri = vscode.Uri.parse(`${REPORT_SCHEME}:Probe of ${id}.md`);
	// A page is read when it is opened, so only the latest few need keeping.
	reports.delete(uri.toString());
	reports.set(uri.toString(), markdown);
	for (const stale of [...reports.keys()].slice(0, -KEPT_REPORTS))
		reports.delete(stale);
	// A second probe of the same question reuses the page, so it is told to reload.
	changed.fire(uri);
	const preview = vscode.commands.executeCommand('markdown.showPreview', uri);
	// Without the built-in Markdown extension there is no preview. The source is still readable.
	const source = () =>
		vscode.workspace
			.openTextDocument(uri)
			.then((page) => vscode.window.showTextDocument(page, { preview: true }));
	return Promise.resolve(preview)
		.then(undefined, source)
		.then(
			() => true,
			() => false,
		);
}

export function registerProbeCommand(
	deps: Deps,
): ReadonlyArray<vscode.Disposable> {
	// Made here and disposed with the command, not at import: an emitter made
	// at import outlives a deactivation and is shared with the next activation.
	const pages: Pages = {
		reports: new Map(),
		changed: new vscode.EventEmitter<vscode.Uri>(),
	};
	// A second probe would pay for a second set of answers and race the first for the page.
	let probing = false;
	const oneAtATime = async (): Promise<void> => {
		if (probing) {
			blocked('A probe is already running. Wait for its report.');
			return;
		}
		probing = true;
		try {
			await probeQuestion(deps, (id, markdown) =>
				showReport(pages, id, markdown),
			);
		} finally {
			probing = false;
		}
	};
	return [
		vscode.commands.registerCommand(
			PROBE_COMMAND,
			guarded('The probe', oneAtATime),
		),
		vscode.workspace.registerTextDocumentContentProvider(REPORT_SCHEME, {
			onDidChange: pages.changed.event,
			provideTextDocumentContent: (uri: vscode.Uri) =>
				pages.reports.get(uri.toString()) ?? '',
		}),
		pages.changed,
	];
}
