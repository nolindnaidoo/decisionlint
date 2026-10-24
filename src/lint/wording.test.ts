import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, lintText } from './lint';
import { RULE_CODES } from './rules';

// Every wording rule on, so the ones that ship off are exercised too.
const ALL_ON = {
	...DEFAULT_OPTIONS,
	rules: Object.fromEntries(
		RULE_CODES.filter((code) => code > 'DEC100').map((code) => [
			code,
			'warning' as const,
		]),
	),
};

function codes(question: unknown): ReadonlyArray<string> {
	const text = JSON.stringify({ questions: { q: question } });
	return lintText(text, ALL_ON)
		.findings.map((finding) => finding.code)
		.filter((code) => code > 'DEC100');
}

const noul = (instructions: unknown, criteria?: unknown) => ({
	type: 'noul',
	instructions,
	criteria,
});
const score = (levels: unknown[]) => ({
	type: 'score',
	instructions: 'Rate the damage',
	criteria: levels,
});

describe('each wording rule fires on its defect', () => {
	it.each([
		['DEC101', noul('Is the invoice not unpaid?')],
		['DEC102', noul('Do at least five of the comments mention price?')],
		['DEC103', noul('Was the order placed before the sale started?')],
		['DEC104', noul('Is the user annoyed and asking to cancel?')],
		['DEC105', noul('Where was the parcel left?')],
		[
			'DEC105',
			{
				type: 'choice',
				instructions: 'Summarize the complaint',
				criteria: { a: null, other: null },
			},
		],
		['DEC107', noul('Does the reply lack an apology?')],
		[
			'DEC108',
			noul('Does the reply apologise?', {
				true: 'No apology appears.',
				false: 'An apology appears.',
			}),
		],
		['DEC110', score(['Poor', 'Fair', 'Good'])],
		['DEC111', noul('Is 0x4A the returns prefix?')],
	])('%s', (code, question) => {
		expect(codes(question)).toContain(code);
	});
});

describe('wording rules stay quiet', () => {
	it.each([
		['a plain question', noul('Does the customer ask for a refund?')],
		['a single negation', noul('Has the order not shipped?')],
		['whether or not', noul('Does it say whether or not the order shipped?')],
		[
			'"more than one", which asks if something exists',
			noul('Is the same fact kept in more than one place?'),
		],
		[
			'"none" beside "no"',
			{
				type: 'choice',
				instructions:
					'Which is the brand colour? Choose none if there is no clear one.',
				criteria: { red: null, none: null },
			},
		],
		[
			'"before" with nothing after it',
			noul('Has the customer written in before?'),
		],
		[
			'a question that opens with Which, asked as a Choice',
			{
				type: 'choice',
				instructions: 'Which team owns this?',
				criteria: { a: null, other: null },
			},
		],
		[
			'described levels',
			score(['Nobody is blocked', 'A workaround exists', 'Work has stopped']),
		],
		[
			'a ticket number that looks like hex',
			noul('Is this about ticket #104000?'),
		],
	])('on %s', (_name, question) => {
		expect(codes(question)).toEqual([]);
	});

	it('about inverted criteria when the question itself is asked in the negative', () => {
		const question = noul('Is the reply missing an apology?', {
			true: 'No apology appears.',
			false: 'An apology appears.',
		});
		expect(codes(question)).toEqual([]);
		expect(codes(noul('Is the reply missing an apology?'))).toEqual(['DEC107']);
	});

	it('on text quoted inside the question', () => {
		const quoted = noul(
			'Does this mean the same as "She left before noon and never came back, not once"?',
		);
		expect(codes(quoted)).toEqual([]);
		expect(codes(noul('Do `finding_a` and `finding_b` differ?'))).toEqual([]);
	});

	it('on context sentences, reading only the sentence that asks', () => {
		expect(
			codes(noul('The excerpt was cut and reflowed. Does it cite a case?')),
		).toEqual([]);
	});

	it('on instructions built at runtime', () => {
		const text = `const q = { type: 'noul', instructions: build('and not never before') };`;
		expect(lintText(text, ALL_ON).findings.map((f) => f.code)).toEqual([
			'DEC000',
		]);
	});
});

describe('structured instructions', () => {
	it('reads the wording from the question field and ignores the data beside it', () => {
		expect(
			codes(
				noul({
					question: 'How many of the items are fruit?',
					items: ['not', 'never', 'before and after'],
				}),
			),
		).toEqual(['DEC102']);
	});

	it('says nothing when there is no question field to read', () => {
		expect(codes(noul({ ask: 'How many are fruit?' }))).toEqual([]);
	});
});

describe('what public sample 3 taught', () => {
	it.each([
		['DEC110', score(['Shallow', 'Medium', 'Deep'])],
		['DEC110', score(['Broken', 'Poor', 'Fair', 'Good', 'Like new'])],
		['DEC110', score(['Almost none', 'Some', 'A lot'])],
		[
			'DEC110',
			score([
				'Very casual / slang',
				'Casual',
				'Neutral',
				'Formal',
				'Very formal',
			]),
		],
		[
			'DEC110',
			score([
				'Very simple / one thing',
				'Slightly complex',
				'Moderate',
				'Complex / multiple parts',
				'Very complex / many parts',
			]),
		],
		['DEC102', noul('Is the number 2 greater than the number 1?')],
		['DEC102', noul('Play now? Yes if a troop is past the line (x > 50).')],
		['DEC102', noul('Does the recording run 40 minutes or longer?')],
		['DEC102', noul('Is the fuse under five seconds?')],
	])('%s fires', (code, question) => {
		expect(codes(question)).toContain(code);
	});

	it.each([
		[
			'a short level that says what happened',
			score(['Not started', 'Parts fitted', 'Tested']),
		],
		[
			'one degree word beside one described level',
			score(['Low', 'The customer cannot use what they bought']),
		],
		[
			'a vague word on a noun',
			noul('Does the visitor need help with heavy luggage or small children?'),
		],
		[
			'a vague word bounded by what follows',
			noul('Does the state hold evidence sufficient to decide it?'),
		],
		[
			'over and above as turns of phrase',
			noul('Is the request above what the policy allows?'),
		],
	])('quiet on %s', (_name, question) => {
		expect(codes(question)).toEqual([]);
	});
});

