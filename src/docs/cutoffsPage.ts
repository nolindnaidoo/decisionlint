import { familyOf } from '../ask/cutoffs';
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
	fitCutoff,
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
// models with cutoffs of their own, each judged by its family's cutoffs.
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
		const compared =
			reference &&
			compareRuns(saved, runOf(data, reference), familyOf(route.model));
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

function cell(code: string, data: CalibrationData, route: Route): string {
	const cutoff = cutoffOf(code, familyOf(route.model));
	if (cutoff === undefined) return 'not asked';
	const readings = readingsOf(
		code,
		runOf(data, route),
		data.corpus,
		data.requests,
	);
	return `${cutoff}: ${caught(readings, cutoff)}`;
}

function cutoffsTable(data: CalibrationData): string[] {
	const rows = CHECKS.map((code) => {
		const cells = COLUMNS.map(({ route }) => cell(code, data, route));
		return `| [${code}](rules/${code}.md) | ${RULES[code as RuleCode].name} | ${cells.join(' | ')} |`;
	});
	return [
		'## The cutoffs',
		'',
		'Each cell is the cutoff the model is judged by and two counts at it: the examples known to have the defect that were caught, and the examples known to be fine that were flagged anyway. "0.75: 7/8, 0/20" means a cutoff of 0.75 caught 7 of 8 and flagged none of 20. "not asked" means no cutoff fit on that model, and the notes say what stood in the way.',
		'',
		`| Check | Name | ${COLUMNS.map((column) => column.heading).join(' | ')} |`,
		`|---|---|${COLUMNS.map(() => '---').join('|')}|`,
		...rows,
		'',
	];
}

// Why a check is not asked of a model: the good example every cutoff would have to clear, and what the lowest one above it catches.
function unfit(
	code: string,
	data: CalibrationData,
	column: (typeof COLUMNS)[number],
): string | undefined {
	const family = familyOf(column.route.model);
	if (family === 'jev' || cutoffOf(code, family) !== undefined)
		return undefined;
	const readings = readingsOf(
		code,
		runOf(data, column.route),
		data.corpus,
		data.requests,
	);
	const found = fitCutoff(readings);
	const top = found.top
		? `\`${found.top.id}\` at ${found.top.p.toFixed(2)}`
		: 'none';
	const above =
		found.lowest > 0.99
			? 'no cutoff sits above it'
			: `the lowest cutoff above it, ${found.lowest.toFixed(2)}, catches ${found.caught} of the ${readings.bad.length} examples with the defect, where a cutoff needs ${found.needed}`;
	return `- ${code} is not asked of ${column.heading}. The highest good example is ${top}, and ${above}.`;
}

// What the counts above leave out, why a check is not asked of a model, and where a cutoff flags a good example on a route counted as calibrated.
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
	for (const column of COLUMNS)
		for (const code of CHECKS) {
			const line = unfit(code, data, column);
			if (line) lines.push(line);
		}
	for (const route of ROUTES) {
		const { target, provider } = described(route);
		if (!isCalibrated(route.model, provider)) continue;
		const saved = runOf(data, route);
		for (const code of CHECKS) {
			const cutoff = cutoffOf(code, familyOf(route.model));
			if (cutoff === undefined) continue;
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
		"A model-backed check asks the model a yes-or-no question about one of your questions and reports when the probability of yes reaches a cutoff. Jev's cutoffs were set by hand on `" +
			DEFAULT_MODEL +
			"` at TypeSafe, and a route measured to answer as that run does uses them. Luna's and Liquid d1's were fit on their own runs over the whole set on 2026-10-24, by one rule: a cutoff is a hundredth that flags none of the good examples and catches at least six in ten of the bad ones, and it sits halfway between the highest good example and the lowest bad one above it. Where no such cutoff exists the check is not asked of that model, and the notes name the example in the way. Every other model and route is judged by its family's cutoffs, or Jev's, and its findings say so.",
		'',
		'A cutoff is fit on at least 16 examples with the defect and 40 without, per check and per model, a size fixed on 2026-10-24 before the set was grown to it: none of 40 flagged bounds the false-flag rate at about 1 in 14 with 95% confidence, and 16 place the catch count in steps of about 6 points. Where a cell has fewer, read the counts as rough evidence rather than accuracy rates. A different model version can answer differently, so these numbers are true of the versions named here.',
		'',
		...routesTable(data),
		...cutoffsTable(data),
		...notes(data),
	].join('\n');
}
