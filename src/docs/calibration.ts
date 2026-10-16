import type { QuestionLiteral } from '../ask/literal';
import { DEFAULT_MODEL } from '../ask/review';
import { REQUEST_REVIEWS, REVIEWS } from '../ask/reviews';

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

/** The probability at or above which a check reports. */
export function cutoffOf(code: string): number {
	const review = REVIEWS.find((each) => each.code === code);
	if (review) return review.cutoff;
	const whole = (
		REQUEST_REVIEWS as Readonly<Record<string, { cutoff: number }>>
	)[code];
	if (whole) return whole.cutoff;
	throw new Error(`no cutoff for ${code}`);
}

/** The cutoff a saved key is judged by: a DEC310 pair is saved as `DEC310.i.j`. */
export function cutoffOfKey(key: string): number | undefined {
	const code = key.split('.')[0] ?? key;
	return CHECKS.includes(code) ? cutoffOf(code) : undefined;
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
			const cutoff = cutoffOfKey(key);
			if (cutoff !== undefined && p >= cutoff !== q >= cutoff) flipped += 1;
		}
	}
	return { pairs, meanDifference: pairs ? total / pairs : 0, flipped };
}
