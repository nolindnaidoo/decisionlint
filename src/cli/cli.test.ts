import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Fetch } from '../ask/client';
import { rulePage } from '../docs/rulePages';
import { EXTENSIONS } from '../lint/lint';
import { RULE_CODES, RULES } from '../lint/rules';
import { FLAG_NAMES, helpText, parseArgs } from './args';
import type { Files } from './files';
import { EXIT, type Io, run } from './run';

const BAD = `{ "model": "jev-1.13.0", "questions": { "team": { "type": "choice", "instructions": "Which team takes it?", "criteria": { "billing": "Charges", "technical": "Faults" } }, "mood": { "type": "score", "instructions": "How upset are they?", "criteria": { "low": "Calm" } } } }`;
const CLEAN = `{ "model": "jev-1.13.0", "questions": { "late": { "type": "noul", "instructions": "Did the parcel arrive after the promised day?" } } }`;
const PYTHON = `from typesafe_sdk import Noul\nq = {"questions": {"a": Noul(instructions=f"Is {name} late?")}}\n`;

// What a check with Jev is given and answered with, for the command line and the server alike.
const VAGUE = `const r = { questions: { big: { type: 'noul', instructions: 'Is the order large?' } } };`;
const HEAVY = `const r = { questions: { heavy: { type: 'noul', instructions: 'Is the parcel heavy?' } } };`;
const RUNTIME = `const r = { questions: { a: { type: 'noul', instructions: build() } } };`;
const STATED = `{ "state": { "note": "Wheel wobbles." }, "model": "jev-1.13.0", "questions": { "a": { "type": "noul", "instructions": "Is there one?" }, "b": { "type": "noul", "instructions": "Are there two?" } } }`;
const KEY = { TYPESAFE_API_KEY: 'apikey_secret_value' };

// One answer per question asked, as TypeSafe answers; the given ones override a no.
const answerAll = (body: string): Record<string, { noul: number }> =>
	Object.fromEntries(
		Object.keys(JSON.parse(body).questions ?? {}).map((id) => [
			id,
			{ noul: 0 },
		]),
	);
const jevSays = (
	answers: Record<string, { noul: number }> = {},
	status = 200,
) =>
	vi.fn(async (_url: string, init: { body: string }) => ({
		ok: status === 200,
		status,
		json: async () => ({
			model: 'jev-1.13.0',
			answers: { ...answerAll(init.body), ...answers },
			usage: { input_tokens: 310 },
		}),
		text: async () => '',
	}));
type Sent = ReturnType<typeof jevSays>;
const world = (fetch: Sent, env: Record<string, string> = KEY) => ({
	env,
	fetch: fetch as unknown as Fetch,
});
const calls = (fetch: Sent) =>
	fetch.mock.calls.map((call) => {
		const [, init] = call as unknown as [
			string,
			{ body: string; headers: Record<string, string> },
		];
		return { body: JSON.parse(init.body), headers: init.headers };
	});

function disk(tree: Record<string, string>): Files {
	const dirs = new Set(['.']);
	for (const path of Object.keys(tree)) {
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i += 1)
			dirs.add(parts.slice(0, i).join('/'));
	}
	const children = (dir: string) => {
		const prefix = dir === '.' ? '' : `${dir}/`;
		const names = [...Object.keys(tree), ...dirs]
			.filter((path) => path !== '.' && path.startsWith(prefix))
			.map((path) => path.slice(prefix.length).split('/')[0] as string);
		return [...new Set(names)];
	};
	return {
		stat: (path) => {
			if (dirs.has(path)) return { kind: 'dir', size: 0 };
			const text = tree[path];
			return text === undefined
				? undefined
				: { kind: 'file', size: text.length };
		},
		list: children,
		read: (path) => tree[path] ?? '',
		write: (path, text) => {
			tree[path] = text;
		},
	};
}

type World = Readonly<{
	/** The width of the terminal reading the output. */
	columns?: number;
	/** Changes the fake disk, to make part of it fail. */
	files?: (disk: Files) => Files;
	env?: Record<string, string>;
	fetch?: Fetch;
	signal?: AbortSignal;
}>;

const offline = () =>
	vi.fn(async () => {
		throw new Error('offline');
	}) as unknown as Fetch;

async function cli(
	args: string[],
	tree: Record<string, string> = {},
	stdin = '',
	world: World = {},
) {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = {
		files: (world.files ?? ((files) => files))(disk(tree)),
		stdin: async () => stdin,
		lines: async function* () {
			yield* stdin.split('\n');
		},
		out: (text) => out.push(text),
		err: (text) => err.push(text),
		version: '9.9.9',
		env: world.env ?? {},
		terminal: false,
		columns: world.columns,
		fetch: world.fetch ?? offline(),
		wait: async () => {},
		stopSignal: () => world.signal ?? new AbortController().signal,
	};
	const status = await run(args, io);
	return { status, out: out.join(''), err: err.join('') };
}

describe('arguments', () => {
	it('lists every flag in the help', () => {
		const help = helpText();
		for (const name of FLAG_NAMES)
			expect(help).toMatch(new RegExp(`[ ,] ${name}[ \\n<]`));
	});

	// A flag added to the table and left out of a readme is one nobody finds.
	it.each(['README.md', 'npm/README.md'])('are all listed in %s', (readme) => {
		const text = readFileSync(readme, 'utf8');
		const documented = FLAG_NAMES.filter(
			(name) => name !== '--help' && name !== '--version',
		);
		expect(documented.filter((name) => !text.includes(`\`${name}`))).toEqual(
			[],
		);
	});

	it.each([
		[['-h'], 'Usage: decisionlint'],
		[['-v'], '9.9.9'],
	])('takes %j as an option, not as a file', async (args, said) => {
		const result = await cli(args);
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain(said);
	});

	it('takes -f and -c for --format and --config', () => {
		const parsed = parseArgs(['-f', 'json', '-c=team.json', 'src']);
		expect(parsed.ok && parsed.options).toMatchObject({
			format: 'json',
			config: 'team.json',
			paths: ['src'],
		});
	});

	it('refuses a dash option it does not know, where it used to look for a file', async () => {
		const result = await cli(['-x']);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain("Unknown option '-x'");
	});

	it('takes a value after the flag or after an equals sign', () => {
		const spaced = parseArgs(['--format', 'json', 'a.json']);
		const joined = parseArgs(['--format=json', 'a.json']);
		expect(spaced).toEqual(joined);
		expect(spaced.ok && spaced.options.format).toBe('json');
	});

	it.each([
		[['--fromat', 'json'], "Unknown option '--fromat'."],
		[['--format'], '--format needs a value'],
		[['--format', 'xml'], "'xml' is not a format"],
		[['--rule', 'DEC999=off'], "'DEC999' is not a rule code"],
		[['--rule', 'DEC004=loud'], "'loud' is not a level"],
		[['--max-warnings', 'few'], "'few' is not a whole number"],
		[['--quiet=yes'], '--quiet takes no value'],
	])('refuses %j', async (args, reason) => {
		const result = await cli(args, { 'a.json': CLEAN });
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(reason);
		expect(result.out).toBe('');
	});

	it('prints the help and the version', async () => {
		expect((await cli(['--help'])).out).toContain('Usage: decisionlint');
		expect((await cli(['--version'])).out).toBe('9.9.9\n');
	});
});

