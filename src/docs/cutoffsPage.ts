import { isCalibrated, providerForTarget } from '../ask/provider';
import { DEFAULT_MODEL } from '../ask/review';
import { RULES } from '../lint/rules';
import { TARGETS, targetById } from '../lint/targets';
import type { RuleCode } from '../types';
import {
	CHECKS,
	type CorpusEntry,
	calibrationFile,
	compareRuns,
	cutoffOf,
	type Readings,
	type RequestEntry,
	readingsOf,
	type Saved,
} from './calibration';

/** A platform and the id a calibration run sent there. */
export type Route = Readonly<{ slot: string; model: string }>;

/**
 * Every calibration run kept in `fixtures/validation/`. A test fails if a
 * file there is not listed, so a new run cannot go unpublished.
 */
export const ROUTES: ReadonlyArray<Route> = [
	{ slot: 'typesafe', model: DEFAULT_MODEL },
	{ slot: 'openrouter', model: 'typesafe/jev-1.13' },
	{ slot: 'llmgateway', model: 'jev-1.13.0' },
	{ slot: 'vercel', model: 'typesafe-ai/jev' },
	{ slot: 'openai', model: 'gpt-6-luna' },
	{ slot: 'vercel', model: 'openai/gpt-6-luna-decisions' },
	{ slot: 'liquid', model: 'd1' },
];

// The runs each check's row is given for: Jev where it was calibrated, Jev on
// the route that answers as it does and has the whole corpus, and the two
// other models.
const COLUMNS: ReadonlyArray<Readonly<{ route: Route; heading: string }>> = [
	{
		route: { slot: 'typesafe', model: DEFAULT_MODEL },
		heading: 'Jev at TypeSafe',
	},
	{
		route: { slot: 'openrouter', model: 'typesafe/jev-1.13' },
		heading: 'Jev through OpenRouter',
	},
	{ route: { slot: 'openai', model: 'gpt-6-luna' }, heading: 'Luna' },
	{ route: { slot: 'liquid', model: 'd1' }, heading: 'Liquid d1' },
];

export type CalibrationData = Readonly<{
	corpus: ReadonlyArray<CorpusEntry>;
	requests: ReadonlyArray<RequestEntry>;
	/** A run's saved file by its name in `fixtures/validation/`. */
	run: (file: string) => Saved;
}>;

function described(route: Route) {
	const target = targetById(route.slot);
	if (!target) throw new Error(`no platform ${route.slot}`);
	const provider = providerForTarget(target, route.model);
	if (typeof provider === 'string') throw new Error(provider);
	return { target, provider };
}

const SHAPE_NAME = { typesafe: "TypeSafe's", openai: "OpenAI's" } as const;

// The run a route is compared with: the same model where it was first measured.
function referenceOf(route: Route): Route | undefined {
	const { provider } = described(route);
	const reference =
		provider.model === 'Jev'
			? { slot: 'typesafe', model: DEFAULT_MODEL }
			: provider.model === 'Luna'
				? { slot: 'openai', model: 'gpt-6-luna' }
				: undefined;
	if (!reference) return undefined;
	if (reference.slot === route.slot && reference.model === route.model)
		return undefined;
	return reference;
}

const runOf = (data: CalibrationData, route: Route) =>
	data.run(calibrationFile(route.slot, route.model));

function routesTable(data: CalibrationData): string[] {
	const rows = ROUTES.map((route) => {
		const { target, provider } = described(route);
		const saved = runOf(data, route);
		const reference = referenceOf(route);
		const compared = reference && compareRuns(saved, runOf(data, reference));
		const against = reference
			? `${compared?.meanDifference.toFixed(3)} from ${described(reference).target.name}, ${compared?.flipped} of ${compared?.pairs} flipped`
			: 'first measured here';
		const caveat = isCalibrated(route.model, provider) ? 'no' : 'yes';
		return `| ${target.name} | \`${route.model}\` | ${provider.model} | ${SHAPE_NAME[provider.shape]} | ${saved.ranOn} | ${saved.calls} | ${against} | ${caveat} |`;
	});
	const measured = new Set(ROUTES.map((route) => route.slot));
	const unrun = TARGETS.filter((target) => !measured.has(target.id)).map(
		(target) => target.name,
	);
	return [
		'## Where the checks have been run',
		'',
		'Each run sent every question in the corpus with the checks that apply to it, through the live API, and saved the probability each check came back with. "Difference" is the average gap from the same model where it was first measured, over the answers both runs have, and "flipped" counts the answers that land on the other side of a shipped cutoff.',
		'',
		'| Platform | Model asked | Answered by | Shape sent | Run on | Calls | Difference | Findings say the cutoff was set elsewhere |',
		'|---|---|---|---|---|---|---|---|',
		...rows,
		'',
		...(unrun.length ? [`Not run yet: ${unrun.join(', ')}.`, ''] : []),
	];
}

