import { MEASURED_ON } from '../lint/limits';
import { parseModelId } from '../lint/models';
import type { RuleCode } from '../types';

/** A check the model makes: the codes from DEC301 up. */
export type CheckCode = Extract<RuleCode, `DEC3${string}`>;

/** A check's cutoff on one model. A check with no entry is not asked of that model. */
export type Cutoffs = Readonly<Partial<Record<CheckCode, number>>>;

/**
 * A run the cutoffs rest on: the platform, the id sent there, and the model
 * family whose cutoffs it answers to. A finding from one of these carries no
 * caveat. A route joins only from a saved run in `fixtures/validation/` that
 * answers as the family's first run does, never by its spelling.
 */
export type Measured = Readonly<{
	slot: string;
	model: string;
	family: string;
}>;

export const MEASURED: ReadonlyArray<Measured> = Object.freeze([
	{ slot: 'typesafe', model: MEASURED_ON, family: 'jev' },
	// 0.012 from TypeSafe on average over 2587 pairs on 2026-10-31.
	{ slot: 'openrouter', model: 'typesafe/jev-1.14', family: 'jev' },
	{ slot: 'openai', model: 'gpt-6-luna', family: 'luna' },
	// The same numbers as OpenAI over 1415 pairs on 2026-10-16.
	{ slot: 'vercel', model: 'openai/gpt-6-luna-decisions', family: 'luna' },
	{ slot: 'liquid', model: 'd1', family: 'd1' },
]);

/**
 * At or above this probability of yes, the defect is reported.
 *
 * Each is what `fitCutoff` in `docs/calibration.ts` fits on that model's run
 * over the whole set, Jev's on `fixtures/validation/calibration.json` on
 * 2026-10-31, Luna's and d1's on 2026-10-24, and `reviews.test.ts` holds each
 * table to exactly what the rule fits now. A check missing from a model's table is one
 * no cutoff could fit there: at every cutoff that flags none of the good
 * examples, fewer than six in ten of the bad ones are caught. It is not
 * asked of that model, and `docs/cutoffs.md` names the example in the way.
 */
export const CUTOFFS: Readonly<Record<string, Cutoffs>> = Object.freeze({
	jev: Object.freeze({
		DEC301: 0.96,
		DEC302: 0.84,
		DEC304: 0.29,
		DEC305: 0.66,
		DEC306: 0.52,
		DEC307: 0.64,
		DEC308: 0.5,
		DEC309: 0.75,
		DEC310: 0.12,
		DEC312: 0.93,
	}),
	luna: Object.freeze({
		DEC302: 0.72,
		DEC305: 0.34,
		DEC307: 0.35,
		DEC308: 0.88,
		DEC309: 0.48,
		DEC310: 0.01,
		DEC312: 0.97,
	}),
	d1: Object.freeze({
		DEC302: 0.45,
		DEC303: 0.59,
		DEC304: 0.15,
		DEC305: 0.37,
		DEC306: 0.36,
		DEC307: 0.47,
		DEC308: 0.89,
		DEC309: 0.76,
		DEC310: 0.03,
		DEC311: 0.98,
	}),
});

/** The family a model id belongs to, or '' where its spelling names none. */
export const familyOf = (model: string): string =>
	parseModelId(model)?.family ?? '';

/** The cutoffs a model is judged by: its family's where it has been measured, else Jev's. */
export function cutoffsFor(model: string): Cutoffs {
	return CUTOFFS[familyOf(model)] ?? (CUTOFFS.jev as Cutoffs);
}

/** The run the cutoffs a model is judged by were set on: its family's first, else Jev's. */
export function setOn(model: string): Measured {
	const family = familyOf(model);
	return (
		MEASURED.find((run) => run.family === family) ?? (MEASURED[0] as Measured)
	);
}
