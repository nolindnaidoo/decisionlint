import { describe, expect, it } from 'vitest';
import type { LintOptions, ReportedFinding } from '../types';
import { fixText } from './fixAll';
import { KNOWN_VERSION, MEASURED_ON } from './limits';
import { DEFAULT_OPTIONS, lintText, syntaxFor, syntaxForPath } from './lint';

function codes(
	text: string,
	options: LintOptions = DEFAULT_OPTIONS,
): ReadonlyArray<string> {
	return lintText(text, options).findings.map((finding) => finding.code);
}

function request(questions: string, model = 'jev-1.14.0'): string {
	return `{ "state": "s", "model": "${model}", "questions": { ${questions} } }`;
}

function finding(text: string, code: string): ReportedFinding {
	const found = lintText(text).findings.find(
		(candidate) => candidate.code === code,
	);
	if (!found) throw new Error(`no ${code} finding`);
	return found;
}

function apply(text: string, target: ReportedFinding): string {
	const edit = target.fix?.edits[0];
	if (!edit) throw new Error('finding has no fix');
	return text.slice(0, edit.span.start) + edit.text + text.slice(edit.span.end);
}

const CLEAN_NOUL = `"deadline": { "type": "noul", "instructions": "Does the note name a deadline?" }`;
const CLEAN_CHOICE = `"bench": { "type": "choice", "instructions": "Which bench takes it?", "criteria": { "wheels": "Wheel work", "brakes": "Brake work", "other": "Anything else" } }`;
const CLEAN_SCORE = `"mood": { "type": "score", "instructions": "How put out?", "criteria": ["Relaxed about it", "Clearly annoyed", "Says they will go elsewhere"] }`;

describe('lintText', () => {
	it('refuses a syntax it does not have, naming the ones it does', () => {
		expect(() => lintText('{}', DEFAULT_OPTIONS, 'json' as never)).toThrow(
			'Unknown syntax "json". Use one of: js, python, rust, go.',
		);
	});

	it('reports nothing on a well-formed request', () => {
		const result = lintText(
			request(`${CLEAN_NOUL}, ${CLEAN_CHOICE}, ${CLEAN_SCORE}`),
		);
		expect(result.findings).toEqual([]);
		expect(result.questionCount).toBe(3);
		expect(result.unreadableCount).toBe(0);
	});

	it('returns early on a file that cannot hold a question', () => {
		expect(lintText('const a = { type: "x" };')).toMatchObject({
			findings: [],
			questionCount: 0,
		});
	});

	it('ignores objects that merely have a type field', () => {
		expect(codes(`const action = { type: 'choice', payload: 1 };`)).toEqual([]);
	});
});

describe('DEC000 unreadable', () => {
	it('fires when instructions are built at runtime, and counts the question', () => {
		const result = lintText(
			`const q = { questions: { a: { type: 'noul', instructions: build() } } };`,
		);
		expect(result.findings.map((found) => found.code)).toEqual(['DEC000']);
		expect(result.unreadableCount).toBe(1);
	});

	it('fires when criteria hold a spread, and skips the option rules', () => {
		expect(
			codes(
				`const q = { type: 'choice', instructions: 'Which one fits?', criteria: { ...teams } };`,
			),
		).toEqual(['DEC000']);
	});

	it('fires when a whole map entry is a runtime value', () => {
		expect(
			codes(
				`const r = { questions: { a: { type: 'noul', instructions: 'Is it so?' }, b: makeQuestion() } };`,
			),
		).toEqual(['DEC000']);
	});

	it('still counts the unreadable question when the hint is switched off', () => {
		const options = { ...DEFAULT_OPTIONS, rules: { DEC000: 'off' as const } };
		const result = lintText(
			`const q = { type: 'noul', instructions: build() };`,
			options,
		);
		expect(result.findings).toEqual([]);
		expect(result.unreadableCount).toBe(1);
	});
});

describe('DEC001 unpinned-model', () => {
	it.each(['jev-latest', 'jev-preview'])('fires on the alias %s', (alias) => {
		expect(codes(request(CLEAN_NOUL, alias))).toEqual(['DEC001']);
	});

	it('does not fire on a versioned id', () => {
		expect(codes(request(CLEAN_NOUL, 'jev-1.14.0'))).toEqual([]);
	});

	it('does not fire when the model is a runtime value', () => {
		expect(
			codes(
				`const r = { model: MODEL, questions: { a: { type: 'noul', instructions: 'Is it so?' } } };`,
			),
		).toEqual([]);
	});

	it('fires on a client constructed with an alias', () => {
		expect(
			codes(`const client = new TypeSafeClient({ model: 'jev-latest' });`),
		).toEqual(['DEC001']);
	});
});

describe('DEC013 newer-model', () => {
	it.each(['jev-1.14.1', 'jev-1.15.0', 'jev-2.0.0', 'jev-1.100.0'])(
		'fires on %s, a version above the measured one',
		(model) => {
			expect(codes(request(CLEAN_NOUL, model))).toEqual(['DEC013']);
		},
	);

	it('names both versions and offers no fix', () => {
		const found = finding(request(CLEAN_NOUL, 'jev-2.0.0'), 'DEC013');
		expect(found.message).toContain(
			`'jev-2.0.0' is newer than ${MEASURED_ON}, the version these rules were measured on.`,
		);
		expect(found.severity).toBe('info');
		expect(found.fix).toBeUndefined();
	});

	it.each([
		MEASURED_ON,
		'jev-1.12.9',
		'jev-0.99.0',
		'jev-latest-2.0.0',
		'jev-2.0.0-preview',
		'gpt-6-luna',
	])('does not fire on %s', (model) => {
		expect(codes(request(CLEAN_NOUL, model))).not.toContain('DEC013');
	});

	it('does not fire when the model is a runtime value', () => {
		expect(
			codes(
				`const r = { model: MODEL, questions: { a: { type: 'noul', instructions: 'Is it so?' } } };`,
			),
		).toEqual([]);
	});
});

