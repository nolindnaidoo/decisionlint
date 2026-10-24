/**
 * Draws a sample of decision-model questions from public code, for
 * hand-labelling.
 *
 * It searches GitHub for files that call Jev or OpenAI's Decisions API, reads
 * the questions out of them with this repo's own readers, drops every
 * repository and question an earlier sample used, shuffles what is left with
 * a fixed seed, and takes at most three per repository.
 *
 * The question text is written to the path given and nowhere else. Those
 * files carry their own licenses, so the text never goes in this repo: only
 * labels and hashes do. Label the output by hand BEFORE running any rule
 * over it, or the labels measure nothing.
 *
 *   bun scripts/draw-public-sample.ts <out.json> [--size 300] [--seed 2] [--max-files 1200]
 *
 * It needs `gh` signed in. It calls GitHub only, never TypeSafe.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toLiteral } from '../src/ask/literal';
import { readQuestions, syntaxForPath } from '../src/lint/lint';

const root = join(import.meta.dir, '..');
const out = process.argv[2];
const flag = (name: string, fallback: number) => {
	const at = process.argv.indexOf(name);
	return at === -1 ? fallback : Number(process.argv[at + 1]);
};
const SIZE = flag('--size', 300);
const SEED = flag('--seed', 2);
const PER_REPO = 3;
const PAGES = 3;
// Code search allows ten requests a minute.
const SEARCH_PAUSE_MS = 7000;
// Files read, out of those found. Each is one request, and the hour allows
// 5,000. The first three samples read 900; the fourth needed 3,000, since
// 1,200 held only 242 unused questions.
const MAX_FILES = flag('--max-files', 1200);

if (!out) {
	console.error('Give a path to write the sample to, outside this repository.');
	process.exit(2);
}

// The same three markers the first sample was found by, split by language so
// no one query runs into the thousand-result ceiling of code search. The
// OpenAI queries were added for the fourth sample: its callers had been read
// since 0.5.0 and never sampled, and the pool of Jev callers was running down.
const QUERIES = [
	'"@typesafe-ai/sdk" language:TypeScript',
	'"@typesafe-ai/sdk" language:JavaScript',
	'"typesafe_sdk" language:Python',
	'"api.typesafe.ai/v1/systemone" language:Python',
	'"api.typesafe.ai/v1/systemone" language:TypeScript',
	'"api.typesafe.ai/v1/systemone" language:JavaScript',
	'"api.typesafe.ai/v1/systemone" language:Go',
	'"api.typesafe.ai/v1/systemone" language:Rust',
	'"api.typesafe.ai/v1/systemone" language:JSON',
	'"decisions.create" "openai" language:TypeScript',
	'"decisions.create" "openai" language:JavaScript',
	'"decisions.create" "openai" language:Python',
	'"gpt-6-luna" language:TypeScript',
	'"gpt-6-luna" language:JavaScript',
	'"gpt-6-luna" language:Python',
	'"gpt-6-luna" language:JSON',
	'"DecisionNewParams" language:Go',
	'"/v1/decisions" language:Go',
	'"/v1/decisions" language:Rust',
];

function gh(args: ReadonlyArray<string>): string | undefined {
	const run = Bun.spawnSync(['gh', 'api', ...args], { stdout: 'pipe', stderr: 'pipe' });
	return run.exitCode === 0 ? run.stdout.toString() : undefined;
}

const hashOf = (text: string) =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

// Everything an earlier sample used is spent, whether or not it was labelled a defect.
function spent(): { repos: Set<string>; hashes: Set<string> } {
	const repos = new Set<string>();
	const hashes = new Set<string>();
	for (const dir of readdirSync(join(root, 'fixtures'))) {
		const labels = join(root, 'fixtures', dir, 'labels.json');
		if (!dir.startsWith('public-sample') || !existsSync(labels)) continue;
		for (const entry of JSON.parse(readFileSync(labels, 'utf8'))) {
			repos.add(entry.repo);
			hashes.add(entry.hash);
		}
	}
	return { repos, hashes };
}

type Hit = { repo: string; path: string };

async function search(): Promise<Hit[]> {
	const hits = new Map<string, Hit>();
	for (const query of QUERIES) {
		for (let page = 1; page <= PAGES; page += 1) {
			const body = gh(['-X', 'GET', 'search/code', '-f', `q=${query}`, '-f', 'per_page=100', '-f', `page=${page}`]);
			await Bun.sleep(SEARCH_PAUSE_MS);
			if (!body) break;
			const items = JSON.parse(body).items ?? [];
			for (const item of items) {
				const hit = { repo: item.repository.full_name as string, path: item.path as string };
				if (syntaxForPath(hit.path)) hits.set(`${hit.repo}:${hit.path}`, hit);
			}
			console.error(`${query} page ${page}: ${items.length} files, ${hits.size} in all`);
			if (items.length < 100) break;
		}
	}
	return [...hits.values()];
}

// A fixed-seed shuffle, so the draw can be made again and checked.
function shuffled<T>(items: ReadonlyArray<T>, seed: number): T[] {
	let state = seed >>> 0 || 1;
	const next = () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
	const list = [...items];
	for (let i = list.length - 1; i > 0; i -= 1) {
		const j = Math.floor(next() * (i + 1));
		[list[i], list[j]] = [list[j] as T, list[i] as T];
	}
	return list;
}

const used = spent();
const unused = (await search()).filter((hit) => !used.repos.has(hit.repo));
const files = shuffled(unused, SEED).slice(0, MAX_FILES);
console.error(`${unused.length} files from repositories no earlier sample used, reading ${files.length}`);

type Drawn = {
	repo: string;
	path: string;
	id: string | undefined;
	type: string;
	/** Whose shape the question was written in: typesafe, openai or vercel. */
	dialect: string;
	hash: string;
	instructions: string;
	criteria: unknown;
};