describe('a run', () => {
	it('passes a clean file and says what it read', async () => {
		const result = await cli(['a.json'], { 'a.json': CLEAN });
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toBe(
			'0 findings (0 errors, 0 warnings) in 1 question across 1 file.\n',
		);
	});

	it('fails on an error and prints each finding with its place', async () => {
		const result = await cli(['--format', 'compact', 'a.json'], {
			'a.json': `\n${BAD}`,
		});
		expect(result.status).toBe(EXIT.failed);
		const lines = result.out.split('\n');
		expect(lines[0]).toMatch(/^a\.json:2:\d+ {2}info {2}DEC004 {2}/);
		expect(lines[1]).toMatch(/^a\.json:2:\d+ {2}error {2}DEC006 {2}/);
		expect(result.out).toContain(
			'2 findings (1 error, 0 warnings) in 2 questions across 1 file.',
		);
	});

	it('passes on warnings until there are more than --max-warnings', async () => {
		const tree = { 'a.json': CLEAN.replace('jev-1.13.0', 'jev-latest') };
		expect((await cli(['a.json'], tree)).status).toBe(EXIT.passed);
		expect((await cli(['a.json', '--max-warnings', '1'], tree)).status).toBe(
			EXIT.passed,
		);
		expect((await cli(['a.json', '--max-warnings', '0'], tree)).status).toBe(
			EXIT.failed,
		);
	});

	it('searches a directory, reads Python, and skips installed packages', async () => {
		const result = await cli(['--format', 'compact', 'src'], {
			'src/a.json': CLEAN,
			'src/deep/b.py': PYTHON,
			'src/node_modules/x/c.json': BAD,
			'src/notes.md': BAD,
		});
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain('src/deep/b.py:2:');
		expect(result.out).toContain(
			'in 2 questions across 2 files. 1 question could not be read in full.',
		);
	});

	it('lints the current directory when given no path', async () => {
		const result = await cli([], { 'a.json': CLEAN, 'b.json': CLEAN });
		expect(result.out).toContain('across 2 files');
	});

	it.each([
		[
			'a path that does not exist',
			['gone.json'],
			'No such file or directory: gone.json',
		],
		[
			'a file type it does not read',
			['notes.md'],
			'Not a file type decisionlint reads: notes.md',
		],
		['a directory with nothing to read', ['empty'], 'No files to lint'],
	])('refuses %s', async (_name, args, reason) => {
		const result = await cli(args, { 'notes.md': BAD, 'empty/readme.md': '' });
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(reason);
	});

	it('exits 2 when there is nothing to lint, unless told that is fine', async () => {
		const strict = await cli(['.'], { 'notes.md': 'x' });
		expect(strict.status).toBe(EXIT.unusable);
		const allowed = await cli(['--no-error-on-unmatched-pattern', '.'], {
			'notes.md': 'x',
		});
		expect(allowed.status).toBe(EXIT.passed);
		expect(allowed.out).toContain('across 0 files.');
	});

	it('holds standard input to the size limit files are held to', async () => {
		const result = await cli(
			['--stdin-filename', 'q.json'],
			{},
			`${CLEAN}${' '.repeat(2_000_000)}`,
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('Standard input is over the size limit');
	});

	it('names a file it left unread for its size', async () => {
		const result = await cli(['.'], {
			'a.json': CLEAN,
			'big.json': ' '.repeat(1_000_001),
		});
		expect(result.out).toContain(
			'1 file over the size limit not read: big.json.',
		);
	});

	it('reads standard input under the name it is given', async () => {
		const result = await cli(
			['--format', 'compact', '--stdin-filename', 'q.py'],
			{},
			PYTHON,
		);
		expect(result.out).toContain('q.py:2:');
		const mixed = await cli(['--stdin-filename', 'q.py', 'a.json'], {
			'a.json': CLEAN,
		});
		expect(mixed.err).toContain('cannot be combined with paths');
	});
});

describe('settings', () => {
	const tree = { 'a.json': BAD };

	it('switches a rule with a flag', async () => {
		const result = await cli(
			[
				'a.json',
				'-f',
				'compact',
				'--rule',
				'DEC006=off',
				'--rule',
				'DEC004=error',
			],
			tree,
		);
		expect(result.out).toContain('error  DEC004');
		expect(result.out).not.toContain('DEC006');
	});

	it('takes a rule by its name, and warn for warning', async () => {
		const byName = await cli(
			['--rule', 'no-fallback-option=warn', '--format', 'json', 'q.json'],
			{ 'q.json': BAD },
		);
		const levels = JSON.parse(byName.out).files[0].findings.filter(
			(finding: { code: string }) => finding.code === 'DEC004',
		);
		expect(
			levels.map((finding: { severity: string }) => finding.severity),
		).toEqual(['warning']);
		const inFile = await cli(['q.json'], {
			'q.json': BAD,
			'decisionlint.json': '{ "rules": { "no-fallback-option": "off" } }',
		});
		expect(inFile.out).not.toContain('DEC004');
		const wrong = await cli(['--rule', 'no-such-rule=off', 'q.json'], {
			'q.json': BAD,
		});
		expect(wrong.err).toContain(
			"'no-such-rule' is not a rule code or a rule name",
		);
	});

	it('reads a config file, and lets a flag override it', async () => {
		const config = JSON.stringify({
			rules: { DEC006: 'off', DEC004: 'off' },
			ignore: [],
		});
		const fromFile = await cli(['a.json', '--config', 'c.json'], {
			...tree,
			'c.json': config,
		});
		expect(fromFile.out).toContain('0 findings');
		const overridden = await cli(
			['a.json', '--config', 'c.json', '--rule', 'DEC004=warning'],
			{ ...tree, 'c.json': config },
		);
		expect(overridden.out).toContain('warning  DEC004');
	});

	it.each([
		['{ "rule": {} }', "'rule' is not a setting"],
		['{ "rules": { "DEC004": "loud" } }', "rules: 'loud' is not a level"],
		['{ "ignore": "DEC004:team" }', "'ignore' must be a list of strings"],
		['not json', 'it is not valid JSON'],
	])('refuses the config %s', async (config, reason) => {
		const result = await cli(['a.json', '--config', 'c.json'], {
			...tree,
			'c.json': config,
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(`c.json: ${reason}`);
	});

	it('refuses a config file that is not there', async () => {
		expect((await cli(['a.json', '--config', 'c.json'], tree)).err).toContain(
			'No such config file: c.json',
		);
	});

	it('prints errors only when quiet, and still fails on them', async () => {
		const result = await cli(['a.json', '--quiet'], tree);
		expect(result.out).not.toContain('DEC004');
		expect(result.status).toBe(EXIT.failed);
	});
});

describe('the project settings file', () => {
	const OFF = '{ "rules": { "DEC006": "off", "DEC004": "off" } }';

	it('is found near the files and applied, with no flag', async () => {
		const result = await cli(['src'], {
			'src/a.json': BAD,
			'decisionlint.json': OFF,
		});
		expect(result.out).toContain('0 findings');
		expect(result.status).toBe(EXIT.passed);
	});

	it('is the nearest one, so a folder can have its own', async () => {
		const result = await cli(['.', '--format', 'json'], {
			'decisionlint.json': OFF,
			'app/decisionlint.json': '{}',
			'app/a.json': BAD,
			'lib/a.json': BAD,
		});
		const report = JSON.parse(result.out);
		const findings = Object.fromEntries(
			report.files.map((file: { path: string; findings: unknown[] }) => [
				file.path,
				file.findings.length,
			]),
		);
		expect(findings).toMatchObject({ 'app/a.json': 2, 'lib/a.json': 0 });
	});

	it('gives way to --config, and to --rule for the rule it names', async () => {
		const tree = {
			'a.json': BAD,
			'decisionlint.json': OFF,
			'other.json': '{}',
		};
		expect(
			(await cli(['a.json', '--config', 'other.json'], tree)).out,
		).toContain('2 findings');
		expect(
			(await cli(['a.json', '--rule', 'DEC004=warning'], tree)).out,
		).toContain('1 finding ');
	});

	it('stops the run when it cannot be used, and names it', async () => {
		const result = await cli(['a.json'], {
			'a.json': BAD,
			'decisionlint.json': '{ "rule": {} }',
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain("decisionlint.json: 'rule' is not a setting");
		expect(result.out).toBe('');
	});

	it('applies to text given to the MCP server under a file name', async () => {
		const call = {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'lint_text',
				arguments: { text: BAD, filename: 'src/a.json' },
			},
		};
		const result = await cli(
			['--mcp'],
			{ 'decisionlint.json': OFF },
			JSON.stringify(call),
		);
		expect(
			JSON.parse(JSON.parse(result.out).result.content[0].text).totals.counts,
		).toMatchObject({ error: 0, info: 0 });
	});
});

describe('exclude in the settings file', () => {
	const tree = {
		'decisionlint.json': '{ "exclude": ["fixtures", "*.generated.json"] }',
		'src/q.json': CLEAN,
		'src/api.generated.json': BAD,
		'fixtures/bad.json': BAD,
	};

	it('leaves the files out of a search, and says how many', async () => {
		const result = await cli(['.'], tree);
		expect(result.status).toBe(EXIT.passed);
		// The clean file, and the settings file itself, which is JSON too.
		expect(result.out).toContain('in 1 question across 2 files.');
		expect(result.out).toContain('2 files excluded by settings.');
	});

	it('leaves out a file named outright too, as a hook that passes changed files needs', async () => {
		const result = await cli(['fixtures/bad.json', 'src/q.json'], tree);
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain('1 file excluded by settings.');
	});

	it('is not written to by --fix', async () => {
		const files = { ...tree };
		await cli(['--fix', '.'], files);
		expect(files['fixtures/bad.json']).toBe(BAD);
	});

	it('does not apply to text piped in under a name', async () => {
		const result = await cli(
			['--stdin-filename', 'fixtures/bad.json'],
			tree,
			BAD,
		);
		expect(result.status).toBe(EXIT.failed);
	});

	it('is honoured by the MCP server for files on disk', async () => {
		const input = JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'lint_paths', arguments: { paths: ['.'] } },
		});
		const result = await cli(['--mcp'], tree, input);
		const report = JSON.parse(JSON.parse(result.out).result.content[0].text);
		expect(report.files.map((file: { path: string }) => file.path)).toEqual([
			'decisionlint.json',
			'src/q.json',
		]);
		expect(report.totals.excluded).toBe(2);
	});
});

describe('--fix', () => {
	const BROKEN = `{ "questions": { "late": { "type": "noul", "instructions": "Did it arrive late?", "criteria": { "yes": "After the day promised", "no": "On or before it" } }, "team": { "type": "choice", "instructions": "Which team takes it?", "criteria": { "billing": "Charges", "technical": "Faults" } } } }`;

	it('writes the safe fixes, and reports what is left', async () => {
		const tree = { 'q.json': BROKEN, 'ok.json': CLEAN };
		const result = await cli(['--fix', '.'], tree);
		expect(tree['q.json']).toContain('"true": "After the day promised"');
		expect(tree['ok.json']).toBe(CLEAN);
		expect(result.out).not.toContain('DEC006');
		// The missing fallback is the author's call, so it is reported and not written.
		expect(result.out).toContain('DEC004');
		expect(tree['q.json']).not.toContain('"other"');
		expect(result.out).toContain('Fixed 2 findings in 1 file.');
		expect(result.status).toBe(EXIT.passed);
	});

	it('writes nothing without the flag', async () => {
		const tree = { 'q.json': BROKEN };
		const result = await cli(['q.json'], tree);
		expect(tree['q.json']).toBe(BROKEN);
		expect(result.status).toBe(EXIT.failed);
		expect(result.out).not.toContain('Fixed');
	});

	it('says in JSON what it wrote', async () => {
		const result = await cli(['--fix', '--format', 'json', 'q.json'], {
			'q.json': BROKEN,
		});
		expect(JSON.parse(result.out).totals.fixed).toEqual({
			findings: 2,
			files: 1,
		});
	});

	it('reports each fix with its edits and whether --fix applies it', async () => {
		const result = await cli(['--format', 'json', 'q.json'], {
			'q.json': `\n${BAD}`,
		});
		const [fallback, shape] = JSON.parse(result.out).files[0].findings;
		expect(fallback.code).toBe('DEC004');
		expect(fallback.fix).toMatchObject({
			safe: false,
			title: expect.any(String),
		});
		expect(shape.code).toBe('DEC006');
		expect(shape.fix).toMatchObject({
			safe: true,
			edits: [{ line: 2, text: '["Calm"]' }],
		});
		expect(shape.fix.edits[0].column).toBeLessThan(
			shape.fix.edits[0].endColumn,
		);
		const clean = await cli(['--format', 'json', 'q.json'], {
			'q.json': CLEAN,
		});
		expect(JSON.parse(clean.out).files[0].findings).toEqual([]);
	});

	it('stops and says so when a file cannot be written', async () => {
		const result = await cli(['--fix', 'q.json'], { 'q.json': BROKEN }, '', {
			files: (files) => ({
				...files,
				write: () => {
					throw new Error('EROFS: read-only file system');
				},
			}),
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('Could not write q.json.');
	});

	it.each([
		[['--fix', '--stdin-filename', 'q.json'], '--stdin-filename'],
		[['--fix', '--mcp'], '--mcp'],
	])('refuses %j', async (args, said) => {
		const result = await cli(args, {}, BROKEN);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(`--fix cannot be combined with ${said}`);
	});
});

describe('a disk that fails', () => {
	const denied = (path: string) => () => {
		throw new Error(`EACCES: permission denied, '${path}'`);
	};
	const tree = { 'src/q.json': CLEAN, 'locked/q.json': BAD };

	it('lints the rest when a folder cannot be listed, and names the folder', async () => {
		const result = await cli(['.'], tree, '', {
			files: (files) => ({
				...files,
				list: (path) => (path === 'locked' ? denied(path)() : files.list(path)),
			}),
		});
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain('in 1 question across 1 file.');
		expect(result.out).toContain('1 path could not be read: locked.');
	});

	it('lints the rest when a file cannot be read, and names the file', async () => {
		const result = await cli(['--format', 'json', '.'], tree, '', {
			files: (files) => ({
				...files,
				read: (path) =>
					path === 'locked/q.json' ? denied(path)() : files.read(path),
			}),
		});
		expect(result.status).toBe(EXIT.passed);
		expect(JSON.parse(result.out).totals.unread).toEqual(['locked/q.json']);
	});

	it('does not pass a run in which nothing could be read', async () => {
		const result = await cli(['.'], tree, '', {
			files: (files) => ({ ...files, read: (path) => denied(path)() }),
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('No files could be read.');
	});

	it('refuses a settings file it cannot read, and names it', async () => {
		const result = await cli(
			['--config', 'team.json', 'src/q.json'],
			{ ...tree, 'team.json': '{}' },
			'',
			{
				files: (files) => ({
					...files,
					read: (path) =>
						path === 'team.json' ? denied(path)() : files.read(path),
				}),
			},
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('team.json: it could not be read.');
	});

	it('does not follow a linked folder, which can lead back to its parent', async () => {
		const listed: string[] = [];
		const result = await cli(
			['.'],
			{ 'src/q.json': CLEAN, 'up/q.json': BAD },
			'',
			{
				files: (files) => ({
					...files,
					stat: (path) => {
						const entry = files.stat(path);
						return entry && path === 'up' ? { ...entry, link: true } : entry;
					},
					list: (path) => {
						listed.push(path);
						return files.list(path);
					},
				}),
			},
		);
		expect(listed).not.toContain('up');
		expect(result.status).toBe(EXIT.passed);
	});

	it('names a path that is not a regular file, and never opens it', async () => {
		// A named pipe with a .json name would block the read for as long as nobody writes to it.
		const opened: string[] = [];
		const result = await cli(
			['.'],
			{ 'src/q.json': CLEAN, 'src/pipe.json': '' },
			'',
			{
				files: (files) => ({
					...files,
					stat: (path) =>
						path === 'src/pipe.json'
							? { kind: 'other', size: 0 }
							: files.stat(path),
					read: (path) => {
						opened.push(path);
						return files.read(path);
					},
				}),
			},
		);
		expect(opened).not.toContain('src/pipe.json');
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain('1 path could not be read: src/pipe.json.');
	});

	it('refuses a named path that is not a regular file', async () => {
		const result = await cli(['src/pipe.json'], { 'src/pipe.json': '' }, '', {
			files: (files) => ({
				...files,
				stat: () => ({ kind: 'other', size: 0 }),
			}),
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('Not a regular file: src/pipe.json');
	});

	it('still reads a linked folder that is named outright', async () => {
		const result = await cli(['up'], { 'up/q.json': BAD }, '', {
			files: (files) => ({
				...files,
				stat: (path) => {
					const entry = files.stat(path);
					return entry && path === 'up' ? { ...entry, link: true } : entry;
				},
			}),
		});
		expect(result.status).toBe(EXIT.failed);
	});
});

describe('a file that begins with a byte order mark', () => {
	const YES_NO = `{ "questions": { "q": { "type": "noul", "instructions": "Has it shipped?", "criteria": { "yes": "Gone.", "no": "Here." } } } }`;

	it('is reported at the columns an editor shows, which do not count the mark', async () => {
		const plain = await cli(['--format', 'compact', 'a.json'], {
			'a.json': YES_NO,
		});
		const marked = await cli(['--format', 'compact', 'a.json'], {
			'a.json': `\uFEFF${YES_NO}`,
		});
		expect(plain.out).toContain('a.json:1:');
		expect(marked.out).toBe(plain.out);
	});

	it('keeps its mark when --fix writes it back', async () => {
		const tree = { 'a.json': `\uFEFF${YES_NO}` };
		const result = await cli(['--fix', 'a.json'], tree);
		expect(result.status).toBe(EXIT.passed);
		expect(tree['a.json']).toBe(
			`\uFEFF${YES_NO.replace('"yes"', '"true"').replace('"no"', '"false"')}`,
		);
	});

	it('is read from standard input without the mark', async () => {
		const plain = await cli(
			['--format', 'compact', '--stdin-filename', 'a.json'],
			{},
			YES_NO,
		);
		const marked = await cli(
			['--format', 'compact', '--stdin-filename', 'a.json'],
			{},
			`\uFEFF${YES_NO}`,
		);
		expect(marked.out).toBe(plain.out);
	});
});

describe('the default format', () => {
	const tree = { 'src/a.json': `\n${BAD}`, 'src/ok.json': CLEAN };

	it('groups findings under their file, with the rule named and the message on its own line', async () => {
		const result = await cli(['src'], tree);
		const lines = result.out.split('\n');
		expect(lines[0]).toBe('src/a.json');
		expect(lines[1]).toMatch(/^ +2:\d+ {2}info {5}DEC004 no-fallback-option$/);
		expect(lines[2]).toMatch(/^ {2} +This Choice has no fallback option,/);
		expect(lines[3]).toMatch(/^ +2:\d+ {2}error {4}DEC006 /);
		// A file with nothing to say is not listed.
		expect(result.out).not.toContain('src/ok.json');
		expect(lines.at(-2)).toMatch(/^2 findings \(1 error, 0 warnings\)/);
	});

	it('wraps a long message to the terminal between words, keeping its indent', async () => {
		const result = await cli(['src'], tree, '', { columns: 60 });
		const lines = result.out.split('\n').slice(0, -2);
		expect(lines.every((line) => line.length <= 60)).toBe(true);
		const message = lines.slice(
			2,
			lines.findIndex((line, i) => i > 1 && /DEC006/.test(line)),
		);
		expect(message.length).toBeGreaterThan(1);
		// Every line of the message starts under the first, and none breaks a word.
		const indent = /^ +/.exec(message[0] ?? '')?.[0];
		expect(message.every((line) => line.startsWith(indent ?? '!'))).toBe(true);
		expect(message.map((line) => line.trim()).join(' ')).toContain(
			'This Choice has no fallback option, so an input that fits none of them is',
		);
	});

	it('does not wrap when no terminal is reading', async () => {
		const result = await cli(['src'], tree);
		expect(result.out.split('\n')[2]?.length).toBeGreaterThan(120);
	});

	it('says how many findings --fix would mend', async () => {
		const result = await cli(['q.json'], {
			'q.json': `{ "questions": { "late": { "type": "noul", "instructions": "Did it arrive late?", "criteria": { "yes": "Late", "no": "On time" } } } }`,
		});
		expect(result.out).toContain('2 can be fixed with --fix.');
	});

	it('is plain unless a terminal is reading or --color is given', async () => {
		const esc = String.fromCharCode(27);
		expect((await cli(['src'], tree)).out).not.toContain(esc);
		expect((await cli(['--color', 'src'], tree)).out).toContain(`${esc}[31m`);
	});

	it('never colours the formats a program reads', async () => {
		const esc = String.fromCharCode(27);
		for (const format of ['compact', 'json', 'github']) {
			const result = await cli(['--color', '--format', format, 'src'], tree);
			expect(result.out, format).not.toContain(esc);
		}
	});
});

describe('formats for other tools', () => {
	const tree = {
		'src/a.json': `\n${BAD}`,
		'src/ok.json': CLEAN,
		'src/<odd>&"name".json': BAD,
	};

	it('writes SARIF that names the tool, every rule, and each finding with its place', async () => {
		const result = await cli(['--format', 'sarif', 'src/a.json'], tree);
		const sarif = JSON.parse(result.out);
		expect(sarif.version).toBe('2.1.0');
		const [run] = sarif.runs;
		expect(run.tool.driver).toMatchObject({
			name: 'DecisionLint',
			version: '9.9.9',
		});
		const ids = run.tool.driver.rules.map((rule: { id: string }) => rule.id);
		expect(ids).toContain('DEC004');
		expect(
			run.results.map((found: { ruleId: string; level: string }) => [
				found.ruleId,
				found.level,
			]),
		).toEqual([
			['DEC004', 'note'],
			['DEC006', 'error'],
		]);
		const [first] = run.results;
		// Help is the rule's own page, as in the editor.
		expect(run.tool.driver.rules[first.ruleIndex].helpUri).toMatch(
			/\/docs\/rules\/DEC004\.md$/,
		);
		// The index must point at the rule it names, or a viewer shows the wrong help.
		expect(ids[first.ruleIndex]).toBe(first.ruleId);
		expect(first.locations[0].physicalLocation).toMatchObject({
			artifactLocation: { uri: 'src/a.json' },
			region: { startLine: 2 },
		});
		expect(result.status).toBe(EXIT.failed);
	});

	it('writes an empty SARIF run for a clean file, not an empty file', async () => {
		const result = await cli(['--format', 'sarif', 'src/ok.json'], tree);
		expect(JSON.parse(result.out).runs[0].results).toEqual([]);
	});

	it('writes JUnit with a suite per file, failing only on errors', async () => {
		const result = await cli(
			['--format', 'junit', 'src/a.json', 'src/ok.json'],
			tree,
		);
		expect(result.out).toMatch(
			/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<testsuites name="decisionlint" tests="3" failures="1" errors="0">/,
		);
		expect(result.out).toContain(
			'<testsuite name="src/a.json" tests="2" failures="1" errors="0">',
		);
		// The info finding is a passing case that carries its message.
		expect(result.out).toMatch(
			/<testcase name="DEC004 no-fallback-option \(2:\d+\)" classname="src\/a\.json"><system-out>info: /,
		);
		expect(result.out).toMatch(
			/<testcase name="DEC006 [^"]+" classname="src\/a\.json"><failure message="[^"]+" type="DEC006">src\/a\.json:2:\d+<\/failure>/,
		);
		// A clean file still shows as checked.
		expect(result.out).toContain(
			'<testcase name="no findings" classname="src/ok.json"/>',
		);
	});

	it('escapes what XML reads as markup, in names and in messages', async () => {
		const result = await cli(
			['--format', 'junit', 'src/<odd>&"name".json'],
			tree,
		);
		expect(result.out).toContain(
			'classname="src/&lt;odd&gt;&amp;&quot;name&quot;.json"',
		);
		const body = result.out.replace(/&(amp|lt|gt|quot);/g, '');
		expect(body).not.toContain('&');
		// Every tag opened is closed.
		expect(result.out.match(/<testsuite /g)?.length).toBe(
			result.out.match(/<\/testsuite>/g)?.length,
		);
	});

	it('never colours them', async () => {
		const esc = String.fromCharCode(27);
		for (const format of ['sarif', 'junit']) {
			const result = await cli(
				['--color', '--format', format, 'src/a.json'],
				tree,
			);
			expect(result.out, format).not.toContain(esc);
		}
	});
});

describe('formats', () => {
	const tree = { 'src/a.json': BAD };

	it('writes JSON with one-based positions and the rule behind each finding', async () => {
		const report = JSON.parse(
			(await cli(['src', '--format', 'json'], tree)).out,
		);
		expect(report.totals).toMatchObject({
			files: 1,
			questions: 2,
			unreadable: 0,
			counts: { error: 1, info: 1 },
		});
		expect(report.files[0].findings[0]).toMatchObject({
			code: 'DEC004',
			rule: 'no-fallback-option',
			severity: 'info',
			questionId: 'team',
			line: 1,
			column: BAD.indexOf('"team"') + 1,
		});
		expect(report.files[0].findings[0].docs).toMatch(
			/^https:\/\/docs\.typesafe\.ai\//,
		);
	});

	it('writes GitHub annotations, escaping what GitHub reads as syntax', async () => {
		const result = await cli(['src', '--format', 'github'], {
			'src/a,b.json': BAD,
		});
		const lines = result.out.split('\n');
		expect(lines[0]).toMatch(
			/^::notice file=src\/a%2Cb\.json,line=1,col=\d+,endLine=1,endColumn=\d+,title=DEC004 no-fallback-option::/,
		);
		expect(lines[1]).toMatch(/^::error file=/);
		expect(lines[0]).not.toMatch(/::.*\n/);
	});
});

describe('the MCP server', () => {
	const talk = async (
		messages: unknown[],
		tree: Record<string, string> = {},
		where: World = {},
	) => {
		const input = messages.map((message) => JSON.stringify(message)).join('\n');
		const result = await cli(['--mcp'], tree, input, where);
		return result.out
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	};
	const call = (id: number, name: string, args: unknown) => ({
		jsonrpc: '2.0',
		id,
		method: 'tools/call',
		params: { name, arguments: args },
	});
	const LOCAL = 'http://localhost:8080/v1/systemone';
	const body = (reply: { result: { content: { text: string }[] } }) =>
		JSON.parse(reply.result.content[0]?.text ?? 'null');

	it("sends where platform says, with that platform's key from the environment, and refuses one it does not know", async () => {
		const fetch = jevSays();
		const [reply] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					platform: 'liquid',
				}),
			],
			{},
			world(fetch, { LIQUID_API_KEY: 'lq-key' }),
		);
		expect(reply.result.isError).toBe(false);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe('https://api.liquid.ai/decisions/v1/systemone');
		expect(calls(fetch)[0]?.headers.Authorization).toBe('Bearer lq-key');
		expect(calls(fetch)[0]?.body.model).toBe('d1');
		expect(reply.result.structuredContent.totals.ask.vendor).toBe('Liquid AI');
		const [noKey] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					platform: 'liquid',
				}),
			],
			{},
			world(jevSays(), {}),
		);
		expect(noKey.result.isError).toBe(true);
		expect(noKey.result.content[0].text).toContain('LIQUID_API_KEY');
		const [unknown] = await talk(
			[call(1, 'plan_ask', { text: VAGUE, filename: 'q.ts', platform: 'jay' })],
			{},
			world(jevSays(), {}),
		);
		expect(unknown.result.isError).toBe(true);
		expect(unknown.result.content[0].text).toContain(
			"'jay' is not a platform.",
		);
	});

	it('lets the server send to an endpoint from its environment and never from an argument', async () => {
		const fetch = jevSays();
		const [reply] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					model: 'ggml-org/OpenJev-GGUF',
				}),
			],
			{},
			world(fetch, { DECISIONLINT_ASK_ENDPOINT: LOCAL }),
		);
		expect(reply.result.isError).toBe(false);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe(LOCAL);
		expect(calls(fetch)[0]?.headers).not.toHaveProperty('Authorization');
		expect(reply.result.structuredContent.keySource).toBe(
			'none: the host takes no key',
		);
		const [refused] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					model: 'openai/gpt-6-luna-decisions',
					endpoint: LOCAL,
				}),
			],
			{},
			world(jevSays(), {}),
		);
		expect(refused.result.isError).toBe(true);
		expect(refused.result.content[0].text).toContain(
			'Set DECISIONLINT_ASK_ENDPOINT, and DECISIONLINT_ASK_SHAPE where its path does not say, in the environment the server was started with.',
		);
	});

	it('answers in the protocol version it was asked for, or its newest', async () => {
		const [known, unknown] = await talk([
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: '2024-11-05' },
			},
			{
				jsonrpc: '2.0',
				id: 2,
				method: 'initialize',
				params: { protocolVersion: '1999-01-01' },
			},
		]);
		expect(known.result).toMatchObject({
			protocolVersion: '2024-11-05',
			serverInfo: { name: 'decisionlint', version: '9.9.9' },
		});
		expect(unknown.result.protocolVersion).toBe('2025-06-18');
	});

	it('does not answer a notification', async () => {
		const replies = await talk([
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 7, method: 'ping' },
		]);
		expect(replies).toEqual([{ jsonrpc: '2.0', id: 7, result: {} }]);
	});

	it('lints text, taking the language from the file name', async () => {
		const [json, python] = await talk([
			call(1, 'lint_text', { text: BAD }),
			call(2, 'lint_text', { text: PYTHON, filename: 'q.py' }),
		]);
		expect(
			body(json).files[0].findings.map((f: { code: string }) => f.code),
		).toEqual(['DEC004', 'DEC006']);
		expect(body(json).files[0].path).toBe('request.jev.json');
		expect(body(python).totals.unreadable).toBe(1);
	});

	it('lints an OpenAI Decisions request, and tells an agent it reads both vendors', async () => {
		const LUNA = `{ "model": "gpt-6-luna", "input": "hi", "questions": [ { "type": "predicate", "name": "refund", "instructions": "Refund?" }, { "type": "choice", "name": "team", "instructions": "Which team takes it?", "choices": [ { "value": "billing", "description": "Billing" }, { "value": "tech", "description": "Faults" } ] } ] }`;
		const [started, listed, linted] = await talk([
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: '2024-11-05' },
			},
			{ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
			call(3, 'lint_text', { text: LUNA }),
		]);
		expect(started.result.instructions).toContain("OpenAI's Decisions API");
		const descriptions = listed.result.tools
			.map((t: { description: string }) => t.description)
			.join(' ');
		expect(descriptions).toContain('/v1/decisions');
		expect(descriptions).toContain('decide()');
		const findings = body(linted).files[0].findings as {
			code: string;
			message: string;
		}[];
		expect(findings.map((f) => f.code)).toEqual(['DEC012', 'DEC004', 'DEC011']);
		expect(findings.every((f) => !/\bJev\b/.test(f.message))).toBe(true);
	});

	it('lints paths on disk and takes rule levels', async () => {
		const [reply] = await talk(
			[call(1, 'lint_paths', { paths: ['src'], rules: { DEC006: 'off' } })],
			{ 'src/a.json': BAD, 'src/b.json': CLEAN },
		);
		expect(body(reply).totals).toMatchObject({ files: 2, questions: 3 });
		expect(JSON.stringify(body(reply))).not.toContain('DEC006');
	});

	it('lists every rule, and says which need Jev itself', async () => {
		const [reply] = await talk([call(1, 'list_rules', {})]);
		const rules = body(reply).rules as {
			code: string;
			meaning: string;
			runsHere: boolean;
		}[];
		expect(rules.map((rule) => rule.code)).toEqual(RULE_CODES);
		expect(rules.find((rule) => rule.code === 'DEC004')?.runsHere).toBe(true);
		expect(rules.find((rule) => rule.code === 'DEC303')?.runsHere).toBe(false);
		expect(rules.find((rule) => rule.code === 'DEC004')?.meaning).toBe(
			RULES.DEC004.meaning,
		);
	});

	it('describes every tool as read-only, with a title and the shape of its answer', async () => {
		const [reply] = await talk([
			{ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
		]);
		const tools = reply.result.tools as {
			name: string;
			title: string;
			outputSchema: { required: string[] };
			annotations: Record<string, boolean>;
		}[];
		expect(tools.map((tool) => tool.name)).toEqual([
			'lint_text',
			'lint_paths',
			'fix_text',
			'list_rules',
			'explain_rule',
			'plan_ask',
			'ask_model',
			'probe_question',
		]);
		const sends = new Set(['ask_model', 'probe_question']);
		for (const tool of tools) {
			expect(tool.title, tool.name).toBeTruthy();
			expect(tool.outputSchema.required, tool.name).not.toEqual([]);
			// The two that send are open-world and not idempotent: each call costs.
			expect(tool.annotations, tool.name).toEqual({
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: !sends.has(tool.name),
				openWorldHint: sends.has(tool.name),
			});
		}
	});

	it('answers as data too, the same as the text', async () => {
		const [reply] = await talk([call(1, 'lint_text', { text: BAD })]);
		expect(reply.result.structuredContent).toEqual(body(reply));
		expect(reply.result.structuredContent.totals.fixable).toBe(1);
	});

	it('carries each fix with the finding, marked safe or not', async () => {
		const [reply] = await talk([call(1, 'lint_text', { text: BAD })]);
		const [fallback, shape] = body(reply).files[0].findings;
		expect(fallback).toMatchObject({ code: 'DEC004', fix: { safe: false } });
		expect(shape).toMatchObject({
			code: 'DEC006',
			fix: { safe: true, edits: [{ line: 1, text: '["Calm"]' }] },
		});
	});

	it('fixes text, applies only the safe fixes, and reports what is left', async () => {
		const [reply] = await talk([call(1, 'fix_text', { text: BAD })]);
		const fixed = reply.result.structuredContent;
		expect(fixed.fixed).toBe(1);
		expect(fixed.text).toContain('"criteria": ["Calm"]');
		// The fallback option is the author's call, so it is still reported. One
		// level is now too few, which the mended text shows and the original did not.
		expect(
			fixed.files[0].findings.map((f: { code: string }) => f.code),
		).toEqual(['DEC004', 'DEC009']);
		expect(fixed.totals.fixable).toBe(0);
		expect(body(reply)).toEqual(fixed);
	});

	it('fixes text in the language of the file name, and writes nothing', async () => {
		const result = await cli(
			['--mcp'],
			{},
			JSON.stringify(call(1, 'fix_text', { text: PYTHON, filename: 'q.py' })),
			{
				files: (files) => ({
					...files,
					write: () => {
						throw new Error('the server must not write');
					},
				}),
			},
		);
		const [reply] = result.out
			.trim()
			.split('\n')
			.map((l) => JSON.parse(l));
		expect(reply.result.isError).toBe(false);
		expect(reply.result.structuredContent).toMatchObject({
			text: PYTHON,
			fixed: 0,
		});
	});

	it('leaves a fix that is not safe to the author, even when it is the only one', async () => {
		const [reply] = await talk([
			call(1, 'fix_text', { text: CLEAN.replace('jev-1.13.0', 'jev-latest') }),
		]);
		const fixed = reply.result.structuredContent;
		expect(fixed.fixed).toBe(0);
		expect(fixed.text).toContain('jev-latest');
		expect(fixed.files[0].findings[0]).toMatchObject({
			code: 'DEC001',
			fix: { safe: false },
		});
	});

	it('explains a rule with its page, taking the code in any case', async () => {
		const [exact, loose, jev, old] = await talk([
			call(1, 'explain_rule', { code: 'DEC004' }),
			call(2, 'explain_rule', { code: ' dec004' }),
			call(3, 'explain_rule', { code: 'DEC303' }),
			call(4, 'explain_rule', { code: 'JEV004' }),
		]);
		expect(exact.result.content[0].text).toBe(rulePage('DEC004'));
		expect(exact.result.content[0].text).toContain('## Flagged');
		expect(exact.result.structuredContent).toMatchObject({
			code: 'DEC004',
			name: 'no-fallback-option',
			meaning: RULES.DEC004.meaning,
			runsHere: true,
			markdown: rulePage('DEC004'),
		});
		expect(loose.result.structuredContent.code).toBe('DEC004');
		expect(old.result.structuredContent.code).toBe('DEC004');
		expect(jev.result.structuredContent.runsHere).toBe(false);
		expect(jev.result.content[0].text).toContain('## What Jev is asked');
	});

	it('never touches the network or a key from the tools that lint', async () => {
		const fetch = jevSays();
		const tree = { 'q.ts': VAGUE, '.env': 'TYPESAFE_API_KEY=in_a_file' };
		const replies = await talk(
			[
				call(1, 'lint_text', { text: VAGUE, filename: 'q.ts' }),
				call(2, 'lint_paths', { paths: ['q.ts'] }),
				call(3, 'fix_text', { text: BAD }),
				call(4, 'list_rules', {}),
				call(5, 'explain_rule', { code: 'DEC302' }),
				call(6, 'plan_ask', { text: VAGUE, filename: 'q.ts' }),
			],
			tree,
			world(fetch),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(replies.every((reply) => reply.result.isError === false)).toBe(true);
		expect(JSON.stringify(replies)).not.toContain('apikey_secret_value');
		expect(JSON.stringify(replies)).not.toContain('in_a_file');
	});

	it('plans a check, sending nothing and needing no key', async () => {
		const fetch = jevSays();
		const [reply] = await talk(
			[call(1, 'plan_ask', { paths: ['.'], maxCalls: 1 })],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY, 'c.ts': RUNTIME },
			world(fetch, {}),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(reply.result.isError).toBe(false);
		expect(reply.result.structuredContent.totals.ask).toMatchObject({
			sent: false,
			planned: 1,
			answered: 0,
			runtime: 1,
			overLimit: 1,
			model: 'jev-1.13.0',
			state: false,
		});
		expect(reply.result.structuredContent.totals.files).toBe(3);
	});

	it('refuses to check with no key anywhere, before sending anything', async () => {
		const fetch = jevSays();
		const [reply] = await talk(
			[call(1, 'ask_model', { text: VAGUE, filename: 'q.ts' })],
			{ '.env': 'OTHER=1' },
			world(fetch, { TYPESAFE_API_KEY: '  ' }),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toContain(
			'TYPESAFE_API_KEY in the environment the server was started with, or in .env.local or .env',
		);
		expect(reply.result.content[0].text).toContain('Nothing was sent');
	});

	it('checks with the model using the key from the environment, and prints it nowhere', async () => {
		const fetch = jevSays({ DEC301: { noul: 0.02 }, DEC302: { noul: 0.91 } });
		const [reply] = await talk(
			[call(1, 'ask_model', { text: VAGUE, filename: 'q.ts' })],
			{},
			world(fetch),
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(calls(fetch)[0]?.headers.Authorization).toContain(
			'apikey_secret_value',
		);
		expect(reply.result.isError).toBe(false);
		const checked = reply.result.structuredContent;
		expect(checked.keySource).toBe('the environment');
		expect(checked.shortfall).toBe(null);
		expect(checked.totals.ask).toMatchObject({
			sent: true,
			planned: 1,
			answered: 1,
			inputTokens: 310,
		});
		// Alone: DEC112, the offline rule for "large", is off by default since 1.1.0.
		const findings = checked.files[0].findings as {
			code: string;
			message: string;
			fix: unknown;
		}[];
		expect(findings.map((f) => f.code)).toEqual(['DEC302']);
		const fromModel = findings.find((f) => f.code === 'DEC302');
		expect(fromModel?.message).toContain('0.91');
		expect(fromModel?.fix).toBe(null);
		expect(JSON.stringify(reply)).not.toContain('apikey_secret_value');
	});

	it('takes the key from .env.local before .env when the environment has none', async () => {
		const fetch = jevSays({ DEC302: { noul: 0.91 } });
		const tree = {
			'q.ts': VAGUE,
			'.env': 'TYPESAFE_API_KEY=shared_key_value',
			'.env.local': 'export TYPESAFE_API_KEY="local_key_value" # mine',
		};
		const [local] = await talk(
			[call(1, 'ask_model', { paths: ['q.ts'] })],
			tree,
			world(fetch, {}),
		);
		expect(local.result.structuredContent.keySource).toBe('.env.local');
		expect(calls(fetch)[0]?.headers.Authorization).toContain('local_key_value');
		const shared = jevSays({ DEC302: { noul: 0.91 } });
		const [fromEnv] = await talk(
			[call(1, 'ask_model', { paths: ['q.ts'] })],
			{ 'q.ts': VAGUE, '.env': tree['.env'] },
			world(shared, {}),
		);
		expect(fromEnv.result.structuredContent.keySource).toBe('.env');
		expect(calls(shared)[0]?.headers.Authorization).toContain(
			'shared_key_value',
		);
		for (const reply of [local, fromEnv]) {
			expect(JSON.stringify(reply)).not.toContain('key_value');
		}
	});

	it('says why a check fell short, and fails one that answered nothing', async () => {
		const over = jevSays({ DEC302: { noul: 0.91 } });
		const [short] = await talk(
			[call(1, 'ask_model', { paths: ['.'], maxCalls: 1 })],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			world(over),
		);
		expect(over).toHaveBeenCalledTimes(1);
		expect(short.result.isError).toBe(false);
		expect(short.result.structuredContent.shortfall).toContain(
			'1 request over the maxCalls limit not sent',
		);
		expect(short.result.structuredContent.totals.ask).toMatchObject({
			answered: 1,
			overLimit: 1,
		});
		const refused = jevSays({}, 401);
		const [failed] = await talk(
			[call(1, 'ask_model', { text: VAGUE, filename: 'q.ts' })],
			{},
			world(refused),
		);
		expect(failed.result.isError).toBe(true);
		expect(failed.result.content[0].text).toContain('rejected the API key');
		expect(failed.result.content[0].text).toContain('Answered 0 of 1 request');
	});

	it('asks Luna with the OpenAI key when the model is gpt-6-luna', async () => {
		const lunaSays = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				model: 'gpt-6-luna',
				answers: [{ type: 'predicate', name: 'DEC302', probability: 0.91 }],
				usage: { input_tokens: 200 },
			}),
			text: async () => '',
		}));
		const [noKey] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					model: 'gpt-6-luna',
				}),
			],
			{},
			world(lunaSays as unknown as Sent, KEY),
		);
		expect(noKey.result.isError).toBe(true);
		expect(noKey.result.content[0].text).toContain('OPENAI_API_KEY');
		expect(lunaSays).not.toHaveBeenCalled();
		const [asked] = await talk(
			[
				call(1, 'ask_model', {
					text: VAGUE,
					filename: 'q.ts',
					model: 'gpt-6-luna',
				}),
			],
			{ '.env': 'OPENAI_API_KEY=sk-luna-key' },
			world(lunaSays as unknown as Sent, {}),
		);
		expect(lunaSays).toHaveBeenCalledTimes(1);
		const [url] = lunaSays.mock.calls[0] as unknown as [string];
		expect(url).toContain('api.openai.com');
		expect(asked.result.structuredContent.totals.ask.model).toBe('gpt-6-luna');
		expect(
			asked.result.structuredContent.files[0].findings.map(
				(f: { code: string }) => f.code,
			),
		).toContain('DEC302');
	});

	it('probes a question against its state and reports the verdict', async () => {
		const fetch = jevSays({ q: { noul: 0.8 } });
		const [reply] = await talk(
			[call(1, 'probe_question', { text: STATED, questionId: 'a' })],
			{},
			world(fetch),
		);
		expect(reply.result.isError).toBe(false);
		const probed = reply.result.structuredContent;
		// A Noul with no criteria has no layout to vary, so only the repeats run.
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(probed).toMatchObject({
			questionId: 'a',
			model: 'jev-1.13.0',
			requests: 3,
			moved: [],
			keySource: 'the environment',
		});
		expect(probed.verdict).toContain('only repeats were run');
		expect(probed.markdown).toMatch(/^# Probe of `a`\n/);
		expect(reply.result.content[0].text).toBe(probed.markdown);
		// Every request carried the state written in the text.
		for (const sent of calls(fetch))
			expect(sent.body.state).toEqual({ note: 'Wheel wobbles.' });
		expect(JSON.stringify(reply)).not.toContain('apikey_secret_value');
	});

	it('makes no probe report when a request fails part way', async () => {
		const fetch = jevSays({}, 500);
		const [reply] = await talk(
			[call(1, 'probe_question', { text: STATED, questionId: 'a' })],
			{},
			world(fetch),
		);
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toContain('had an error of its own');
		expect(reply.result.content[0].text).toContain('no report was made');
	});

	it.each([
		[
			'a file type it does not read',
			call(1, 'lint_text', { text: 'x', filename: 'a.md' }),
			'Not a file type',
		],
		[
			'a path that is not there',
			call(1, 'lint_paths', { paths: ['gone'] }),
			'No such file or directory: gone',
		],
		[
			'a rule level it does not know',
			call(1, 'lint_text', { text: BAD, rules: { DEC004: 'loud' } }),
			"'loud' is not a level",
		],
		[
			'a rule it does not have',
			call(1, 'explain_rule', { code: 'DEC999' }),
			'Unknown rule: DEC999',
		],
		[
			'text to fix in a file type it does not read',
			call(1, 'fix_text', { text: BAD, filename: 'q.toml' }),
			'Not a file type',
		],
		[
			'a check given text and paths together',
			call(1, 'ask_model', { text: BAD, paths: ['.'] }),
			"Pass 'text' or 'paths', not both",
		],
		[
			'a probe of a question with no state beside it',
			call(1, 'probe_question', { text: VAGUE, filename: 'q.ts' }),
			'needs a request with the state written out',
		],
		[
			'a probe that does not say which of two questions',
			call(1, 'probe_question', { text: STATED }),
			"Name one with 'questionId': a, b",
		],
		[
			'a probe of an id the text lacks',
			call(1, 'probe_question', { text: STATED, questionId: 'zzz' }),
			"No question with the id 'zzz'",
		],
		[
			'a probe aimed at Luna',
			call(1, 'probe_question', {
				text: STATED,
				questionId: 'a',
				model: 'gpt-6-luna',
			}),
			'The probe asks Jev only',
		],
	])('reports %s as a failed call', async (_name, message, reason) => {
		const [reply] = await talk([message]);
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toContain(reason);
	});

	// The spec draws the line here: a call the server cannot even route is a
	// protocol error, and a tool that ran and could not do what it was asked is a
	// failed call. An agent reads both, but a host counts only the first against the server.
	it.each([
		[
			'an unknown tool',
			call(1, 'lint_everything', {}),
			'Unknown tool: lint_everything',
		],
		[
			'a call with no tool name',
			{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
			"'name' must be a string",
		],
		[
			'arguments that are not an object',
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'lint_text', arguments: 'x' },
			},
			"'arguments' must be an object",
		],
		[
			'a required argument left out',
			call(1, 'lint_text', {}),
			"'text' is required",
		],
		[
			'text that is not a string',
			call(1, 'lint_text', { text: 5 }),
			"'text' must be a string",
		],
		[
			'paths that are not a list',
			call(1, 'lint_paths', { paths: 'samples' }),
			"'paths' must be an array",
		],
		[
			'no paths',
			call(1, 'lint_paths', { paths: [] }),
			"'paths' must have at least 1 entry",
		],
		[
			'a path that is not a string',
			call(1, 'lint_paths', { paths: [3] }),
			"'paths' must hold only strings",
		],
		[
			'rules that are not an object',
			call(1, 'lint_text', { text: BAD, rules: 'off' }),
			"'rules' must be an object",
		],
		[
			'a rule code that is not a string',
			call(1, 'explain_rule', { code: 4 }),
			"'code' must be a string",
		],
		[
			'a check with a limit of zero',
			call(1, 'ask_model', { text: BAD, maxCalls: 0 }),
			"'maxCalls' must be at least 1",
		],
		[
			'a check with a limit that is not whole',
			call(1, 'ask_model', { text: BAD, maxCalls: 1.5 }),
			"'maxCalls' must be an integer",
		],
		[
			'a plan with a model that is not a string',
			call(1, 'plan_ask', { text: BAD, model: 7 }),
			"'model' must be a string",
		],
		[
			'a plan with sendState that is not a boolean',
			call(1, 'plan_ask', { text: BAD, sendState: 'yes' }),
			"'sendState' must be true or false",
		],
	])(
		'refuses %s as invalid params, before any tool runs',
		async (_name, message, reason) => {
			const [reply, pinged] = await talk([
				message,
				{ jsonrpc: '2.0', id: 2, method: 'ping' },
			]);
			expect(reply.result).toBeUndefined();
			expect(reply.id).toBe(1);
			expect(reply.error.code).toBe(-32602);
			expect(reply.error.message).toContain(reason);
			expect(pinged).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
		},
	);

	it('answers JSON that is not a request, and goes on serving', async () => {
		const result = await cli(
			['--mcp'],
			{},
			[
				'null',
				'[]',
				'7',
				JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
			].join('\n'),
		);
		const replies = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(replies.map((reply) => reply.error?.code)).toEqual([
			-32600,
			-32600,
			-32600,
			undefined,
		]);
		expect(replies[3]).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
		expect(result.status).toBe(EXIT.passed);
	});

	it('fails the call when a tool throws, and goes on serving', async () => {
		const input = [
			call(1, 'lint_paths', { paths: ['gone'] }),
			{ jsonrpc: '2.0', id: 2, method: 'ping' },
		]
			.map((message) => JSON.stringify(message))
			.join('\n');
		const result = await cli(['--mcp'], {}, input, {
			files: (files) => ({
				...files,
				stat: () => {
					throw new Error('EIO: the disk went away');
				},
			}),
		});
		const [failed, pinged] = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(failed.result.isError).toBe(true);
		expect(failed.result.content[0].text).toContain('the disk went away');
		expect(pinged.result).toEqual({});
	});

	it.each([
		'constructor',
		'toString',
		'valueOf',
		'hasOwnProperty',
		'__proto__',
	])('answers a method named %s as unknown, like any other', async (method) => {
		const result = await cli(
			['--mcp'],
			{},
			[
				JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { x: 1 } }),
				JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
			].join('\n'),
		);
		const [unknown, pinged] = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(unknown).toEqual({
			jsonrpc: '2.0',
			id: 1,
			error: { code: -32601, message: `Unknown method: ${method}` },
		});
		expect(pinged).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
	});

	it.each([
		['no version', { id: 11, method: 'ping' }, 11],
		['the wrong version', { jsonrpc: '1.0', id: 12, method: 'ping' }, 12],
		['a version that is not text', { jsonrpc: 2, id: 13, method: 'ping' }, 13],
	])(
		'refuses a frame with %s and goes on serving',
		async (_name, frame, id) => {
			const result = await cli(
				['--mcp'],
				{},
				[
					JSON.stringify(frame),
					JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'ping' }),
				].join('\n'),
			);
			const [refused, pinged] = result.out
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line));
			expect(refused).toEqual({
				jsonrpc: '2.0',
				id,
				error: { code: -32600, message: 'Not a JSON-RPC 2.0 request' },
			});
			expect(pinged).toEqual({ jsonrpc: '2.0', id: 99, result: {} });
		},
	);

	it('refuses a request line over the size limit and goes on serving', async () => {
		const out: string[] = [];
		const io: Io = {
			files: disk({}),
			stdin: async () => '',
			lines: async function* () {
				yield { oversized: true, bytes: 20_000_000 };
				yield JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' });
			},
			out: (text) => out.push(text),
			err: () => {},
			version: '9.9.9',
			env: {},
			terminal: false,
			fetch: offline(),
			wait: async () => {},
			stopSignal: () => new AbortController().signal,
		};
		expect(await run(['--mcp'], io)).toBe(EXIT.passed);
		const [refused, pinged] = out
			.join('')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(refused).toEqual({
			jsonrpc: '2.0',
			id: null,
			error: {
				code: -32600,
				message: 'Request too large: 20000000 bytes, the limit is 16777216.',
			},
		});
		expect(pinged).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
	});

	it('answers bad JSON and an unknown method with protocol errors', async () => {
		const result = await cli(
			['--mcp'],
			{},
			'not json\n{"jsonrpc":"2.0","id":3,"method":"resources/list"}',
		);
		const [parse, method] = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(parse.error.code).toBe(-32700);
		expect(method).toMatchObject({ id: 3, error: { code: -32601 } });
	});
});