describe("a model id in another platform's spelling", () => {
	it("fires DEC001 on OpenRouter's alias and pins it as OpenRouter writes a pinned id", () => {
		const text = request(CLEAN_NOUL, '~typesafe/jev-latest');
		const pin = finding(text, 'DEC001');
		expect(pin.fix?.title).toContain("Pin to 'typesafe/jev-1.14'");
		expect(apply(text, pin)).toContain('"model": "typesafe/jev-1.14"');
	});

	it('fires DEC001 with no fix on an alias whose pinned spelling no platform documents', () => {
		const pin = finding(request(CLEAN_NOUL, 'typesafe/jev-latest'), 'DEC001');
		expect(pin.fix).toBeUndefined();
	});

	it.each([
		'typesafe-ai/jev',
		'typesafe/jev-1.13',
		'ZefanCai/Open-Jev-9B',
		'laya:en',
	])('reports nothing about %s', (model) => {
		expect(codes(request(CLEAN_NOUL, model))).toEqual([]);
	});

	it('fires DEC013 on a version above the measured one in any spelling', () => {
		expect(codes(request(CLEAN_NOUL, 'typesafe/jev-2.0'))).toEqual(['DEC013']);
		expect(
			codes(request(CLEAN_NOUL, 'openai/gpt-6-luna-decisions-20261006')),
		).toEqual([]);
	});
});

describe("a model named through the AI SDK's factory", () => {
	const decide = (factory: string, questions: string) =>
		`import { experimental_decide as decide } from 'ai';\nconst r = await decide({ model: ${factory}, state, questions: { ${questions} } });`;

	it('fires DEC001 on an alias inside decisionModel(), and pins it there', () => {
		const text = decide(`typeSafeAi.decisionModel('jev-latest')`, CLEAN_NOUL);
		const pin = finding(text, 'DEC001');
		expect(text.slice(pin.span.start, pin.span.end)).toBe(`'jev-latest'`);
		expect(apply(text, pin)).toContain(`decisionModel('${KNOWN_VERSION}')`);
	});

	it("holds the request to the platform the factory's id names", () => {
		const levels = Array.from(
			{ length: 11 },
			(_, i) =>
				`"${['Nothing works', 'Starts then stops', 'Runs with faults', 'Runs with one fault', 'Runs but is slow', 'Runs at normal speed', 'Runs faster than expected', 'Handles double the load', 'Handles every load tried', 'Has never failed', 'Cannot be made to fail'][i]}"`,
		).join(', ');
		const text = decide(
			`gateway.decisionModel('typesafe-ai/jev')`,
			`"damage": { "type": "score", "instructions": "Rate the damage", "levels": [${levels}] }`,
		);
		expect(finding(text, 'DEC003').message).toBe(
			'This Score has 11 levels. Vercel AI Gateway accepts at most 10.',
		);
	});

	it('reads nothing from a factory given anything but one string', () => {
		expect(codes(decide(`openai.decisionModel(MODEL)`, CLEAN_NOUL))).toEqual(
			[],
		);
		expect(codes(decide(`pickModel('jev-latest')`, CLEAN_NOUL))).toEqual([]);
	});
});

describe('the target of a request', () => {
	const levels = [
		'Nothing works',
		'Starts then stops',
		'Runs with faults',
		'Runs with one fault',
		'Runs but is slow',
		'Runs at normal speed',
		'Runs faster than expected',
		'Handles double the load',
		'Handles every load tried',
		'Has never failed',
		'Cannot be made to fail',
	]
		.map((level, i) => `{ "label": "L${i}", "description": "${level}" }`)
		.join(', ');
	const luna = (model: string) =>
		`{ "model": "${model}", "input": "s", "questions": [ { "type": "score", "name": "q", "instructions": "Rate the damage", "levels": [${levels}] } ] }`;
	const questions = (count: number) =>
		Array.from(
			{ length: count },
			(_, i) =>
				`"q${i}": { "type": "noul", "instructions": "Does the note name deadline ${i}?" }`,
		).join(', ');

	it('holds an OpenAI-shaped request to no limit when nothing says where it goes', () => {
		expect(codes(luna('gpt-6-luna'))).toEqual([]);
		expect(codes(luna('openai/gpt-6-luna-decisions'))).toEqual([]);
	});

	it("holds it to Vercel's limits when the model id is Vercel's spelling", () => {
		const found = finding(luna('typesafe-ai/jev'), 'DEC003');
		expect(found.message).toBe(
			'This Score has 11 levels. Vercel AI Gateway accepts at most 10.',
		);
	});

	it('holds it to the configured target over the model id', () => {
		const vercel = { ...DEFAULT_OPTIONS, target: 'vercel' };
		expect(codes(luna('gpt-6-luna'), vercel)).toEqual(['DEC003']);
		const openai = { ...DEFAULT_OPTIONS, target: 'openai' };
		expect(codes(luna('typesafe-ai/jev'), openai)).toEqual([]);
	});

	it('names TypeSafe in a limit message for a TypeSafe-shaped request sent nobody knows where', () => {
		const text = request(
			`"q": { "type": "score", "instructions": "Rate the damage", "criteria": [${Array.from({ length: 11 }, (_, i) => `"Level ${i} of eleven"`).join(', ')}] }`,
		);
		expect(finding(text, 'DEC003').message).toBe(
			'This Score has 11 levels. TypeSafe accepts at most 10.',
		);
	});

	it('fires DEC014 on the first question past what the target takes in one request', () => {
		const litellm = { ...DEFAULT_OPTIONS, target: 'litellm' };
		const text = request(questions(129));
		const result = lintText(text, litellm);
		expect(result.findings.map((finding) => finding.code)).toEqual(['DEC014']);
		const found = result.findings[0];
		expect(found?.message).toBe(
			'This request has 129 questions. LiteLLM accepts at most 128 in one request.',
		);
		expect(found?.questionId).toBe('q128');
		expect(text.slice(found?.span.start, found?.span.end)).toBe('"q128"');
	});

	it('does not fire DEC014 at the limit, or for a target that publishes none', () => {
		const litellm = { ...DEFAULT_OPTIONS, target: 'litellm' };
		expect(codes(request(questions(128)), litellm)).toEqual([]);
		const openai = { ...DEFAULT_OPTIONS, target: 'openai' };
		expect(codes(request(questions(129)), openai)).toEqual([]);
		expect(codes(request(questions(129)))).toEqual([]);
	});

	it('refuses a target the table does not have, naming the ones it does', () => {
		expect(() => lintText('{}', { ...DEFAULT_OPTIONS, target: 'jay' })).toThrow(
			'Unknown target "jay". Use one of: typesafe, openai, vercel, litellm, openrouter, llmgateway, edenai, liquid, llamacpp.',
		);
	});
});