const found: Drawn[] = [];
const seen = new Set<string>(used.hashes);
let read = 0;
for (const file of files) {
	const text = gh(['-H', 'Accept: application/vnd.github.raw', `repos/${file.repo}/contents/${encodeURI(file.path)}`]);
	if (!text || text.length > 1_000_000) continue;
	read += 1;
	let questions: ReturnType<typeof readQuestions>['questions'];
	try {
		questions = readQuestions(text, syntaxForPath(file.path)).questions;
	} catch {
		continue;
	}
	for (const question of questions) {
		// Only a question written out whole can be labelled as written.
		const literal = toLiteral(question);
		if (!literal || typeof literal.instructions !== 'string') continue;
		const hash = hashOf(literal.instructions);
		if (seen.has(hash)) continue;
		seen.add(hash);
		found.push({
			repo: file.repo,
			path: file.path,
			id: question.id,
			type: literal.type,
			dialect: question.dialect,
			hash,
			instructions: literal.instructions,
			criteria: literal.criteria,
		});
	}
}

const taken = new Map<string, number>();
const sample: Drawn[] = [];
for (const question of shuffled(found, SEED)) {
	const count = taken.get(question.repo) ?? 0;
	if (count >= PER_REPO) continue;
	taken.set(question.repo, count + 1);
	sample.push(question);
	if (sample.length === SIZE) break;
}

const count = (list: ReadonlyArray<Drawn>, key: keyof Drawn) =>
	Object.fromEntries(
		[...new Set(list.map((q) => String(q[key])))].sort().map((value) => [value, list.filter((q) => String(q[key]) === value).length]),
	);
writeFileSync(
	out,
	`${JSON.stringify({ drawn: new Date().toISOString().slice(0, 10), seed: SEED, filesFound: unused.length, filesRead: read, questionsFound: found.length, repositoriesFound: new Set(found.map((q) => q.repo)).size, byDialect: count(sample, 'dialect'), byType: count(sample, 'type'), sample }, null, 1)}\n`,
);
console.error(`${found.length} distinct questions in ${read} files. Wrote ${sample.length} from ${taken.size} repositories to ${out}`);
