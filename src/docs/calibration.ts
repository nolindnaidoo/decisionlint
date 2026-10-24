import { type CheckCode, CUTOFFS } from '../ask/cutoffs';
import type { QuestionLiteral } from '../ask/literal';
import { DEFAULT_MODEL } from '../ask/review';
import { REVIEWS } from '../ask/reviews';

/**
 * What a calibration run saved, and how its numbers are read. The script
 * that makes the runs and the page that publishes them both read through
 * here, so a check's bad and good examples are defined once.
 */
export type Saved = Readonly<{
	ranOn: string;
	model: string;
	calls: number;
	inputTokens: number;
	probabilities: Readonly<Record<string, Readonly<Record<string, number>>>>;
}>;

export type CorpusEntry = Readonly<{
	id: string;
	defects: ReadonlyArray<string>;
	question: QuestionLiteral;
	siblings?: ReadonlyArray<string>;
}>;

export type RequestEntry = Readonly<{
	id: string;
	state?: unknown;
	questions: Readonly<Record<string, QuestionLiteral>>;
	overlapping: ReadonlyArray<readonly [string, string]>;
	missing?: ReadonlyArray<string>;
	injected?: boolean;
}>;

export type Reading = Readonly<{ id: string; p: number }>;
export type Readings = Readonly<{
	bad: ReadonlyArray<Reading>;
	good: ReadonlyArray<Reading>;
}>;

/** The file a run of `model` through the platform with key slot `slot` is saved to. */
export function calibrationFile(slot: string, model: string): string {
	// LLM Gateway spells Jev exactly as TypeSafe does, so the platform is in the name too.
	if (slot === 'typesafe' && model === DEFAULT_MODEL) return 'calibration.json';
	return `calibration-${slot}-${model.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`;
}

// The wording defect each check is the meaning-reading version of. Others are labeled by their own code.
const LABEL: Readonly<Record<string, string>> = {
	DEC301: 'DEC102',
	DEC302: 'DEC112',
};

/** Every check with a cutoff, in the order the page lists them. */
export const CHECKS: ReadonlyArray<string> = [
	...REVIEWS.map((review) => review.code),
	'DEC310',
	'DEC312',
].sort();

/** The probability at or above which a check reports on a model family, or undefined where it is not asked. */
export function cutoffOf(code: string, family = 'jev'): number | undefined {
	if (!CHECKS.includes(code)) throw new Error(`no check ${code}`);
	return CUTOFFS[family]?.[code as CheckCode];
}

/** The cutoff a saved key is judged by: a DEC310 pair is saved as `DEC310.i.j`. */
export function cutoffOfKey(key: string, family = 'jev'): number | undefined {
	const code = key.split('.')[0] ?? key;
	return CHECKS.includes(code) ? cutoffOf(code, family) : undefined;
}

/** The set a cutoff is fit on: at least this many examples with the defect, and without. */
export const FIT_SIZE = Object.freeze({ bad: 16, good: 40 });
/** The share of the examples with the defect a cutoff must catch, the floor Jev's have been held to since the first run. */
export const FIT_CATCH = 0.6;

export type Fit = Readonly<{
	/** The cutoff the rule fits, or undefined where none does. */
	cutoff: number | undefined;
	/** The highest good example, which every fit sits above. */
	top: Reading | undefined;
	/** The lowest hundredth above it, which catches the most defects any fit can. */
	lowest: number;
	/** The defects caught at the cutoff, or at `lowest` where there is none, and how many must be. */
	caught: number;
	needed: number;
}>;

const hundredths = (p: number) => Math.round(p * 100) / 100;

/**
 * The cutoff a run fits for one check, by the rule fixed on 2026-10-24 for
 * any model but Jev, whose cutoffs were set by hand before it. A cutoff is a
 * hundredth from 0.01 to 0.99 that flags none of the good examples and
 * catches at least six in ten of the bad ones. Where one exists it sits
 * halfway between the highest good example and the lowest bad one above it,
 * to the nearest hundredth, so an example on either side has to cross half
 * the gap to move it, unless the midpoint catches too few, when it is the
 * lowest hundredth above the good examples. With fewer examples than
 * `FIT_SIZE` nothing is fit, and where no hundredth that spares the good
 * examples catches enough bad ones, the check has no cutoff and is not asked
 * of that model.
 */