describe('DEC002 choice-option-limit', () => {
	const options = (count: number) =>
		Array.from({ length: count }, (_, i) => `"o${i}": null`).join(', ');

	it('fires above 255 options', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": { ${options(255)}, "other": null } }`,
				),
			),
		).toEqual(['DEC002']);
	});

	it('does not fire at exactly 255', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": { ${options(254)}, "other": null } }`,
				),
			),
		).toEqual([]);
	});
});

describe('DEC003 score-level-limit', () => {
	const levels = (count: number) =>
		[
			'Nothing works',
			'Starts then stops',
			'Runs with faults',
			'Runs with one fault',
			'Runs but is slow',
			'Runs at normal speed',
			'Runs faster than expected',
			'Handles double the load',
			'Handles every load tried',
			'Has never failed',
			'Cannot be made to fail',
		]
			.slice(0, count)
			.map((level) => `"${level}"`)
			.join(', ');

	it('fires above 10 levels, and calls one level informational', () => {
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": [${levels(11)}] }`,
				),
			),
		).toEqual(['DEC003']);
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": [${levels(1)}] }`,
				),
			),
		).toEqual(['DEC009']);
	});

	it('does not fire at 2 or 10', () => {
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": [${levels(2)}] }`,
				),
			),
		).toEqual([]);
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": [${levels(10)}] }`,
				),
			),
		).toEqual([]);
	});

	it('does not call a spread array too short', () => {
		expect(
			codes(
				`const q = { type: 'score', instructions: 'Rate the damage', criteria: [...LEVELS] };`,
			),
		).toEqual(['DEC000']);
	});
});

describe('DEC004 no-fallback-option', () => {
	const bare = `"bench": { "type": "choice", "instructions": "Which bench takes it?", "criteria": { "wheels": "Wheel work", "brakes": "Brake work" } }`;

	it('fires on a Choice with no fallback', () => {
		expect(codes(request(bare))).toEqual(['DEC004']);
	});

	it.each([
		'other',
		'none_of_the_above',
		'Not-Stated',
		'UNKNOWN',
		'none_implied',
		'other_or_unclear',
		'uncertain_value',
		'その他',
	])('accepts %s as a fallback', (name) => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null, "${name}": null } }`,
				),
			),
		).toEqual([]);
	});

	it('honours a configured fallback list', () => {
		const text = request(
			`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null, "misc": null } }`,
		);
		expect(codes(text)).toEqual(['DEC004']);
		expect(
			codes(text, { ...DEFAULT_OPTIONS, fallbackOptions: ['misc'] }),
		).toEqual([]);
	});

	it('fixes multi-line JSON without breaking it', () => {
		const text = `{\n  "questions": {\n    "team": {\n      "type": "choice",\n      "instructions": "Which team takes it?",\n      "criteria": {\n        "billing": "Payments",\n        "technical": "Bugs"\n      }\n    }\n  }\n}`;
		const fixed = apply(text, finding(text, 'DEC004'));
		expect(Object.keys(JSON.parse(fixed).questions.team.criteria)).toEqual([
			'billing',
			'technical',
			'other',
		]);
		expect(fixed).toContain(
			'\n        "other": "Fits none of the other options"\n',
		);
		expect(codes(fixed)).toEqual([]);
	});

	it('fixes TypeScript with a trailing comma, keeping the comma style', () => {
		const text = `const q = {\n\ttype: 'choice',\n\tinstructions: 'Which one fits?',\n\tcriteria: {\n\t\ta: 'Apples',\n\t\tb: 'Bread',\n\t},\n};`;
		const fixed = apply(text, finding(text, 'DEC004'));
		expect(fixed).toContain(
			"\t\tb: 'Bread',\n\t\tother: 'Fits none of the other options',\n\t},",
		);
		expect(codes(fixed)).toEqual([]);
	});

	it('fixes an inline object', () => {
		const text = `const q = { type: 'choice', instructions: 'Which one fits?', criteria: { a: null, b: null } };`;
		const fixed = apply(text, finding(text, 'DEC004'));
		expect(fixed).toContain(
			"{ a: null, b: null, other: 'Fits none of the other options' }",
		);
	});

	it('offers no fix when a comment follows the last option', () => {
		const text = `const q = { type: 'choice', instructions: 'Which one fits?', criteria: { a: null, b: null /* last */ } };`;
		expect(finding(text, 'DEC004').fix).toBeUndefined();
	});
});

describe('DEC005 duplicate', () => {
	it('fires on a repeated question id', () => {
		expect(codes(request(`${CLEAN_NOUL}, ${CLEAN_NOUL}`))).toEqual(['DEC005']);
	});

	it('fires on a repeated option and a repeated level', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which bench takes it?", "criteria": { "wheels": null, "wheels": null, "other": null } }`,
				),
			),
		).toEqual(['DEC005']);
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "How is the tone?", "criteria": ["Calm, just stating facts", "Angry, strong language", "Calm, just stating facts"] }`,
				),
			),
		).toEqual(['DEC005']);
	});

	it('does not fire on the same id in two separate requests', () => {
		expect(
			codes(
				`const a = ${request(CLEAN_NOUL)}; const b = ${request(CLEAN_NOUL)};`,
			),
		).toEqual([]);
	});
});

describe('DEC006 criteria-shape', () => {
	it('fires on a Choice given an array and a Score given a map', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": ["a", "b"] }`,
				),
			),
		).toEqual(['DEC006']);
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": { "low": "a", "high": "b" } }`,
				),
			),
		).toEqual(['DEC006']);
	});

	it('fires on a Choice or Score with no criteria', () => {
		expect(
			codes(
				request(`"q": { "type": "choice", "instructions": "Which one fits?" }`),
			),
		).toEqual(['DEC006']);
		expect(
			codes(
				request(
					`${CLEAN_NOUL}, "q": { "type": "score", "instructions": "Rate the damage" }`,
				),
			),
		).toEqual(['DEC006']);
	});

	it('fires on Noul criteria keys other than true and false', () => {
		expect(
			codes(
				request(
					`"q": { "type": "noul", "instructions": "Is it so?", "criteria": { "yes": "a", "no": "b" } }`,
				),
			),
		).toEqual(['DEC006', 'DEC006']);
	});

	it('accepts a Noul with documented criteria or none', () => {
		expect(
			codes(
				request(
					`"q": { "type": "noul", "instructions": "Is it so?", "criteria": { "true": "a", "false": "b" } }`,
				),
			),
		).toEqual([]);
		expect(codes(request(CLEAN_NOUL))).toEqual([]);
	});

	it('says nothing about criteria it cannot read', () => {
		expect(
			codes(
				`const q = { type: 'choice', instructions: 'Which one fits?', criteria: TEAMS };`,
			),
		).toEqual(['DEC000']);
	});
});

