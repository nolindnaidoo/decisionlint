/**
 * Fetches public files from GitHub code search, for a run of the readers and
 * rules over code this project has not seen.
 *
 * Each query is searched, the hits are pooled, files under `vendor/` or
 * `node_modules/` and files in no syntax the readers know are dropped, and at
 * most three files per repository are fetched into the directory given, as
 * `<owner>__<repo>__<path with / as __>`. `index.json` beside them records
 * each file's repository, path and blob sha, so a run can be made again or a
 * finding found in the file it came from.
 *
 * The files carry their own licenses, so the directory is outside this
 * repository and nothing from it is committed. Lint it with
 * `decisionlint --format json <dir>` and read every finding by hand.
 *
 *   bun scripts/fetch-public-code.ts <outDir> --query '<code search>' [--query ...] [--pages 3] [--per-repo 3]
 *
 * It needs `gh` signed in. It calls GitHub only.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syntaxForPath } from '../src/lint/lint';

const outDir = process.argv[2];
const queries: string[] = [];
let pages = 3;
let perRepo = 3;
for (let i = 3; i < process.argv.length; i += 1) {
	const arg = process.argv[i];
	const value = process.argv[i + 1];
	if (arg === '--query' && value) queries.push(value), (i += 1);
	else if (arg === '--pages' && value) (pages = Number(value)), (i += 1);
	else if (arg === '--per-repo' && value) (perRepo = Number(value)), (i += 1);
}
// Code search allows ten requests a minute.
const SEARCH_PAUSE_MS = 7000;
const SKIPPED_PATHS = /(^|\/)(vendor|node_modules)\//;

if (!outDir || !outDir.startsWith('/') || queries.length === 0) {
	console.error(
		'Give an absolute directory outside this repository and at least one --query.',
	);
	process.exit(2);
}

function gh(args: ReadonlyArray<string>): string | undefined {
	const run = Bun.spawnSync(['gh', 'api', ...args], { stdout: 'pipe', stderr: 'pipe' });
	return run.exitCode === 0 ? run.stdout.toString() : undefined;
}

type Hit = { repo: string; path: string; sha: string; url: string };

async function search(): Promise<Hit[]> {
	const hits = new Map<string, Hit>();
	for (const query of queries) {
		for (let page = 1; page <= pages; page += 1) {
			const body = gh(['-X', 'GET', 'search/code', '-f', `q=${query}`, '-f', 'per_page=100', '-f', `page=${page}`]);
			await Bun.sleep(SEARCH_PAUSE_MS);
			if (!body) {
				console.error(`${query} page ${page}: search failed`);
				break;
			}
			const items = JSON.parse(body).items ?? [];
			for (const item of items) {
				const path = item.path as string;
				if (SKIPPED_PATHS.test(path) || !syntaxForPath(path)) continue;
				const repo = item.repository.full_name as string;
				hits.set(`${repo}:${path}`, { repo, path, sha: item.sha as string, url: item.html_url as string });
			}
			console.error(`${query} page ${page}: ${items.length} files, ${hits.size} kept in all`);
			if (items.length < 100) break;
		}
	}
	return [...hits.values()];
}

const found = await search();
const taken = new Map<string, number>();
const chosen = found.filter((hit) => {
	const count = taken.get(hit.repo) ?? 0;
	if (count >= perRepo) return false;
	taken.set(hit.repo, count + 1);
	return true;
});

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const fetched: (Hit & { file: string })[] = [];
for (const hit of chosen) {
	const text = gh(['-H', 'Accept: application/vnd.github.raw', `repos/${hit.repo}/contents/${encodeURI(hit.path)}?ref=${hit.sha}`])
		?? gh(['-H', 'Accept: application/vnd.github.raw', `repos/${hit.repo}/contents/${encodeURI(hit.path)}`]);
	if (!text || text.length > 1_000_000) continue;
	const file = `${hit.repo.replace('/', '__')}__${hit.path.replaceAll('/', '__')}`;
	writeFileSync(join(outDir, file), text);
	fetched.push({ ...hit, file });
}

writeFileSync(
	join(outDir, 'index.json'),
	`${JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), queries, pages, perRepo, filesFound: found.length, repositoriesFound: new Set(found.map((h) => h.repo)).size, files: fetched }, null, 1)}\n`,
);
console.error(`${found.length} files from ${taken.size} repositories found. Wrote ${fetched.length} to ${outDir}`);
