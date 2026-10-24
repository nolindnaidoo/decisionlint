/**
 * Finds the cutoff for each check a model makes.
 *
 * Every corpus question and request is sent with the checks that apply to it,
 * and the probability each returned is saved. A cutoff is then read off the
 * saved numbers, so choosing or changing one costs nothing after the first
 * run: the report prints what `fitCutoff` fits beside what `ask/cutoffs.ts`
 * holds, and `reviews.test.ts` fails until the two agree for any model but Jev. Only checks with no saved number are sent, so adding a check costs one
 * pass over the entries it applies to and not a rerun of everything.
 *
 * A development tool: it costs money, needs a key, and no test runs it.
 *
 *   bun scripts/calibrate-reviews.ts --dry-run
 *   doppler run -- bun scripts/calibrate-reviews.ts
 *   bun scripts/calibrate-reviews.ts --report     read calibration.json, no calls
 *   doppler run -- bun scripts/calibrate-reviews.ts --model gpt-6-luna
 *   doppler run -- bun scripts/calibrate-reviews.ts --platform openrouter
 *
 * `--platform` sends to a row of `TARGETS` on its default model, and
 * `--model` alone to the platform its spelling names. The key is read from
 * that platform's variable. Every pair but TypeSafe on `DEFAULT_MODEL` is
 * saved to its own file, because a probability is only true of the model
 * and route that gave it, and a file per pair keeps a gateway's Jev
 * comparable with TypeSafe's.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ask, type Fetch, isFailure } from '../src/ask/client';
import type { QuestionLiteral } from '../src/ask/literal';
import { type Provider, providerFor, providerForTarget } from '../src/ask/provider';
import { DEFAULT_MODEL } from '../src/ask/review';
import { cutoffsFor, familyOf } from '../src/ask/cutoffs';
import { CHECKS, calibrationFile, fitCutoff, readingsOf } from '../src/docs/calibration';
import { TARGET_IDS, targetById } from '../src/lint/targets';
import {
	buildRequest,
	buildRequestReview,
	REVIEWS,
	type ReviewRequest,
} from '../src/ask/reviews';

type Entry = { id: string; defects: string[]; question: QuestionLiteral; siblings?: string[] };
type RequestEntry = {
	id: string;
	state?: unknown;
	questions: Record<string, QuestionLiteral>;
	overlapping: [string, string][];
	missing?: string[];
	injected?: boolean;
};
type Saved = {
	ranOn: string;
	model: string;
	calls: number;
	inputTokens: number;
	probabilities: Record<string, Record<string, number>>;
};
type Job = { id: string; request: ReviewRequest };
type Reading = { id: string; p: number };

const flag = (name: string): string | undefined => {
	const at = process.argv.indexOf(name);
	return at === -1 ? undefined : process.argv[at + 1];
};
const platform = flag('--platform');
const target = platform === undefined ? undefined : targetById(platform);
if (platform !== undefined && !target) {
	console.error(`'${platform}' is not a platform. The ids are ${TARGET_IDS.join(', ')}.`);
	process.exit(1);
}
const MODEL = flag('--model') ?? target?.defaultModel ?? DEFAULT_MODEL;
const routed = target ? providerForTarget(target, MODEL) : providerFor(MODEL);
if (typeof routed === 'string') {
	console.error(routed);
	process.exit(1);
}
const provider: Provider = routed;
const MAX_CALLS = 400;
const fileName = calibrationFile(provider.slot, MODEL);

const load = <T>(name: string): T =>
	JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const corpus = load<Entry[]>('corpus/questions.json');
const requests = load<RequestEntry[]>('corpus/requests.json');
const out = new URL(`../fixtures/validation/${fileName}`, import.meta.url);
const saved: Saved = existsSync(out)
	? JSON.parse(readFileSync(out, 'utf8'))
	: { ranOn: '', model: '', calls: 0, inputTokens: 0, probabilities: {} };

// The checks an entry still needs: every code with no saved number for it.
const missing = (id: string, codes: string[]) =>
	new Set(codes.filter((code) => saved.probabilities[id]?.[code] === undefined));

function jobs(): Job[] {
	const perQuestion = REVIEWS.map((review) => review.code);
	const list: Job[] = [];
	const add = (id: string, request: ReviewRequest | undefined) => {
		if (request) list.push({ id, request });
	};
	for (const entry of corpus) {
		add(
			entry.id,
			buildRequest(entry.question, MODEL, missing(entry.id, perQuestion), {
				siblings: entry.siblings ?? [],
			}),
		);
	}
	for (const entry of requests) {
		const ids = Object.keys(entry.questions);
		const pairDone = Object.keys(saved.probabilities[entry.id] ?? {}).length > 0;
		if (!pairDone) {
			add(entry.id, buildRequestReview(entry.questions, MODEL, new Set(['DEC310', 'DEC312']), entry.state));
		}
		if (entry.state === undefined) continue;
		for (const id of ids) {
			const key = `${entry.id}/${id}`;
			add(
				key,
				buildRequest(entry.questions[id] as QuestionLiteral, MODEL, missing(key, ['DEC311']), {
					siblings: [],
					state: entry.state,
				}),
			);
		}
	}
	return list;
}

async function collect(key: string, list: Job[]): Promise<void> {
	let calls = 0;
	for (const job of list) {
		if (calls >= MAX_CALLS) throw new Error(`stopped at ${MAX_CALLS} calls`);
		calls += 1;
		const reply = await ask(
			{ fetch: fetch as unknown as Fetch, key, provider, wait: (ms) => new Promise((r) => setTimeout(r, ms)) },
			job.request,
		);
		// Saved before failing, so a run stopped part way keeps what it paid for.
		if (isFailure(reply)) {
			writeFileSync(out, `${JSON.stringify(saved, null, 1)}\n`);
			throw new Error(`${job.id}: ${reply.kind} ${reply.detail}`);
		}
		saved.model = reply.model;
		saved.inputTokens += reply.inputTokens;
		saved.probabilities[job.id] = {
			...saved.probabilities[job.id],
			...Object.fromEntries(Object.entries(reply.answers).map(([code, answer]) => [code, answer.noul ?? 0])),
		};
	}
	saved.calls += calls;
	saved.ranOn = new Date().toISOString().slice(0, 10);
	writeFileSync(out, `${JSON.stringify(saved, null, 1)}\n`);
	console.log(`${calls} calls this run, ${saved.calls} in all, answered by ${saved.model}.`);
}

function show(code: string, bad: Reading[], good: Reading[]): void {
	const by = (list: Reading[]) => [...list].sort((a, b) => a.p - b.p);
	const found = fitCutoff({ bad, good });
	console.log(`\n${code}  bad ${bad.length}  good ${good.length}`);
	console.log(`  bad:      ${by(bad).map((x) => x.p.toFixed(2)).join(' ')}`);
	console.log(`  top good: ${by(good).slice(-5).map((x) => `${x.p.toFixed(2)} ${x.id}`).join(' | ')}`);
	if (found.cutoff !== undefined) {
		console.log(`  fit: ${found.cutoff.toFixed(2)} -> catches ${found.caught} of ${bad.length}`);
		return;
	}
	const lowest = found.lowest > 0.99 ? 'no cutoff sits above the good examples' : `the lowest cutoff above the good examples, ${found.lowest.toFixed(2)}, catches ${found.caught} of ${bad.length} and ${found.needed} are needed`;
	console.log(`  no fit: ${lowest}`);
}

// The fits beside the cutoffs in code for this model's family. Jev's were set by hand and may differ.
function report(): void {
	const cutoffs = cutoffsFor(MODEL);
	for (const code of CHECKS) {
		const { bad, good } = readingsOf(code, saved, corpus, requests);
		show(code, [...bad], [...good]);
	}
	console.log(
		`\ncutoffs in code for ${familyOf(MODEL) || 'no family, so Jev'}: ${CHECKS.map((code) => `${code} ${cutoffs[code as keyof typeof cutoffs] ?? 'not asked'}`).join(', ')}`,
	);
}

async function main(): Promise<void> {
	if (process.argv.includes('--report')) return report();
	const list = jobs();
	if (process.argv.includes('--dry-run')) {
		console.log(`Dry run: ${list.length} calls to ${provider.vendor} on ${MODEL} would be made, saved to ${fileName}. Nothing was sent.`);
		return;
	}
	const key = process.env[provider.envKey];
	if (!key) {
		console.error(`${provider.envKey} is not set. Run under \`doppler run --\`, or pass --dry-run.`);
		process.exit(1);
	}
	await collect(key, list);
	report();
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