describe('DEC007 invalid-question', () => {
	it('fires on an unknown type beside a valid question', () => {
		expect(
			codes(
				request(
					`${CLEAN_NOUL}, "q": { "type": "chioce", "instructions": "Which one fits?" }`,
				),
			),
		).toEqual(['DEC007']);
	});

	it('fires on a missing type and on empty instructions', () => {
		expect(
			codes(
				request(`${CLEAN_NOUL}, "q": { "instructions": "Which one fits?" }`),
			),
		).toEqual(['DEC007']);
		expect(
			codes(request(`"q": { "type": "noul", "instructions": "  " }`)),
		).toEqual(['DEC007']);
	});

	it('says nothing about missing instructions, which the SDK allows', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "criteria": { "yes": null, "no": null, "other": null } }`,
				),
			),
		).toEqual([]);
	});

	it('reads the Vercel AI SDK boolean type as a Noul', () => {
		const text = `const r = { questions: { refund: { type: 'boolean', instructions: 'Is it not unpaid?' }, team: { type: 'choice', instructions: 'Which one fits?', criteria: { a: null, other: null } } } };`;
		expect(codes(text)).toEqual(['DEC101']);
	});

	it('accepts structured instructions', () => {
		expect(
			codes(
				request(
					`"q": { "type": "noul", "instructions": { "question": "Same person as \`dup\`?", "dup": { "name": "J" } } }`,
				),
			),
		).toEqual([]);
	});
});

describe('code that only looks like a question', () => {
	const sdk = `import { choice, noul, score, TypeSafeClient } from '@typesafe-ai/sdk';\n`;

	it('ignores a local helper that shares a name with one the file did not import', () => {
		const text = `import { TypeSafeClient } from '@typesafe-ai/sdk';\nconst q = noul('Was it passing?', ['regression', 'It passed before'], ['flag', 'It failed before']);`;
		expect(lintText(text).questionCount).toBe(0);
	});

	it('ignores method calls, method declarations and signatures named like a helper', () => {
		const text = `${sdk}class Answers {\n\tchoice(name: string): string | undefined { return this.read(name)?.choice; }\n\tasync score(params: Rubric): Promise<number> { return 1; }\n}\ninterface Reader { noul(key: string): number | undefined; }\nconst picked = answers.choice('team');`;
		expect(lintText(text).questionCount).toBe(0);
	});

	it('still reads a helper call inside a conditional', () => {
		const text = `${sdk}const q = { questions: { a: strict ? choice('Which one fits?', { a: null, other: null }) : noul('Is it so?') } };`;
		expect(lintText(text).questionCount).toBe(2);
		const direct = `${sdk}const q = strict ? choice('Which one fits?', { a: null }) : undefined;`;
		expect(codes(direct)).toEqual(['DEC009']);
	});

	it('does not call criteria missing when a spread may supply them', () => {
		expect(
			codes(
				`const q = { type: 'choice', instructions: 'Which one fits?', ...rest };`,
			),
		).toEqual([]);
	});

	it("does not call criteria missing on another client's question shape", () => {
		const text = `const state = [{ key: 'a', type: 'score', instructions: 'How important is it?', options: [] }, { key: 'b', type: 'noul', instructions: '', options: [] }];`;
		expect(codes(text)).toEqual([]);
	});

	it('accepts a Noul whose criteria are an empty array', () => {
		expect(
			codes(
				request(
					`"q": { "type": "noul", "instructions": "Is it so?", "criteria": [] }`,
				),
			),
		).toEqual([]);
	});
});

describe('where findings point', () => {
	const underlined = (text: string, code: string): string => {
		const found = finding(text, code);
		return text.slice(found.span.start, found.span.end);
	};

	it('underlines the unknown type itself, not the question id', () => {
		const text = request(
			`${CLEAN_NOUL}, "q": { "type": "chioce", "instructions": "Which one fits?" }`,
		);
		expect(underlined(text, 'DEC007')).toBe('"chioce"');
	});

	it('underlines the criteria key when the criteria have the wrong shape', () => {
		const text = request(
			`"q": { "type": "score", "instructions": "Rate the damage", "criteria": { "low": "a", "high": "b" } }`,
		);
		expect(underlined(text, 'DEC006')).toBe('"criteria"');
	});

	it('underlines the question id when the criteria are missing altogether', () => {
		const text = request(
			`"q": { "type": "choice", "instructions": "Which one fits?" }`,
		);
		expect(underlined(text, 'DEC006')).toBe('"q"');
	});

	it('underlines the helper name when a helper call has the wrong shape', () => {
		const text = `import { choice } from '@typesafe-ai/sdk';\nconst q = choice('Which?', ['a', 'b']);`;
		expect(underlined(text, 'DEC006')).toBe('choice');
	});
});

describe('mechanical fixes', () => {
	const fixed = (text: string, code: string) =>
		apply(text, finding(text, code));

	it('renames yes and no criteria to true and false, one key at a time', () => {
		const text = request(
			`"q": { "type": "noul", "instructions": "Is it so?", "criteria": { "yes": "a", "No": "b" } }`,
		);
		const once = fixed(text, 'DEC006');
		expect(once).toContain('"true": "a"');
		expect(fixed(once, 'DEC006')).toContain('"false": "b"');
		expect(codes(fixed(once, 'DEC006'))).toEqual([]);
	});

	it('offers no rename for a key it cannot map', () => {
		const text = request(
			`"q": { "type": "noul", "instructions": "Is it so?", "criteria": { "maybe": "a" } }`,
		);
		expect(finding(text, 'DEC006').fix).toBeUndefined();
	});

	it('corrects a type that is one real type away, keeping the quotes', () => {
		const json = request(
			`${CLEAN_NOUL}, "q": { "type": "nuol", "instructions": "Is it so?" }`,
		);
		expect(fixed(json, 'DEC007')).toContain('"type": "noul"');
		const ts = `const r = { questions: { a: { type: 'noul', instructions: 'Is it so?' }, b: { type: 'chioce', instructions: 'Which one fits?' } } };`;
		expect(fixed(ts, 'DEC007')).toContain("type: 'choice'");
	});

	it('offers no correction for a type that resembles none', () => {
		const text = request(
			`${CLEAN_NOUL}, "q": { "type": "ranking", "instructions": "Order them by size" }`,
		);
		expect(finding(text, 'DEC007').fix).toBeUndefined();
	});

	it('pins an alias and says when that version was current', () => {
		const text = request(CLEAN_NOUL, 'jev-latest');
		const pin = finding(text, 'DEC001');
		expect(pin.fix?.title).toMatch(
			/^Pin to 'jev-\d+\.\d+\.\d+', the version current on \d{4}-\d{2}-\d{2}$/,
		);
		// Pinned to the current release, which DEC013 reports as newer than the
		// measured one until the checks are measured on it again.
		expect(codes(apply(text, pin))).toEqual(
			(KNOWN_VERSION as string) === MEASURED_ON ? [] : ['DEC013'],
		);
	});

	it('turns a Score map into an array, keeping every description', () => {
		const text = `{\n  "questions": {\n    "q": {\n      "type": "score",\n      "instructions": "How worn is it?",\n      "criteria": {\n        "light": "One fault, otherwise looked after",\n        "heavy": "Several faults left a while"\n      }\n    }\n  }\n}`;
		const out = fixed(text, 'DEC006');
		expect(JSON.parse(out).questions.q.criteria).toEqual([
			'One fault, otherwise looked after',
			'Several faults left a while',
		]);
		expect(out).toContain(
			'"criteria": [\n        "One fault, otherwise looked after",\n        "Several faults left a while"\n      ]',
		);
		expect(codes(out)).toEqual([]);
	});

	it('turns a Choice array into a map on one line', () => {
		const text = `const r = { questions: { q: { type: 'choice', instructions: 'Which one fits?', criteria: ['a', 'b', 'other'] } } };`;
		const out = fixed(text, 'DEC006');
		expect(out).toContain("criteria: { 'a': null, 'b': null, 'other': null }");
		expect(codes(out)).toEqual([]);
	});

	it('offers no reshape when a value was built at runtime', () => {
		const text = `const r = { questions: { a: { type: 'noul', instructions: 'Is it so?' }, q: { type: 'score', instructions: 'Rate the damage', criteria: { low: lowText, high: 'High' } } } };`;
		expect(finding(text, 'DEC006').fix).toBeUndefined();
	});
});

describe('DEC008 numeric-levels', () => {
	it('fires when every level is a bare number', () => {
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate 0 to 2", "criteria": ["0", "1", "2"] }`,
				),
			),
		).toEqual(['DEC008']);
		expect(
			codes(
				`const q = { type: 'score', instructions: 'Rate the damage', criteria: [0, 1, 2] };`,
			),
		).toEqual(['DEC008']);
	});

	it('does not fire when levels are described', () => {
		expect(codes(request(CLEAN_SCORE))).toEqual([]);
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": ["0", "Somewhat broken", "2"] }`,
				),
			),
		).toEqual([]);
	});
});

