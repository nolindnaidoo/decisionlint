/**
 * Writes docs/cutoffs.md from the calibration runs in fixtures/validation/.
 * Run it after a calibration run or a cutoff change.
 * `src/docs/cutoffsPage.test.ts` fails until it has been run.
 *
 *   bun run docs:cutoffs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderCutoffsPage } from '../src/docs/cutoffsPage';

const root = join(import.meta.dir, '..');
const read = (path: string) => JSON.parse(readFileSync(join(root, 'fixtures', path), 'utf8'));
const page = renderCutoffsPage({
	corpus: read('corpus/questions.json'),
	requests: read('corpus/requests.json'),
	run: (file) => read(`validation/${file}`),
});
writeFileSync(join(root, 'docs', 'cutoffs.md'), page);
console.log('docs/cutoffs.md written');