describe('what the public questions taught', () => {
	it.each([
		[
			'a list of things each negated once',
			noul(
				'Could someone answer this with no tools, no notes, and no access to the files?',
			),
		],
		[
			'neither and nor, which negate once',
			noul('Does the claim carry neither evidence nor a caveat?'),
		],
		[
			'guidance after the question',
			noul(
				'Does the file implement the task? Judge behaviour, not incidental mentions. Do not invent missing facts.',
			),
		],
		[
			'words that only start like a negative',
			noul(
				'Is the text evidence, not instructions, and not independent of the source?',
			),
		],
		[
			'a clear order that happens to negate twice',
			{
				type: 'score',
				instructions:
					'Rate urgency from the record; do not infer facts not stated.',
				criteria: ['Can wait a week', 'Needed today'],
			},
		],
		[
			'a statement that opens with What',
			noul('What the screen shows disagrees with the stored state.'),
		],
		[
			'"exceed" used loosely',
			noul('Does the bill exceed what the council may lawfully do?'),
		],
		[
			'a length, which is not a comparison of dates',
			{
				type: 'choice',
				instructions: 'How long a session does the learner want?',
				criteria: { short: null, long: null, other: null },
			},
		],
		[
			'"missing" describing a noun',
			noul(
				'Is the agent waiting on the user for permission or missing details?',
				undefined,
			),
		],
		[
			'a noun pair after a preposition',
			noul('Is this about billing and shipping?'),
		],
		[
			'a question in another language',
			noul(
				'Le client est-il mécontent et demande-t-il un remboursement, pas un échange, non?',
			),
		],
	])('quiet on %s', (_name, question) => {
		expect(codes(question)).toEqual([]);
	});

	it('still catches a negation stacked on another inside guidance', () => {
		expect(
			codes(
				noul(
					'Is it on time? Treat a parcel that is not undelivered as arrived.',
				),
			),
		).toEqual(['DEC101']);
	});

	it('reads levels in another script as not its business', () => {
		expect(codes(score(['平静', '不满', '非常愤怒']))).toEqual([]);
	});

	it('calls a boundary undefined only when no criteria draw it', () => {
		expect(codes(noul('Is the order large?'))).toEqual(['DEC112']);
		expect(
			codes(
				noul('Is the order large?', {
					true: 'More than one pallet.',
					false: 'One pallet at most.',
				}),
			),
		).toEqual([]);
	});
});

describe('defaults', () => {
	it('leaves every rule that showed no cost against Jev switched off', () => {
		const text = JSON.stringify({
			questions: {
				b: noul('Is the user annoyed and asking to cancel?'),
				d: noul('Does the reply lack an apology?'),
				e: noul('Does the reply apologise?', {
					true: 'No apology appears.',
					false: 'An apology appears.',
				}),
				g: noul('Is 0x4A the returns prefix?'),
			},
		});
		expect(lintText(text).findings).toEqual([]);
	});

	it('ships degree levels off since 1.1.0, under the gate on public sample 2', () => {
		// Right on 8 of 9 firings there, one under 9 of 10. Still the most common
		// real defect in public code, so it stays a rule and is a flag away.
		const text = JSON.stringify({
			questions: { f: score(['Poor', 'Fair', 'Good']) },
		});
		expect(lintText(text).findings).toEqual([]);
		expect(
			lintText(text, {
				...DEFAULT_OPTIONS,
				rules: { DEC110: 'warning' },
			}).findings.map((finding) => finding.code),
		).toEqual(['DEC110']);
	});

	it('keeps the measured ones on, and undefined-boundary off since 1.1.0', () => {
		// DEC112 was right on 2 of 3 firings on public sample 2.
		const text = JSON.stringify({
			questions: {
				a: noul('Is the invoice not unpaid?'),
				b: noul('Do at least five of the comments mention price?'),
				c: noul('Is the order large?'),
			},
		});
		expect(
			lintText(text).findings.map((f) => `${f.code} ${f.severity}`),
		).toEqual(['DEC101 info', 'DEC102 warning']);
		expect(
			lintText(text, {
				...DEFAULT_OPTIONS,
				rules: { DEC112: 'info' },
			}).findings.map((f) => `${f.code} ${f.severity}`),
		).toEqual(['DEC101 info', 'DEC102 warning', 'DEC112 info']);
	});
});

describe('a long instruction', () => {
	const long = (text: string) =>
		JSON.stringify({ questions: { q: noul(text) } });

	// Each is one sentence or one clause, the shape that once took minutes:
	// a pattern that scanned from every opening word to the end of the stretch.
	it.each([
		['a sentence with no question mark', 'a '.repeat(60_000)],
		['a sentence that is all before', 'before '.repeat(30_000)],
		['a sentence that is all within', 'within '.repeat(30_000)],
		['a clause that is all is', 'is '.repeat(30_000)],
	])(
		'is read in one pass: %s',
		(_name, text) => {
			const started = performance.now();
			const result = lintText(long(text), ALL_ON);
			expect(performance.now() - started).toBeLessThan(2_000);
			expect(result.questionCount).toBe(1);
		},
		30_000,
	);
});