describe('levels that differ only by a number', () => {
	it('are read as a ladder of one word, when that rule is switched on', () => {
		expect(
			codes(
				request(
					`"q": { "type": "score", "instructions": "Rate the damage", "criteria": ["Level 1", "Level 2", "Level 3"] }`,
				),
				{ ...DEFAULT_OPTIONS, rules: { DEC110: 'warning' } },
			),
		).toEqual(['DEC110']);
	});
});

describe('what a question lacks, outside a request', () => {
	it('is not reported for a lone object, which may be a template or a mock', () => {
		expect(
			codes(`const q = { type: 'choice', instructions: 'Which one fits?' };`),
		).toEqual([]);
		// A function that builds a question from its parameters is not a question.
		expect(
			codes(
				`const build = (instructions) => ({ type: 'score', instructions });`,
			),
		).toEqual([]);
		expect(
			codes(`const q = { type: 'score', instructions: makeText() };`),
		).toEqual(['DEC000']);
	});

	it('is reported for an entry in a questions map', () => {
		expect(
			codes(
				`const r = { questions: { a: { type: 'noul', instructions: 'Is it so?' }, b: { type: 'score', instructions: 'Rate the damage', min: 1, max: 10 } } };`,
			),
		).toEqual(['DEC006']);
	});

	it('is not concluded from a template slot', () => {
		expect(
			codes(
				request(
					`"a": { "type": "noul", "instructions": "Is it so?" }, "q": { "type": "choice", "instructions": "$question", "criteria": "$options" }`,
				),
			),
		).toEqual([]);
	});

	it("makes no shape claim when another client's fields are present", () => {
		expect(
			codes(
				`const r = { questions: { a: { type: 'noul', instructions: 'Is it so?' }, b: { type: 'choice', instructions: 'Which way is it?', options: ['LEFT', 'RIGHT'], criteria: ['be decisive'] } } };`,
			),
		).toEqual([]);
	});
});