export function fitCutoff(readings: Readings): Fit {
	const needed = Math.ceil(readings.bad.length * FIT_CATCH);
	const top = [...readings.good].sort((a, b) => b.p - a.p)[0];
	const caught = (cutoff: number) =>
		readings.bad.filter((each) => each.p >= cutoff).length;
	const lowest = top ? (Math.floor(top.p * 100 + 1e-9) + 1) / 100 : 0.01;
	const none = {
		cutoff: undefined,
		top,
		lowest,
		caught: caught(lowest),
		needed,
	};
	if (
		!top ||
		readings.bad.length < FIT_SIZE.bad ||
		readings.good.length < FIT_SIZE.good ||
		lowest > 0.99 ||
		caught(lowest) < needed
	)
		return none;
	const low = Math.min(
		...readings.bad.map((each) => each.p).filter((p) => p > top.p),
	);
	const mid = hundredths((top.p + low) / 2);
	const cutoff = mid > top.p && caught(mid) >= needed ? mid : lowest;
	return { cutoff, top, lowest, caught: caught(cutoff), needed };
}

/** What a run said about the examples known to have the defect, and about those known not to. */
export function readingsOf(
	code: string,
	saved: Saved,
	corpus: ReadonlyArray<CorpusEntry>,
	requests: ReadonlyArray<RequestEntry>,
): Readings {
	const at = (id: string, key: string) => saved.probabilities[id]?.[key];
	const split = (
		list: ReadonlyArray<Reading & { bad: boolean }>,
	): Readings => ({
		bad: list.filter((each) => each.bad).map(({ id, p }) => ({ id, p })),
		good: list.filter((each) => !each.bad).map(({ id, p }) => ({ id, p })),
	});
	const stated = requests.filter((entry) => entry.state !== undefined);
	if (code === 'DEC310')
		return split(
			requests.flatMap((entry) => {
				const ids = Object.keys(entry.questions);
				return Object.entries(saved.probabilities[entry.id] ?? {}).flatMap(
					([key, p]) => {
						const match = /^DEC310\.(\d+)\.(\d+)$/.exec(key);
						if (!match) return [];
						const a = ids[Number(match[1])];
						const b = ids[Number(match[2])];
						const bad = entry.overlapping.some(
							([x, y]) => (x === a && y === b) || (x === b && y === a),
						);
						return [{ id: `${entry.id}:${a}+${b}`, p, bad }];
					},
				);
			}),
		);
	if (code === 'DEC311')
		return split(
			stated.flatMap((entry) =>
				Object.keys(entry.questions).flatMap((id) => {
					const p = at(`${entry.id}/${id}`, 'DEC311');
					if (p === undefined) return [];
					return [
						{
							id: `${entry.id}/${id}`,
							p,
							bad: (entry.missing ?? []).includes(id),
						},
					];
				}),
			),
		);
	if (code === 'DEC312')
		return split(
			stated.flatMap((entry) => {
				const p = at(entry.id, 'DEC312');
				return p === undefined
					? []
					: [{ id: entry.id, p, bad: Boolean(entry.injected) }];
			}),
		);
	const label = LABEL[code] ?? code;
	return split(
		corpus.flatMap((entry) => {
			const p = at(entry.id, code);
			if (p === undefined) return [];
			const bad = entry.defects.includes(label);
			if (!bad && entry.defects.length) return [];
			return [{ id: entry.id, p, bad }];
		}),
	);
}

/** How far one run's answers sit from another's, over the answers both have. */
export function compareRuns(
	run: Saved,
	reference: Saved,
	family = 'jev',
): Readonly<{ pairs: number; meanDifference: number; flipped: number }> {
	let pairs = 0;
	let total = 0;
	let flipped = 0;
	for (const [id, keys] of Object.entries(run.probabilities)) {
		for (const [key, p] of Object.entries(keys)) {
			const q = reference.probabilities[id]?.[key];
			if (q === undefined) continue;
			pairs += 1;
			total += Math.abs(p - q);
			const cutoff = cutoffOfKey(key, family);
			if (cutoff !== undefined && p >= cutoff !== q >= cutoff) flipped += 1;
		}
	}
	return { pairs, meanDifference: pairs ? total / pairs : 0, flipped };
}