const caught = (readings: Readings, cutoff: number) =>
	`${readings.bad.filter((each) => each.p >= cutoff).length}/${readings.bad.length}, ${readings.good.filter((each) => each.p >= cutoff).length}/${readings.good.length}`;

function cutoffsTable(data: CalibrationData): string[] {
	const rows = CHECKS.map((code) => {
		const cutoff = cutoffOf(code);
		const cells = COLUMNS.map(({ route }) =>
			caught(
				readingsOf(code, runOf(data, route), data.corpus, data.requests),
				cutoff,
			),
		);
		return `| [${code}](rules/${code}.md) | ${RULES[code as RuleCode].name} | ${cutoff} | ${cells.join(' | ')} |`;
	});
	return [
		'## The cutoffs',
		'',
		'Each cell is two counts at the shipped cutoff: the examples known to have the defect that were caught, and the examples known to be fine that were flagged anyway. "7/8, 0/20" means 7 of 8 caught and none of 20 flagged.',
		'',
		`| Check | Name | Cutoff | ${COLUMNS.map((column) => column.heading).join(' | ')} |`,
		`|---|---|---|${COLUMNS.map(() => '---').join('|')}|`,
		...rows,
		'',
	];
}

// What the counts above leave out, and where a cutoff flags a good example on a route counted as calibrated.
function notes(data: CalibrationData): string[] {
	const base = runOf(data, { slot: 'typesafe', model: DEFAULT_MODEL });
	const unsent = data.corpus.filter(
		(entry) => !base.probabilities[entry.id],
	).length;
	const lines: string[] = [];
	if (unsent)
		lines.push(
			`- ${unsent} of the ${data.corpus.length} corpus questions were added after the TypeSafe run and have not been sent there, so the TypeSafe column counts the rest. The OpenRouter column answers as TypeSafe does and covers all of them.`,
		);
	for (const route of ROUTES) {
		const { target, provider } = described(route);
		if (!isCalibrated(route.model, provider)) continue;
		const saved = runOf(data, route);
		for (const code of CHECKS) {
			const cutoff = cutoffOf(code);
			const flagged = readingsOf(
				code,
				saved,
				data.corpus,
				data.requests,
			).good.filter((each) => each.p >= cutoff);
			if (!flagged.length) continue;
			const named = flagged
				.map((each) => `\`${each.id}\` at ${each.p.toFixed(2)}`)
				.join(', ');
			lines.push(
				`- ${code} flags a good example through ${target.name}, where findings are counted as calibrated: ${named}, against a cutoff of ${cutoff}.`,
			);
		}
	}
	return lines.length ? ['## Notes', '', ...lines, ''] : [];
}

/** `docs/cutoffs.md`, written from the calibration runs. */
export function renderCutoffsPage(data: CalibrationData): string {
	return [
		'<!-- Written by `bun run docs:cutoffs` from fixtures/validation/. Do not edit. -->',
		'',
		'# Cutoffs and where they were measured',
		'',
		'A model-backed check asks the model a yes-or-no question about one of your questions and reports when the probability of yes reaches a cutoff. Every cutoff was set on Jev at TypeSafe, on `' +
			DEFAULT_MODEL +
			'`. The same cutoffs are used on every other model and platform, and this page shows how they hold up there.',
		'',
		'The samples are small, about eight examples with the defect and twenty without per check, so read the counts as rough evidence rather than accuracy rates. A different model version can answer differently, so these numbers are true of the versions named here.',
		'',
		...routesTable(data),
		...cutoffsTable(data),
		...notes(data),
	].join('\n');
}
