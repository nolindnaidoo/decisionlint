import type { RuleCode, Severity } from '../types';
import { DOCS } from './limits';

export type Rule = Readonly<{
	code: RuleCode;
	name: string;
	/** One sentence on what the rule catches: the README's "What it means" column, and the first line of the rule's page. */
	meaning: string;
	/** `off` for a rule the corpus has not earned a default for. It still runs when a user switches it on. */
	severity: Severity | 'off';
	docs: string;
}>;

/** The single list of rules. SPEC.md and README.md are held to it by `rules.test.ts`, the README's meanings too. */
export const RULES: Readonly<Record<RuleCode, Rule>> = Object.freeze({
	DEC000: {
		code: 'DEC000',
		name: 'unreadable',
		meaning:
			'Part of the question is built at runtime, so the rules that need it did not run',
		severity: 'hint',
		docs: DOCS.api,
	},
	DEC001: {
		code: 'DEC001',
		name: 'unpinned-model',
		meaning:
			'An alias such as `jev-latest` moves with each release, so answers can change with no change on your side',
		severity: 'warning',
		docs: DOCS.models,
	},
	DEC002: {
		code: 'DEC002',
		name: 'choice-option-limit',
		meaning: 'A Choice has more than 255 options. The API rejects it',
		severity: 'error',
		docs: DOCS.api,
	},
	DEC003: {
		code: 'DEC003',
		name: 'score-level-limit',
		meaning: 'A Score has more than 10 levels. The API rejects it',
		severity: 'error',
		docs: DOCS.api,
	},
	DEC004: {
		code: 'DEC004',
		name: 'no-fallback-option',
		meaning:
			'A Choice has no `other` or `none of the above`, so an input that fits no option is forced into one. The largest cost measured anywhere, and the hardest to tell from text',
		// The cost is the largest measured anywhere: our run, 4 of 8 right against
		// 8 of 8; an independent KoBBQ audit, 95% abstention with an "unknown"
		// option against 0% accuracy on the same items without one. It still
		// informs, because text cannot show whether the options cover every
		// input: it fires on 9 of the 11 Choice examples TypeSafe publishes as
		// correct and on 65 of the 86 Choices in public sample 3. ESLint's
		// default-case and Biome's useDefaultSwitchClause, the same rule for a
		// switch, are off in both recommended sets for the same reason. The
		// message carries the measurement.
		severity: 'info',
		docs: DOCS.choice,
	},
	DEC005: {
		code: 'DEC005',
		name: 'duplicate',
		meaning:
			'A question id, option or level appears twice. In an object the later one silently replaces the earlier',
		severity: 'error',
		docs: DOCS.api,
	},
	DEC006: {
		code: 'DEC006',
		name: 'criteria-shape',
		meaning:
			'A Choice needs a map of options, a Score needs an array of levels, and a Noul takes `true` and `false`',
		severity: 'error',
		docs: DOCS.api,
	},
	DEC007: {
		code: 'DEC007',
		name: 'invalid-question',
		meaning:
			'The type is missing or unknown, or the instructions are an empty string',
		severity: 'error',
		docs: DOCS.api,
	},
	DEC008: {
		code: 'DEC008',
		name: 'numeric-levels',
		meaning:
			'Score levels are bare numbers. Jev matches the state against each description and never sees its position',
		severity: 'warning',
		docs: DOCS.scoreLevels,
	},
	DEC009: {
		code: 'DEC009',
		name: 'too-few-options',
		meaning:
			'A Choice with one option or a Score with one level gives every input the same answer',
		severity: 'info',
		docs: DOCS.choice,
	},
	DEC010: {
		code: 'DEC010',
		name: 'unused-disable',
		meaning:
			'A `decisionlint-disable` comment silences nothing, so it can only hide a finding added later',
		severity: 'warning',
		// The one rule about this tool's own comments, so the one with no vendor page.
		docs: 'https://github.com/nolindnaidoo/decisionlint#suppressing-a-finding',
	},
	DEC011: {
		code: 'DEC011',
		name: 'description-repeats-name',
		meaning:
			"An option's description only repeats its name, or a Noul's criteria say yes and no. Jev matches the state against the description, and this one says nothing",
		// Measured 2026-10-08: "billing": "Billing" answered 12 of 12 either way,
		// and Yes/No criteria 11 of 12 either way, 0.08 less sure. No cost found
		// where the name itself says something. Independent runs found one
		// (smkrv/jev-calibrate, SYED-M-HUSSAIN), and 10 clear cases in public
		// sample 3 were names that say nothing, "a": "A". So it informs.
		severity: 'info',
		docs: DOCS.choice,
	},
	DEC012: {
		code: 'DEC012',
		name: 'terse-instructions',
		meaning:
			'The instructions are one or two words, so the question leans on its id. Jev is sent the instructions and never the id',
		// Measured 2026-10-08: "Refund?" right 9 of 12 at 0.70 sure, against 10 of
		// 12 at 0.85 for the question written out. Advisory by the rule the other
		// wording rules are held to. 23 clear cases in public sample 3, the most
		// common defect there.
		severity: 'info',
		docs: DOCS.primitives,
	},
	DEC013: {
		code: 'DEC013',
		name: 'newer-model',
		meaning:
			'`model` names a Jev version newer than the one these rules were measured on, so a finding may cost nothing there and a weakness new to it is not looked for',
		severity: 'info',
		docs: DOCS.currentModels,
	},
	DEC014: {
		code: 'DEC014',
		name: 'question-limit',
		meaning:
			'A request has more questions than the platform it goes to takes in one call. The platform rejects it',
		severity: 'error',
		// The one platform in `lint/targets.ts` that publishes the number.
		docs: 'https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md',
	},
	DEC101: {
		code: 'DEC101',
		name: 'double-negative',
		meaning:
			'A question negates twice in one clause, or a negation sits directly on another',
		// Measured: right 14 of 15 against 15 of 15, but less sure (0.73 against 0.87).
		severity: 'info',
		docs: `${DOCS.jaggedness}#indirection`,
	},
	DEC102: {
		code: 'DEC102',
		name: 'arithmetic',
		meaning: 'The question asks Jev to count or compare numbers',
		// Measured: counting 20 to 40 items, 8 of 12 at 0.58 sure. Adding three to five
		// numbers against a limit, 5 of 12 at 0.52. No better than a guess.
		severity: 'warning',
		docs: `${DOCS.jaggedness}#math-and-numbers`,
	},
	DEC103: {
		code: 'DEC103',
		name: 'date-comparison',
		meaning:
			'The question asks Jev to order two times or measure the gap between them',
		// Measured: ordering two dates, 12 of 12. A window counted in days, 11 of 12 at
		// 0.75 sure, where code is certain. Advisory.
		severity: 'info',
		docs: `${DOCS.jaggedness}#date-and-time-comparison`,
	},
	DEC104: {
		code: 'DEC104',
		name: 'compound',
		meaning: "A Noul joins two judgments with 'and'",
		severity: 'off',
		docs: `${DOCS.primitives}#ask-for-one-snap-judgment-per-question`,
	},
	DEC105: {
		code: 'DEC105',
		name: 'generation',
		meaning: 'The question asks for a value or for text to be written',
		severity: 'warning',
		docs: `${DOCS.jaggedness}#generation`,
	},
	DEC107: {
		code: 'DEC107',
		name: 'negated-noul',
		meaning:
			'A Noul with no criteria is phrased so that yes means something is absent',
		// Measured: 14 of 14 right either way, equally sure. No cost found.
		severity: 'off',
		docs: `${DOCS.jaggedness}#contradictory-instructions-and-criteria`,
	},
	DEC108: {
		code: 'DEC108',
		name: 'inverted-criteria',
		meaning: "A Noul's 'true' criterion describes the negative case",
		// Measured: 14 of 14 right either way. Jev follows the question and ignores the criteria.
		severity: 'off',
		docs: `${DOCS.jaggedness}#contradictory-instructions-and-criteria`,
	},
	DEC110: {
		code: 'DEC110',
		name: 'degree-levels',
		meaning:
			'Score levels are degree words, bare labels, or one word turned up and down. Nothing for Jev to match the state against',
		// Measured 2026-10-08: Shallow, Medium, Deep placed 4 of 12 code reviews
		// right, against 12 of 12 for described levels. The largest cost measured
		// on any wording rule here. Also the most common real defect in public
		// code, 15 clear cases across two samples, right on every firing.
		severity: 'warning',
		docs: DOCS.scoreLevels,
	},
	DEC111: {
		code: 'DEC111',
		name: 'numeric-encoding',
		meaning: 'The question refers to a value by hex or RGB encoding',
		// Measured: 12 of 12 right with hex or with names, equally sure. No cost found.
		severity: 'off',
		docs: `${DOCS.jaggedness}#math-and-numbers`,
	},
	DEC112: {
		code: 'DEC112',
		name: 'undefined-boundary',
		meaning:
			'A Noul with no criteria turns on a word such as large, often or enough',
		// Measured: 4 of 6 right, against 6 of 6 once criteria drew the line.
		severity: 'info',
		docs: `${DOCS.jaggedness}#literal-reading`,
	},
	DEC301: {
		code: 'DEC301',
		name: 'model-counting',
		meaning: 'Jev reads the question as needing counting or arithmetic',
		severity: 'warning',
		docs: `${DOCS.jaggedness}#math-and-numbers`,
	},
	DEC302: {
		code: 'DEC302',
		name: 'model-undefined-boundary',
		meaning:
			'Jev reads a Noul as turning on a matter of degree with no stated line',
		severity: 'info',
		docs: `${DOCS.jaggedness}#literal-reading`,
	},
	DEC303: {
		code: 'DEC303',
		name: 'model-overlapping-options',
		meaning: 'Jev reads two options of a Choice as covering the same cases',
		severity: 'info',
		docs: DOCS.choice,
	},
	DEC304: {
		code: 'DEC304',
		name: 'model-overlapping-levels',
		meaning: 'Jev reads two levels of a Score as the same situation',
		severity: 'warning',
		docs: DOCS.scoreLevels,
	},
	DEC305: {
		code: 'DEC305',
		name: 'model-label-mismatch',
		meaning:
			'Jev reads an option as named for one thing and described as another',
		severity: 'warning',
		docs: DOCS.choice,
	},
	DEC306: {
		code: 'DEC306',
		name: 'model-criteria-off-topic',
		meaning:
			'Jev reads the criteria as deciding something the instructions do not ask',
		severity: 'info',
		docs: `${DOCS.jaggedness}#contradictory-instructions-and-criteria`,
	},
	DEC307: {
		code: 'DEC307',
		name: 'model-ordered-options',
		meaning:
			"Jev reads a Choice's options as steps on one scale, which a Score would place between",
		severity: 'info',
		docs: `${DOCS.primitives}#choose-a-question-type`,
	},
	DEC308: {
		code: 'DEC308',
		name: 'model-unordered-levels',
		meaning:
			"Jev reads a Score's levels as unordered categories, which a Choice would pick from",
		severity: 'info',
		docs: `${DOCS.primitives}#choose-a-question-type`,
	},
	DEC309: {
		code: 'DEC309',
		name: 'model-depends-on-sibling',
		meaning:
			"Jev reads a question as needing another question's answer from the same request",
		severity: 'info',
		docs: `${DOCS.primitives}#when-one-question-depends-on-another`,
	},
	DEC310: {
		code: 'DEC310',
		name: 'model-overlapping-questions',
		meaning:
			'Jev reads two questions in one request as asking for the same judgment',
		severity: 'info',
		docs: `${DOCS.primitives}#ask-multiple-questions-together`,
	},
	DEC311: {
		code: 'DEC311',
		name: 'model-answer-not-in-state',
		meaning:
			'Jev reads the state written in the file as not holding what the question asks about',
		severity: 'info',
		docs: 'https://docs.typesafe.ai/concepts/state',
	},
	DEC312: {
		code: 'DEC312',
		name: 'model-orders-in-state',
		meaning:
			'Jev reads part of the state written in the file as giving orders to its reader',
		severity: 'info',
		docs: `${DOCS.jaggedness}#adversarial-content`,
	},
});

/** Rules in the DEC3xx range run only when the user asks a model to check a file. `lintText` never runs them. */
export const RULE_CODES = Object.freeze(Object.keys(RULES) as RuleCode[]);

// The codes rules had before 1.0.0, read for ever: a comment or a settings
// file in a repository is not this tool's to update. Nothing writes one.
const OLD_CODE = /^JEV(\d{3})$/;

/** `JEV004` as `DEC004`; any other text as written. */
export function currentCode(code: string): string {
	const old = OLD_CODE.exec(code);
	return old ? `DEC${old[1]}` : code;
}

/**
 * A rule's own page: what it catches, an example, how to fix and silence it.
 * A finding links here, and the page links on to the vendor page in `docs`.
 * The pages are in `docs/rules/`, generated by `bun run docs:rules`.
 */
export function pageFor(code: string): string {
	return `https://github.com/nolindnaidoo/decisionlint/blob/main/docs/rules/${code}.md`;
}