describe('DEC009 too-few-options', () => {
	it('fires on one option and on none', () => {
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null } }`,
				),
			),
		).toEqual(['DEC009']);
		expect(
			codes(
				request(
					`"q": { "type": "choice", "instructions": "Which one fits?", "criteria": {} }`,
				),
			),
		).toEqual(['DEC009']);
	});
});

describe('sources', () => {
	it('reads SDK helper calls when the SDK is imported', () => {
		const text = `import { choice, noul, score } from '@typesafe-ai/sdk';\nconst questions = {\n  team: choice('Which team takes it?', { billing: null, technical: null }),\n  urgent: noul('Is it urgent?'),\n  mood: score('How angry are they?', ['1', '2']),\n};`;
		expect(codes(text)).toEqual(['DEC004', 'DEC008']);
		expect(lintText(text).questionCount).toBe(3);
	});

	it('ignores a function named like a helper when the SDK is not imported', () => {
		expect(codes(`const pick = choice('Which team?', ['a', 'b']);`)).toEqual(
			[],
		);
	});

	it('finds a request passed to a call inside a callback', () => {
		const text = `export const run = async (state) => handler({ go: () => client.systemOne({ state, model: 'jev-latest', questions: { team: { type: 'choice', instructions: 'Which one fits?', criteria: { a: null, b: null } } } }) });`;
		expect(codes(text)).toEqual(['DEC001', 'DEC004']);
	});

	it('reads oxlint-plugin-jev rules as Noul questions', () => {
		const text = `{ "jsPlugins": ["oxlint-plugin-jev"], "rules": { "jev/ask": ["error", { "model": "jev-latest", "rules": [ { "id": "a", "target": "call", "question": "Does this log personal data?", "cutoff": 0.8 }, { "id": "a", "target": "file", "question": "", "cutoff": 0.6 } ] }] } }`;
		expect(codes(text)).toEqual(['DEC001', 'DEC005', 'DEC007']);
		expect(lintText(text).questionCount).toBe(2);
	});
});

describe('suppression', () => {
	const bare = `{ type: 'choice', instructions: 'Which one fits?', criteria: { a: null, b: null } }`;

	it('silences the next line, the same line and the whole file', () => {
		expect(
			codes(`// decisionlint-disable-next-line DEC004\nconst q = ${bare};`),
		).toEqual([]);
		expect(codes(`const q = ${bare}; // decisionlint-disable-line`)).toEqual(
			[],
		);
		expect(
			codes(`/* decisionlint-disable DEC004 */\n\n\nconst q = ${bare};`),
		).toEqual([]);
	});

	it('reads the code a rule had before 1.0.0, under either directive', () => {
		expect(
			codes(`// decisionlint-disable-next-line JEV004\nconst q = ${bare};`),
		).toEqual([]);
		expect(
			codes(`// jevlint-le-disable-next-line JEV004\nconst q = ${bare};`),
		).toEqual([]);
	});

	it('leaves other rules and other lines alone, and reports the comment that silenced nothing', () => {
		expect(
			codes(`// decisionlint-disable-next-line DEC001\nconst q = ${bare};`),
		).toEqual(['DEC010', 'DEC004']);
		expect(
			codes(`// decisionlint-disable-next-line DEC004\n\nconst q = ${bare};`),
		).toEqual(['DEC010', 'DEC004']);
	});

	describe('a comment that silences nothing', () => {
		const clean = `{ type: 'noul', instructions: 'Did the parcel arrive after the promised day?' }`;
		const found = (text: string, rules = {}) =>
			lintText(text, { rules, fallbackOptions: ['other'], ignore: [] })
				.findings;

		it('is reported, at the comment', () => {
			const text = `// decisionlint-disable-next-line DEC004\nconst q = ${clean};`;
			const [finding] = found(text);
			expect(finding?.code).toBe('DEC010');
			expect(finding?.severity).toBe('warning');
			expect(text.slice(finding?.span.start, finding?.span.end)).toBe(
				'decisionlint-disable-next-line DEC004',
			);
		});

		it('is not reported when it silences a finding', () => {
			expect(
				codes(`// decisionlint-disable-next-line DEC004\nconst q = ${bare};`),
			).toEqual([]);
			expect(codes(`// decisionlint-disable\nconst q = ${bare};`)).toEqual([]);
		});

		it('is reported when the rule it names is switched off, since that rule reports nothing', () => {
			const text = `// decisionlint-disable-next-line DEC004\nconst q = ${bare};`;
			expect(found(text, { DEC004: 'off' }).map((f) => f.code)).toEqual([
				'DEC010',
			]);
		});

		it('is not reported when it names only rules that Jev checks, which linting never runs', () => {
			expect(
				codes(
					`// decisionlint-disable-next-line DEC303 DEC305\nconst q = ${clean};`,
				),
			).toEqual([]);
		});

		it('says to name the rule when it names none', () => {
			const [finding] = found(`// decisionlint-disable\nconst q = ${clean};`);
			expect(finding?.message).toContain('name the rule');
		});

		it('can be switched off, and is not silenced by the comment it reports', () => {
			const text = `// decisionlint-disable\nconst q = ${clean};`;
			expect(found(text).map((f) => f.code)).toEqual(['DEC010']);
			expect(found(text, { DEC010: 'off' })).toEqual([]);
		});

		it('costs nothing in a file with no such comment', () => {
			expect(codes(`const q = ${clean};`)).toEqual([]);
		});
	});

	it('drops a finding listed under the code the rule had before 1.0.0', () => {
		const text = request(
			`"team": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null, "b": null } }`,
		);
		expect(
			codes(text, { ...DEFAULT_OPTIONS, ignore: ['JEV004:team'] }),
		).toEqual([]);
	});

	it('drops a finding listed in the ignore setting', () => {
		const text = request(
			`"team": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null, "b": null } }`,
		);
		expect(
			codes(text, { ...DEFAULT_OPTIONS, ignore: ['DEC004:team'] }),
		).toEqual([]);
		expect(
			codes(text, { ...DEFAULT_OPTIONS, ignore: ['DEC004:other'] }),
		).toEqual(['DEC004']);
	});

	it('applies a configured severity and switches a rule off', () => {
		const text = request(
			`"team": { "type": "choice", "instructions": "Which one fits?", "criteria": { "a": null, "b": null } }`,
		);
		expect(lintText(text).findings[0]?.severity).toBe('info');
		expect(
			lintText(text, { ...DEFAULT_OPTIONS, rules: { DEC004: 'error' } })
				.findings[0]?.severity,
		).toBe('error');
		expect(
			codes(text, { ...DEFAULT_OPTIONS, rules: { DEC004: 'off' } }),
		).toEqual([]);
	});
});

