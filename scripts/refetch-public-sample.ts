/**
 * Rebuilds the drawn file of a public sample from its labels, for when the
 * file `draw-public-sample.ts` wrote is gone.
 *
 * labels.json holds the repository, the path and the hash of each question's
 * instructions, and none of the text. This fetches every file the labels
 * name at its current head, reads the questions out with this repo's own
 * readers, and keeps each one whose instructions still hash to a label. A
 * question whose file has moved or changed since the draw is listed as
 * missing and left out, so a score run over the result covers fewer
 * questions and says how many.
 *
 *   bun scripts/refetch-public-sample.ts fixtures/public-sample-2 <out.json>
 *
 * The text is written to the path given and nowhere else, as the draw does:
 * those files carry their own licenses. It needs `gh` signed in. It calls
 * GitHub only, never a model.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toLiteral } from '../src/ask/literal';
import { readQuestions, syntaxForPath } from '../src/lint/lint';

const [sampleDir, out] = process.argv.slice(2);
if (!sampleDir || !out) {
	console.error('Usage: bun scripts/refetch-public-sample.ts <fixtures/sample-dir> <out.json, outside this repository>');
	process.exit(2);
}

type Label = { repo: string; path: string; id: string | null; type: string; hash: string; skipped: boolean };
const labels: Label[] = JSON.parse(readFileSync(join(sampleDir, 'labels.json'), 'utf8'));

function gh(args: ReadonlyArray<string>): string | undefined {
	const run = Bun.spawnSync(['gh', 'api', ...args], { stdout: 'pipe', stderr: 'pipe' });
	return run.exitCode === 0 ? run.stdout.toString() : undefined;
}

const hashOf = (text: string) =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

type Drawn = {
	repo: string;
	path: string;
	id: string | undefined;
	type: string;
	hash: string;
	instructions: string;
	criteria: unknown;
};

// One fetch per file, however many of its questions were drawn.
const files = new Map<string, { repo: string; path: string }>();
for (const label of labels) files.set(`${label.repo}:${label.path}`, { repo: label.repo, path: label.path });
const wanted = new Set(labels.map((label) => label.hash));

const sample: Drawn[] = [];
const filesMissing: string[] = [];
let fetched = 0;
for (const file of files.values()) {
	const text = gh(['-H', 'Accept: application/vnd.github.raw', `repos/${file.repo}/contents/${encodeURI(file.path)}`]);
	if (!text || text.length > 1_000_000) {
		filesMissing.push(`${file.repo}:${file.path}`);
		continue;
	}
	fetched += 1;
	let questions: ReturnType<typeof readQuestions>['questions'];
	try {
		questions = readQuestions(text, syntaxForPath(file.path)).questions;
	} catch {
		filesMissing.push(`${file.repo}:${file.path}`);
		continue;
	}
	for (const question of questions) {
		const literal = toLiteral(question);
		if (!literal || typeof literal.instructions !== 'string') continue;
		const hash = hashOf(literal.instructions);
		if (!wanted.has(hash) || sample.some((drawn) => drawn.hash === hash)) continue;
		sample.push({
			repo: file.repo,
			path: file.path,
			id: question.id,
			type: literal.type,
			hash,
			instructions: literal.instructions,
			criteria: literal.criteria,
		});
	}
	if (fetched % 25 === 0) console.error(`${fetched} files fetched, ${sample.length} of ${labels.length} questions found`);
}

const found = new Set(sample.map((drawn) => drawn.hash));
const questionsMissing = labels
	.filter((label) => !found.has(label.hash))
	.map(({ repo, path, id, hash, skipped }) => ({ repo, path, id, hash, skipped }));

writeFileSync(
	out,
	`${JSON.stringify({ refetched: new Date().toISOString().slice(0, 10), source: sampleDir, filesNamed: files.size, filesFetched: fetched, filesMissing, questionsFound: sample.length, questionsMissing, sample }, null, 1)}\n`,
);
const readable = labels.filter((label) => !label.skipped).length;
const readableMissing = questionsMissing.filter((label) => !label.skipped).length;
console.error(
	`${fetched} of ${files.size} files fetched. ${sample.length} of ${labels.length} questions found; of the ${readable} that were read, ${readableMissing} are missing. Wrote ${out}`,
);
