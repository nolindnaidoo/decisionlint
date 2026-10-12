/**
 * Fails when TypeSafe has shipped a Jev release this repo does not know of:
 * reads the public models page and compares what `jev-latest` points to with
 * `KNOWN_VERSION`. No key, and nothing metered. Run weekly by
 * `.github/workflows/jev-release.yml`.
 *
 *   bun run check:jev-release
 */
import { checkRelease, MODELS_PAGE } from '../src/jev/released';

const response = await fetch(MODELS_PAGE, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) {
	console.error(`::error::${MODELS_PAGE} answered ${response.status}`);
	process.exit(2);
}
const { failures, warnings } = checkRelease(await response.text());
for (const warning of warnings) console.log(`::warning::${warning}`);
for (const failure of failures) console.error(`::error::${failure}`);
if (failures.length > 0) process.exit(1);
console.log('jev-latest points to the version this repo declares.');