describe('a request whose only question is broken', () => {
	const lone = (question: string) =>
		codes(`{ "questions": { "late": ${question} } }`);

	it('is reported when the type is one slip from a real one', () => {
		expect(
			lone(`{ "type": "nuol", "instructions": "Did it arrive late?" }`),
		).toEqual(['DEC007']);
		expect(
			lone(
				`{ "type": "choise", "instructions": "Which team takes it?", "criteria": { "a": "A", "other": "Else" } }`,
			),
		).toEqual(['DEC007']);
		expect(
			lone(`{ "type": "scor", "instructions": "How late is it?" }`),
		).toEqual(['DEC007']);
	});

	it('is reported when it has criteria and no type', () => {
		expect(
			lone(
				`{ "instructions": "Did it arrive late?", "criteria": { "true": "Late", "false": "On time" } }`,
			),
		).toEqual(['DEC007']);
	});

	it.each([
		[
			'a type that is not a slip from a real one',
			`{ "type": "multiple", "instructions": "Pick one of them" }`,
		],
		[
			'a type from another kind of schema',
			`{ "type": "bool", "instructions": "Tick if true" }`,
		],
		[
			'a field no question has',
			`{ "type": "nuol", "instructions": "Did it arrive late?", "points": 5 }`,
		],
		[
			'instructions and nothing else',
			`{ "instructions": "Read each line aloud" }`,
		],
		['no instructions', `{ "type": "nuol", "text": "Did it arrive late?" }`],
	])(
		"is left alone when it has %s, since it may be another program's data",
		(_, question) => {
			expect(lone(question)).toEqual([]);
		},
	);

	it('is still read when no other word in the file marks it as Jev', () => {
		const text = `{ "questions": { "late": { "type": "nuol", "instructions": "Did it arrive late?" } } }`;
		expect(text).not.toMatch(/noul|choice|score|jev/);
		expect(codes(text)).toEqual(['DEC007']);
	});

	it('offers the fix for the slip', () => {
		const text = `{ "questions": { "late": { "type": "nuol", "instructions": "Did it arrive late?" } } }`;
		const [finding] = lintText(text).findings;
		expect(finding?.fix?.title).toBe("Change to 'noul'");
	});
});

describe('DEC011 description-repeats-name', () => {
	it('fires on an option described as its own name, however spelt', () => {
		const text = request(
			`"team": { "type": "choice", "instructions": "Which team takes it?", "criteria": { "billing": "Billing", "tech_support": "Tech support.", "a": "Option A", "other": "Anything else" } }`,
		);
		const found = lintText(text).findings.filter((f) => f.code === 'DEC011');
		expect(found.map((f) => f.message)).toEqual([
			expect.stringContaining("'billing' only repeats its name"),
			expect.stringContaining("'tech_support' only repeats its name"),
			expect.stringContaining("'a' only repeats its name"),
		]);
	});

	it('fires on Noul criteria that say yes and no', () => {
		const text = request(
			`"angry": { "type": "noul", "instructions": "Is the customer angry?", "criteria": { "true": "Yes", "false": "No." } }`,
		);
		expect(codes(text)).toEqual(['DEC011', 'DEC011']);
	});

	it('is quiet on a description, a null, or criteria that describe the case', () => {
		const text = request(
			`"team": { "type": "choice", "instructions": "Which team takes it?", "criteria": { "billing": "Charges and refunds", "calm": null, "other": "Anything else" } }, "angry": { "type": "noul", "instructions": "Is the customer angry?", "criteria": { "true": "Hostile or shouting", "false": "Civil, even if unhappy" } }`,
		);
		expect(codes(text)).toEqual([]);
	});
});