describe('checking with Jev', () => {
	it('never uses the network or the key unless --ask is given', async () => {
		const fetch = jevSays();
		const result = await cli(['q.ts'], { 'q.ts': VAGUE }, '', world(fetch));
		expect(fetch).not.toHaveBeenCalled();
		expect(result.status).toBe(EXIT.passed);
	});

	it('prints the same report as before when --ask is not given', async () => {
		const result = await cli(['--format', 'json', 'q.ts'], { 'q.ts': VAGUE });
		expect(Object.keys(JSON.parse(result.out).totals)).toEqual([
			'files',
			'questions',
			'unreadable',
			'excluded',
			'skipped',
			'unread',
			'counts',
			'fixable',
		]);
	});

	it('says what it would send under --ask-plan, with no key and nothing sent', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask-plan', '--format', 'json', '.'],
			{ 'a.ts': VAGUE, 'b.ts': RUNTIME },
			'',
			world(fetch, {}),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.status).toBe(EXIT.passed);
		expect(JSON.parse(result.out).totals.ask).toMatchObject({
			sent: false,
			planned: 1,
			answered: 0,
			runtime: 1,
			overLimit: 0,
			model: 'jev-1.13.0',
			state: false,
		});
		const text = await cli(['--ask-plan', '.'], { 'a.ts': VAGUE });
		expect(text.out).toMatch(
			/--ask would send 1 request to TypeSafe on jev-1\.13\.0, roughly [\d,]+ input tokens\./,
		);
	});

	it('refuses --ask with no key, before sending anything', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { TYPESAFE_API_KEY: '  ' }),
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.err).toContain('--ask needs an API key in TYPESAFE_API_KEY');
		expect(result.out).toBe('');
	});

	it("asks OpenAI with the OpenAI key when the model is gpt-6-luna, and says the cutoff is Jev's", async () => {
		const lunaSays = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				model: 'gpt-6-luna',
				answers: [{ type: 'predicate', name: 'DEC302', probability: 0.91 }],
				usage: { input_tokens: 200 },
			}),
			text: async () => '',
		}));
		const noKey = await cli(
			['--ask', '--ask-model', 'gpt-6-luna', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(lunaSays as unknown as Sent, KEY),
		);
		expect(noKey.status).toBe(EXIT.unusable);
		expect(noKey.err).toContain('--ask needs an API key in OPENAI_API_KEY');
		expect(lunaSays).not.toHaveBeenCalled();

		const result = await cli(
			['--ask', '--ask-model', 'gpt-6-luna', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(lunaSays as unknown as Sent, { OPENAI_API_KEY: 'sk-test' }),
		);
		expect(lunaSays).toHaveBeenCalledTimes(1);
		const [url, init] = lunaSays.mock.calls[0] as unknown as [
			string,
			{ headers: Record<string, string>; body: string },
		];
		expect(url).toBe('https://api.openai.com/v1/decisions');
		expect(init.headers.Authorization).toBe('Bearer sk-test');
		expect(JSON.parse(init.body).questions[0].type).toBe('predicate');
		expect(result.out).toContain(
			'(Luna put this at 0.91.) The cutoff was set on jev-1.13.0, not on Luna.',
		);
		expect(result.out).toContain(
			'Luna answered 1 of 1 request on gpt-6-luna, 200 input tokens.',
		);
		expect(result.err).toMatch(/Sending 1 request to OpenAI on gpt-6-luna/);
		expect(result.out + result.err).not.toContain('sk-test');
	});

	it('reports what Jev flags, in its place, and says what was sent', async () => {
		const fetch = jevSays({ DEC301: { noul: 0.02 }, DEC302: { noul: 0.91 } });
		const result = await cli(
			['--ask', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch),
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).toContain(
			`q.ts:1:${VAGUE.indexOf('big') + 1}  info  DEC302  `,
		);
		expect(result.out).toContain('(Jev put this at 0.91.)');
		expect(result.out).toContain(
			'Jev answered 1 of 1 request on jev-1.13.0, 310 input tokens.',
		);
		expect(result.err).toMatch(
			/^decisionlint: Sending 1 request to TypeSafe on jev-1\.13\.0, roughly [\d,]+ input tokens\. State is not sent\.\n$/,
		);
	});

	it('says the cutoff was set on another version when a different Jev is asked', async () => {
		const result = await cli(
			['--ask', '--ask-model', 'jev-99.0.0', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({ DEC302: { noul: 0.91 } })),
		);
		expect(result.out).toContain(
			'(Jev put this at 0.91.) The cutoff was set on jev-1.13.0, not on jev-99.0.0.',
		);

		const pinned = await cli(
			['--ask', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({ DEC302: { noul: 0.91 } })),
		);
		expect(pinned.out).toContain('(Jev put this at 0.91.)');
		expect(pinned.out).not.toContain('The cutoff was set on');
	});

	it('sends the key as a header and prints it nowhere', async () => {
		const fetch = jevSays({ DEC302: { noul: 0.91 } });
		const text = await cli(
			['--ask', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch),
		);
		const json = await cli(
			['--ask', '--format', 'json', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({}, 401)),
		);
		expect(calls(fetch)[0]?.headers.Authorization).toBe(
			'Bearer apikey_secret_value',
		);
		for (const printed of [text.out, text.err, json.out, json.err])
			expect(printed).not.toContain('apikey_secret_value');
	});

	it('sends exactly the requests the plan counted', async () => {
		const tree = { 'a.ts': VAGUE, 'b.ts': HEAVY, 'c.json': STATED };
		const plan = await cli(['--ask-plan', '--format', 'json', '.'], tree);
		const fetch = jevSays();
		await cli(['--ask', '.'], tree, '', world(fetch));
		expect(fetch).toHaveBeenCalledTimes(
			JSON.parse(plan.out).totals.ask.planned,
		);
	});

	it('never sends a question with a part built at runtime, and counts it', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', 'q.ts'],
			{ 'q.ts': RUNTIME },
			'',
			world(fetch),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.out).toContain('Not sent: 1 question built at runtime.');
		expect(result.err).toBe('');
	});

	it('sends state only with --ask-send-state', async () => {
		const without = jevSays();
		await cli(['--ask', 'r.json'], { 'r.json': STATED }, '', world(without));
		expect(JSON.stringify(calls(without))).not.toContain('Wheel wobbles.');

		const sent = jevSays();
		const result = await cli(
			['--ask', '--ask-send-state', 'r.json'],
			{ 'r.json': STATED },
			'',
			world(sent),
		);
		expect(JSON.stringify(calls(sent))).toContain('Wheel wobbles.');
		expect(result.err).toContain('State is sent.');
	});

	it('holds the limit across files, and fails the run that passed it', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-max-calls', '1', '.'],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			'',
			world(fetch),
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(
			'1 request over the --ask-max-calls limit not sent.',
		);
		expect(result.out).toContain('Jev answered 1 of 1 request');
	});

	it.each([
		[401, 'TypeSafe rejected the API key (401)'],
		[422, 'TypeSafe rejected the request (422)'],
		[429, 'TypeSafe is busy or the rate limit was reached (429)'],
	])('fails the run on a %i, and says how far it got', async (status, said) => {
		const result = await cli(
			['--ask', '.'],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			'',
			world(jevSays({}, status)),
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(`${said}. Jev answered 0 of 2 requests.`);
		// What linting found is still printed.
		expect(result.out).toContain('Jev answered 0 of 2 requests');
	});

	it('names Luna, not Jev, when a run against OpenAI falls short', async () => {
		const result = await cli(
			['--ask', '--ask-model', 'gpt-6-luna', '.'],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			'',
			world(jevSays({}, 401), { OPENAI_API_KEY: 'sk-test' }),
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(
			'OpenAI rejected the API key (401). Luna answered 0 of 2 requests.',
		);
		expect(result.err).not.toContain('Jev answered');
	});

	it('stops sending after a failure', async () => {
		const fetch = jevSays({}, 401);
		await cli(
			['--ask', '.'],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			'',
			world(fetch),
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('says it could not reach TypeSafe when the network fails', async () => {
		const result = await cli(['--ask', 'q.ts'], { 'q.ts': VAGUE }, '', {
			env: KEY,
		});
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('Could not reach TypeSafe (offline).');
	});

	it('does not call a stopped run finished, or a network failure', async () => {
		const stop = new AbortController();
		const fetch = vi.fn(async (_url: string, init: { body: string }) => {
			stop.abort();
			return {
				ok: true,
				status: 200,
				json: async () => ({
					model: 'jev-1.13.0',
					answers: answerAll(init.body),
					usage: { input_tokens: 310 },
				}),
				text: async () => '',
			};
		});
		const result = await cli(
			['--ask', '.'],
			{ 'a.ts': VAGUE, 'b.ts': HEAVY },
			'',
			{ env: KEY, fetch: fetch as unknown as Fetch, signal: stop.signal },
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain('Stopped. Jev answered 1 of 2 requests.');
		expect(result.err).not.toContain('Could not reach');
	});

	it('cannot be switched on from a settings file', async () => {
		const fetch = jevSays();
		const result = await cli(
			['q.ts'],
			{ 'q.ts': VAGUE, 'decisionlint.json': '{ "jev": true }' },
			'',
			world(fetch),
		);
		expect(result.status).toBe(EXIT.unusable);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('takes rule levels: off is not asked, error fails the run', async () => {
		const off = jevSays();
		await cli(
			['--ask', '--rule', 'DEC302=off', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(off),
		);
		expect(Object.keys(calls(off)[0]?.body.questions)).not.toContain('DEC302');

		const raised = await cli(
			['--ask', '--rule', 'DEC302=error', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({ DEC302: { noul: 0.91 } })),
		);
		expect(raised.status).toBe(EXIT.failed);
	});

	it('asks the model it is given', async () => {
		const fetch = jevSays();
		await cli(
			['--ask', '--ask-model', 'jev-1.14.0', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch),
		);
		expect(calls(fetch)[0]?.body.model).toBe('jev-1.14.0');
	});

	it('checks text from standard input', async () => {
		const fetch = jevSays({ DEC302: { noul: 0.91 } });
		const result = await cli(
			['--ask', '--stdin-filename', 'q.ts'],
			{},
			VAGUE,
			world(fetch),
		);
		expect(result.out).toContain('DEC302');
	});

	it('hides Jev findings under --quiet unless one is an error', async () => {
		const answers = { DEC302: { noul: 0.91 } };
		const quiet = await cli(
			['--ask', '--quiet', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays(answers)),
		);
		expect(quiet.out).not.toContain('DEC302');
		const raised = await cli(
			['--ask', '--quiet', '--rule', 'DEC302=error', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays(answers)),
		);
		expect(raised.out).toContain('DEC302');
	});

	it.each([
		[['--ask-model', 'jev-1.14.0', 'q.ts'], '--ask-model needs --ask'],
		[['--ask-max-calls', '3', 'q.ts'], '--ask-max-calls needs --ask'],
		[['--ask-send-state', 'q.ts'], '--ask-send-state needs --ask'],
		[['--ask', '--mcp'], '--ask cannot be combined with --mcp'],
		[
			['--ask', '--ask-max-calls', '0', 'q.ts'],
			'not a whole number above zero',
		],
	])('refuses %j', async (args, said) => {
		const fetch = jevSays();
		const result = await cli(args, { 'q.ts': VAGUE }, '', world(fetch));
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(said);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('the files other tools run this through', () => {
	const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

	it('pins the pre-commit hook to this release, and to the file types the tool reads', () => {
		const hook = readFileSync('.pre-commit-hooks.yaml', 'utf8');
		expect(hook).toContain(`entry: npx --yes decisionlint@${version} `);
		expect(hook).toContain(`rev: v${version}`);
		const listed = /files: \\\.\(([^)]+)\)\$/.exec(hook)?.[1]?.split('|');
		expect(listed?.sort()).toEqual([...EXTENSIONS.keys()].sort());
		// A named file of another type exits 2, so the hook must never be handed one.
		expect(hook).toContain('--no-error-on-unmatched-pattern');
	});

	it('pins the GitHub Action to this release, and passes inputs as environment', () => {
		const action = readFileSync('action.yml', 'utf8');
		expect(action).toMatch(
			new RegExp(
				`version:[\\s\\S]*?default: ${version.replace(/\./g, '\\.')}\\n`,
			),
		);
		expect(action).toContain(`uses: nolindnaidoo/decisionlint@v${version}`);
		// An input spliced into the script could be read as a command.
		const script = action.slice(action.indexOf('      run: |'));
		expect(script).not.toContain('${{');
	});
});

describe('a file whose extension names a property of Object.prototype', () => {
	const NOUL = `{ "questions": { "q": { "type": "noul", "instructions": "Has it shipped?" } } }`;

	it('is refused by name, as any other file type the tool does not read', async () => {
		const result = await cli(['a.constructor'], { 'a.constructor': NOUL });
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(
			'Not a file type decisionlint reads: a.constructor',
		);
	});

	it('is passed over in a directory, as any other file type is', async () => {
		const result = await cli(['.'], {
			'a.constructor': NOUL,
			'b.json': NOUL,
		});
		expect(result.status).toBe(EXIT.passed);
		expect(result.out).not.toContain('a.constructor');
		expect(result.out).not.toContain('could not be read');
	});

	it('is refused by the server, with the reason', async () => {
		const result = await cli(
			['--mcp'],
			{},
			JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'lint_text',
					arguments: { text: NOUL, filename: 'x.constructor' },
				},
			}),
		);
		const [reply] = result.out
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(reply.result.isError).toBe(true);
		expect(reply.result.content[0].text).toBe(
			'Not a file type decisionlint reads: x.constructor',
		);
	});
});

describe('text handed to the server', () => {
	const over = `{ "questions": { "q": { "type": "noul", "instructions": "${'a'.repeat(1_000_001)}" } } }`;

	it.each(['lint_text', 'fix_text', 'plan_ask', 'probe_question'])(
		'is held to the size limit files are held to, by %s',
		async (name) => {
			const result = await cli(
				['--mcp'],
				{},
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name, arguments: { text: over } },
				}),
			);
			const [reply] = result.out
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line));
			expect(reply.result.isError).toBe(true);
			expect(reply.result.content[0].text).toBe(
				"'text' is over the size limit of 1000000 bytes.",
			);
		},
	);
});

describe('where --ask sends', () => {
	const LOCAL = 'http://localhost:8080/v1/systemone';

	it('refuses a gateway spelling that names no host, with nothing sent', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-model', 'openai/gpt-6-luna-decisions', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(
			"'openai/gpt-6-luna-decisions' names no platform this tool knows the host of. Set the endpoint it is sent to. Use --ask-endpoint, and --ask-shape where its path does not say, or --ask-platform.",
		);
	});

	it('sends to --ask-endpoint with no key when none is set, and names the host', async () => {
		const fetch = jevSays({ DEC302: { noul: 0.91 } });
		const result = await cli(
			[
				'--ask',
				'--ask-model',
				'ggml-org/OpenJev-GGUF',
				'--ask-endpoint',
				LOCAL,
				'--format',
				'compact',
				'q.ts',
			],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, {}),
		);
		expect(result.status).toBe(EXIT.passed);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe(LOCAL);
		expect(calls(fetch)[0]?.headers).not.toHaveProperty('Authorization');
		expect(result.err).toMatch(
			/Sending 1 request to localhost:8080 on ggml-org\/OpenJev-GGUF/,
		);
		expect(result.out).toContain(
			'(The model put this at 0.91.) The cutoff was set on jev-1.13.0, not on the model.',
		);
		expect(result.out).toContain('The model answered 1 of 1 request on');
	});

	it('sends the key of the shape to a host it does not know, when one is set', async () => {
		const fetch = jevSays();
		await cli(
			['--ask', '--ask-endpoint', LOCAL, 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { TYPESAFE_API_KEY: 'local-key' }),
		);
		expect(calls(fetch)[0]?.headers.Authorization).toBe('Bearer local-key');
	});

	it('reads the endpoint and the shape from the environment when the flags are absent', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-model', 'laya', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, {
				DECISIONLINT_ASK_ENDPOINT: 'http://localhost:11435/api/decide',
				DECISIONLINT_ASK_SHAPE: 'typesafe',
			}),
		);
		expect(result.status).toBe(EXIT.passed);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe('http://localhost:11435/api/decide');
		expect(calls(fetch)[0]?.body).toHaveProperty('questions');
	});

	it('refuses an endpoint whose path does not say the shape, until --ask-shape does', async () => {
		const fetch = jevSays();
		const refused = await cli(
			['--ask', '--ask-endpoint', 'http://localhost:11435/api/decide', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, {}),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(refused.status).toBe(EXIT.unusable);
		expect(refused.err).toContain(
			"'http://localhost:11435/api/decide' does not say which shape it takes. Set the shape to typesafe or openai. Use --ask-endpoint, and --ask-shape where its path does not say, or --ask-platform.",
		);
		const sent = jevSays();
		await cli(
			[
				'--ask',
				'--ask-endpoint',
				'http://localhost:11435/api/decide',
				'--ask-shape',
				'openai',
				'q.ts',
			],
			{ 'q.ts': VAGUE },
			'',
			world(sent, {}),
		);
		// Sent in the shape the flag named: a Decisions body, with its `input`.
		expect(sent).toHaveBeenCalledTimes(1);
		expect(calls(sent)[0]?.body).toHaveProperty('input');
	});

	it.each([
		[
			['--ask', '--ask-shape', 'nope', 'q.ts'],
			"'nope' is not a shape. Use typesafe or openai.",
		],
		[
			['--ask-endpoint', LOCAL, 'q.ts'],
			'--ask-endpoint needs --ask or --ask-plan.',
		],
		[
			['--ask-shape', 'openai', 'q.ts'],
			'--ask-shape needs --ask or --ask-plan.',
		],
	])('refuses %j', async (args, reason) => {
		const fetch = jevSays();
		const result = await cli(args, { 'q.ts': VAGUE }, '', world(fetch));
		expect(fetch).not.toHaveBeenCalled();
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(reason);
	});

	it('refuses a shape in the environment that is not one', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-endpoint', LOCAL, 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { DECISIONLINT_ASK_SHAPE: 'xml' }),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.err).toContain(
			"DECISIONLINT_ASK_SHAPE is 'xml', which is not a shape. Use typesafe or openai.",
		);
	});

	it("sends a platform's spelling to that platform with the key in its own variable", async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-model', '~typesafe/jev-latest', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { OPENROUTER_API_KEY: 'or-key' }),
		);
		expect(result.status).not.toBe(EXIT.unusable);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe('https://openrouter.ai/api/v1/systemone');
		expect(calls(fetch)[0]?.headers.Authorization).toBe('Bearer or-key');
		expect(result.err).toMatch(
			/Sending 1 request to OpenRouter on ~typesafe\/jev-latest/,
		);
		const noKey = await cli(
			['--ask', '--ask-model', '~typesafe/jev-latest', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays(), KEY),
		);
		expect(noKey.err).toContain('--ask needs an API key in OPENROUTER_API_KEY');
	});

	it('says who is sent the requests in the JSON totals', async () => {
		const result = await cli(
			['--ask-plan', '--format', 'json', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays(), {}),
		);
		expect(JSON.parse(result.out).totals.ask).toMatchObject({
			vendor: 'TypeSafe',
			answerer: 'Jev',
		});
	});
});

