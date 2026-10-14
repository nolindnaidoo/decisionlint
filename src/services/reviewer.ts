import * as vscode from 'vscode';
import type { Failure, Fetch } from '../ask/client';
import {
	planReview,
	type ReviewPlan,
	type ReviewSettings,
	runReview,
} from '../ask/review';
import { syntaxFor } from '../lint/lint';
import { toDiagnostic } from '../ui/diagnostics';

export type { ReviewPlan, ReviewSettings };

export type ReviewOutcome =
	| Readonly<{
			kind: 'done';
			/** Requests Jev answered. */
			asked: number;
			/** True when the user stopped the run before every request was answered. */
			cancelled: boolean;
			findings: number;
			inputTokens: number;
			model: string;
	  }>
	| Readonly<{ kind: 'failed'; failure: Failure; asked: number }>
	/** The document was edited or closed during the run, so what Jev said is about text that is gone. */
	| Readonly<{ kind: 'stale'; asked: number }>;

export type Reviewer = Readonly<{
	/**
	 * `settings` is the caller's one reading of the configuration, taken before
	 * its first await. Read here instead, the model could change between the
	 * plan the user agreed to and the run, and the key would go to the wrong vendor.
	 */
	plan: (document: vscode.TextDocument, settings: ReviewSettings) => ReviewPlan;
	review: (
		document: vscode.TextDocument,
		key: string,
		signal: AbortSignal,
		settings: ReviewSettings,
	) => Promise<ReviewOutcome>;
	/** True while a run on this document is still sending. */
	running: (document: vscode.TextDocument) => boolean;
	/** Drops what Jev said about a document, and ends a run on it that is still sending. */
	clear: (document: vscode.TextDocument) => void;
	dispose: () => void;
}>;

type Deps = Readonly<{
	fetch: Fetch;
	wait: (ms: number) => Promise<void>;
}>;

/** Runs the Jev checks in `jev/review.ts` over a document and shows what they find. */
export function createReviewer(deps: Deps): Reviewer {
	// A separate collection, so linting as you type never wipes what a paid check found.
	const collection =
		vscode.languages.createDiagnosticCollection('decisionlint-jev');

	// The runs still sending, by document. An edit or a close marks the run as
	// overtaken and stops it, so it neither spends more nor reports on old text.
	const flights = new Map<
		string,
		{ stop: AbortController; overtaken: boolean }
	>();

	const plan = (
		document: vscode.TextDocument,
		settings: ReviewSettings,
	): ReviewPlan =>
		planReview(document.getText(), syntaxFor(document.languageId), settings);

	const review = async (
		document: vscode.TextDocument,
		key: string,
		signal: AbortSignal,
		settings: ReviewSettings,
	): Promise<ReviewOutcome> => {
		const id = document.uri.toString();
		const flight = { stop: new AbortController(), overtaken: false };
		const stop = () => flight.stop.abort();
		signal.addEventListener('abort', stop, { once: true });
		if (signal.aborted) stop();
		flights.set(id, flight);
		const run = await runReview(
			document.getText(),
			syntaxFor(document.languageId),
			settings,
			{ fetch: deps.fetch, wait: deps.wait, key, signal: flight.stop.signal },
		).finally(() => {
			flights.delete(id);
			signal.removeEventListener('abort', stop);
		});
		if (flight.overtaken) return { kind: 'stale', asked: run.asked };
		// What was answered before a failure is dropped: the message says the run failed.
		if (run.failure)
			return { kind: 'failed', failure: run.failure, asked: run.asked };
		collection.set(
			document.uri,
			run.findings.map((finding) => toDiagnostic(document, finding)),
		);
		return {
			kind: 'done',
			asked: run.asked,
			cancelled: run.cancelled,
			findings: run.findings.length,
			inputTokens: run.inputTokens,
			model: run.model,
		};
	};

	return Object.freeze({
		plan,
		review,
		running: (document: vscode.TextDocument) =>
			flights.has(document.uri.toString()),
		clear: (document: vscode.TextDocument) => {
			const flight = flights.get(document.uri.toString());
			if (flight) {
				flight.overtaken = true;
				flight.stop.abort();
			}
			collection.delete(document.uri);
		},
		dispose: () => {
			for (const flight of flights.values()) flight.stop.abort();
			collection.dispose();
		},
	});
}