describe('DEC012 terse-instructions', () => {
	it.each([
		['one word', 'Refund?', 'are one word'],
		['two words', 'Pick one.', 'are two words'],
		['a bare question mark', '?', 'have no words in them'],
	])('fires on %s', (_name, instructions, said) => {
		const text = request(
			`"q": { "type": "noul", "instructions": ${JSON.stringify(instructions)} }`,
		);
		const found = lintText(text).findings.find((f) => f.code === 'DEC012');
		expect(found?.message).toContain(`The instructions ${said}`);
	});

	it.each([
		[
			'three words',
			`"q": { "type": "noul", "instructions": "Is this toxic?" }`,
		],
		[
			'two words that ask something',
			`"q": { "type": "score", "instructions": "How severe?", "criteria": ["A typo", "Nobody can log in"] }`,
		],
		[
			'a field name counted as a word',
			`"q": { "type": "noul", "instructions": "Is \`text\` relevant?" }`,
		],
		[
			'an empty string, which DEC007 reports',
			`"q": { "type": "noul", "instructions": "" }`,
		],
		['a template slot', `"q": { "type": "noul", "instructions": "$question" }`],
		[
			'text in another script',
			`"q": { "type": "noul", "instructions": "至急？" }`,
		],
	])('is quiet on %s', (_name, question) => {
		expect(codes(request(question))).not.toContain('DEC012');
	});

	it("is quiet on another client's question shape", () => {
		expect(
			codes(
				`const qs = [{ key: 'a', type: 'noul', instructions: 'Refund?', options: [] }];`,
			),
		).toEqual([]);
	});
});

describe('DEC006 on a list of options wrapped in a one-option map', () => {
	const wrapped = `const q = { questions: { team: { type: 'choice', instructions: 'Which team takes it?', criteria: { options: ['billing', 'technical', 'other'] } } } };`;

	it('reports it as the shape mistake it is, not as a one-option Choice', () => {
		const found = lintText(wrapped).findings;
		expect(found.map((f) => f.code)).toEqual(['DEC006']);
		expect(found[0]?.message).toContain("answers 'options' every time");
	});

	it('offers the map as an unsafe fix, since the API accepts the mistake', () => {
		const found = finding(wrapped, 'DEC006');
		expect(found.fix?.safe).toBe(false);
		const mended = apply(wrapped, found);
		expect(mended).toContain(
			"criteria: { 'billing': null, 'technical': null, 'other': null }",
		);
		expect(codes(mended)).toEqual([]);
	});
});

describe('text that names a property of Object.prototype', () => {
	const NAMES = [
		'constructor',
		'toString',
		'valueOf',
		'hasOwnProperty',
		'__proto__',
	];

	it.each(NAMES)('reports a Noul criteria key %s and offers no fix', (key) => {
		const text = request(
			`"q": { "type": "noul", "instructions": "Has it shipped?", "criteria": { "${key}": "It left.", "false": "Still here." } }`,
		);
		const [found] = lintText(text).findings;
		expect(found).toMatchObject({ code: 'DEC006', fix: undefined });
		expect(fixText(text, DEFAULT_OPTIONS)).toEqual({ text, fixed: 0 });
	});

	it.each(NAMES)(
		'reads a question of type %s as any other unknown type',
		(type) => {
			// Alone in its map, a type that is no slip from a real one is some other program's data.
			const alone = (name: string) =>
				request(
					`"q": { "type": "${name}", "instructions": "Has it shipped?" }`,
				);
			expect(lintText(alone(type))).toEqual(lintText(alone('gizmo')));
			// Beside a real question, it is a question with a type the API does not have.
			const beside = request(
				`${CLEAN_NOUL}, "q": { "type": "${type}", "instructions": "Has it shipped?" }`,
			);
			expect(finding(beside, 'DEC007').message).toContain(
				`Question type "${type}" does not exist`,
			);
		},
	);

	it.each(NAMES)(
		'reads a bare JavaScript name %s as a value it cannot see',
		(name) => {
			const text = `const r = { questions: { q: { type: 'noul', instructions: ${name}, criteria: ${name} } } };`;
			expect(codes(text)).toEqual(['DEC000']);
			expect(lintText(text).unreadableCount).toBe(1);
		},
	);

	it.each([
		[
			'python',
			(name: string) =>
				`q = {"type": "noul", "instructions": "Has it shipped?", "criteria": ${name}}`,
		],
		[
			'rust',
			(name: string) =>
				`let q = json!({"type": "noul", "instructions": "Has it shipped?", "criteria": ${name}});`,
		],
		[
			'go',
			(name: string) =>
				`q := map[string]any{"type": "noul", "instructions": "Has it shipped?", "criteria": ${name}}`,
		],
	] as const)(
		'reads a bare %s name as a value it cannot see',
		(syntax, write) => {
			for (const name of NAMES) {
				const result = lintText(write(name), DEFAULT_OPTIONS, syntax);
				expect(
					result.findings.map((finding) => finding.code),
					name,
				).toEqual(['DEC000']);
			}
		},
	);
});

describe('the file types the tool reads', () => {
	it('are resolved from the extension alone, and from no inherited name', () => {
		expect(syntaxForPath('request.jev.json')).toBe('js');
		expect(syntaxForPath('A.JSON')).toBe('js');
		expect(syntaxForPath('triage.py')).toBe('python');
		expect(syntaxForPath('noext')).toBeUndefined();
		expect(syntaxForPath('.env')).toBeUndefined();
		for (const name of ['constructor', '__proto__', 'hasOwnProperty'])
			expect(syntaxForPath(`a.${name}`), name).toBeUndefined();
	});

	it('read an editor language id that is not theirs as JavaScript', () => {
		expect(syntaxFor('python')).toBe('python');
		expect(syntaxFor('json')).toBe('js');
		expect(syntaxFor('constructor')).toBe('js');
	});

	it('refuse a syntax named for a property of Object.prototype', () => {
		expect(() =>
			lintText('{}', DEFAULT_OPTIONS, 'constructor' as never),
		).toThrow(
			'Unknown syntax "constructor". Use one of: js, python, rust, go.',
		);
	});
});

describe("a directive written under the tool's old name", () => {
	const bad = `const q = { type: 'choice', instructions: 'Which one fits?', criteria: { a: null, b: null } };`;

	it('still silences', () => {
		expect(codes(`// jevlint-le-disable-next-line DEC004\n${bad}`)).toEqual([]);
		expect(codes(`// jevlint-le-disable DEC004\n${bad}`)).toEqual([]);
	});

	it('is still reported when it silences nothing', () => {
		expect(codes(`// jevlint-le-disable-next-line DEC009\n${bad}`)).toEqual([
			'DEC010',
			'DEC004',
		]);
	});
});