describe('where --ask-platform sends', () => {
	it('sends to the platform named, with its key and its default model', async () => {
		const fetch = jevSays();
		const result = await cli(
			['--ask', '--ask-platform', 'openrouter', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { OPENROUTER_API_KEY: 'or-key', TYPESAFE_API_KEY: 'ts' }),
		);
		expect(result.status).not.toBe(EXIT.unusable);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe('https://openrouter.ai/api/v1/systemone');
		expect(calls(fetch)[0]?.headers.Authorization).toBe('Bearer or-key');
		expect(calls(fetch)[0]?.body.model).toBe('typesafe/jev-1.13');
		expect(result.err).toMatch(
			/Sending 1 request to OpenRouter on typesafe\/jev-1\.13/,
		);
	});

	it('drops the cutoff caveat only on a route measured to answer as the calibrated Jev', async () => {
		const measured = await cli(
			['--ask', '--ask-platform', 'openrouter', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({ DEC302: { noul: 0.91 } }), {
				OPENROUTER_API_KEY: 'or-key',
			}),
		);
		expect(measured.out).toContain('(Jev put this at 0.91.)');
		expect(measured.out).not.toContain('The cutoff was set on');

		const unmeasured = await cli(
			['--ask', '--ask-platform', 'liquid', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(jevSays({ DEC302: { noul: 0.91 } }), { LIQUID_API_KEY: 'lq-key' }),
		);
		expect(unmeasured.out).toContain(
			'The cutoff was set on jev-1.13.0, not on',
		);

		// The calibrated id, asked in the Decisions shape, which moves Jev's answers.
		const reshaped = await cli(
			['--ask', '--ask-platform', 'llmgateway', '--format', 'compact', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(
				vi.fn(async () => ({
					ok: true,
					status: 200,
					json: async () => ({
						model: 'typesafe/jev-1.13.0',
						answers: [{ type: 'predicate', name: 'DEC302', probability: 0.91 }],
						usage: { input_tokens: 10 },
					}),
					text: async () => '',
				})) as unknown as Sent,
				{ LLM_GATEWAY_API_KEY: 'lg-key' },
			),
		);
		expect(reshaped.out).toContain(
			'The cutoff was set on jev-1.13.0 at TypeSafe, not through LLM Gateway.',
		);
	});

	it('takes --ask-model as the id to send there', async () => {
		const fetch = jevSays();
		await cli(
			['--ask', '--ask-platform', 'liquid', '--ask-model', 'd1:free', 'q.ts'],
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { LIQUID_API_KEY: 'lq' }),
		);
		const [url] = fetch.mock.calls[0] as unknown as [string];
		expect(url).toBe('https://api.liquid.ai/decisions/v1/systemone');
		expect(calls(fetch)[0]?.body.model).toBe('d1:free');
	});

	it.each([
		[
			['--ask', '--ask-platform', 'jay', 'q.ts'],
			"'jay' is not a platform. Use one of typesafe, openai, vercel, openrouter, llmgateway, liquid.",
		],
		[
			['--ask', '--ask-platform', 'litellm', 'q.ts'],
			"'litellm' is not a platform. Use one of typesafe, openai, vercel, openrouter, llmgateway, liquid.",
		],
		[
			[
				'--ask',
				'--ask-platform',
				'openai',
				'--ask-endpoint',
				'http://localhost:4000/v1/decisions',
				'q.ts',
			],
			'--ask-platform and --ask-endpoint name two places. Use one of them.',
		],
		[
			['--ask', '--ask-platform', 'openai', 'q.ts'],
			'--ask needs an API key in OPENAI_API_KEY. Nothing was sent.',
		],
	])('refuses %j with nothing sent', async (args, reason) => {
		const fetch = jevSays();
		const result = await cli(
			args,
			{ 'q.ts': VAGUE },
			'',
			world(fetch, { TYPESAFE_API_KEY: 'ts' }),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(result.status).toBe(EXIT.unusable);
		expect(result.err).toContain(reason);
	});
});
