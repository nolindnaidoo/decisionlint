import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'nolindnaidoo.decisionlint';

// What each sample is written to trigger, in document order. The samples are
// the fixture: change one and this table together.
const EXPECTED: Readonly<Record<string, ReadonlyArray<string>>> = {
	'triage.jev.json': [
		'DEC001',
		'DEC004',
		'DEC008',
		'DEC006',
		'DEC006',
		'DEC007',
		'DEC006',
		'DEC005',
	],
	'triage.ts': [
		'DEC001',
		'DEC004',
		'DEC008',
		'DEC000',
		'DEC009',
		'DEC007',
		'DEC005',
	],
	'triage.py': [
		'DEC004',
		'DEC008',
		'DEC000',
		'DEC009',
		'DEC006',
		'DEC005',
		'DEC001',
	],
	'triage.rs': [
		'DEC001',
		'DEC004',
		'DEC008',
		'DEC000',
		'DEC006',
		'DEC009',
	],
	'triage.go': [
		'DEC001',
		'DEC004',
		'DEC008',
		'DEC000',
		'DEC006',
		'DEC009',
	],
	'clean.ts': [],
	'missing-state.jev.json': [],
	'wording.jev.json': [
		'DEC101',
		'DEC102',
		'DEC105',
		'DEC110',
		'DEC103',
		'DEC112',
	],
	'.oxlintrc.json': ['DEC001', 'DEC005', 'DEC007'],
	'decisions.json': ['DEC102', 'DEC004', 'DEC011', 'DEC012', 'DEC011'],
};

function sample(name: string): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(folder, 'the samples folder is not open as the workspace');
	return vscode.Uri.joinPath(folder.uri, name);
}

// The editor cancels a code-action request when the document changes under
// it, which a test that has just opened or edited a file can race. That is the
// editor declining to answer, not an answer, so the request is made again.
async function quickFixes(
	uri: vscode.Uri,
	range: vscode.Range,
): Promise<vscode.CodeAction[]> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await vscode.commands.executeCommand<vscode.CodeAction[]>(
				'vscode.executeCodeActionProvider',
				uri,
				range,
				vscode.CodeActionKind.QuickFix.value,
			);
		} catch (error) {
			const cancelled = error instanceof Error && error.message === 'Canceled';
			if (!cancelled || attempt === 5) throw error;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

function ours(uri: vscode.Uri): vscode.Diagnostic[] {
	return vscode.languages
		.getDiagnostics(uri)
		.filter((diagnostic) => diagnostic.source === 'decisionlint')
		.sort((a, b) => a.range.start.compareTo(b.range.start));
}

function codeOf(diagnostic: vscode.Diagnostic): string {
	const code = diagnostic.code;
	return typeof code === 'object' ? String(code.value) : String(code);
}

function codes(uri: vscode.Uri): string[] {
	return ours(uri).map(codeOf);
}

async function until(
	check: () => boolean,
	describe: () => string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	assert.fail(`timed out: ${describe()}`);
}

async function untilCodes(
	uri: vscode.Uri,
	expected: ReadonlyArray<string>,
): Promise<void> {
	await until(
		() => JSON.stringify(codes(uri)) === JSON.stringify(expected),
		() =>
			`${uri.path} has ${JSON.stringify(codes(uri))}, expected ${JSON.stringify(expected)}`,
	);
}

async function open(name: string): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument(sample(name));
	return vscode.window.showTextDocument(document);
}

async function closeAll(): Promise<void> {
	// Revert first: these tests edit the samples in memory and must never save them.
	await vscode.commands.executeCommand('workbench.action.files.revert');
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

describe('DecisionLint in a real editor', function () {
	this.timeout(60_000);

	before(async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `extension ${EXTENSION_ID} not found`);
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
	});

	afterEach(closeAll);

	it('registers every declared command', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		const declared: string[] = extension?.packageJSON.contributes.commands.map(
			(command: { command: string }) => command.command,
		);
		const registered = await vscode.commands.getCommands(true);
		assert.strictEqual(declared.length, 19);
		for (const id of declared)
			assert.ok(registered.includes(id), `missing command: ${id}`);
	});

	it('lints the whole workspace without opening a file, and skips node_modules', async () => {
		await vscode.commands.executeCommand('decisionlint.lintWorkspace');
		for (const [name, expected] of Object.entries(EXPECTED))
			await untilCodes(sample(name), expected);
		const stray = vscode.languages
			.getDiagnostics()
			.filter(([uri, list]) =>
				list.some(
					(diagnostic) =>
						diagnostic.source === 'decisionlint' &&
						uri.path.includes('node_modules'),
				),
			);
		assert.deepStrictEqual(stray, []);
	});

	for (const [name, expected] of Object.entries(EXPECTED)) {
		it(`reports the planted findings in ${name} when it is opened`, async () => {
			await open(name);
			await untilCodes(sample(name), expected);
		});
	}

	it('maps severities and links each finding to its own page', async () => {
		await open('triage.ts');
		await untilCodes(sample('triage.ts'), EXPECTED['triage.ts'] ?? []);
		const bySeverity = Object.fromEntries(
			ours(sample('triage.ts')).map((diagnostic) => [
				codeOf(diagnostic),
				diagnostic.severity,
			]),
		);
		assert.strictEqual(bySeverity.DEC000, vscode.DiagnosticSeverity.Hint);
		assert.strictEqual(
			bySeverity.DEC004,
			vscode.DiagnosticSeverity.Information,
		);
		assert.strictEqual(bySeverity.DEC001, vscode.DiagnosticSeverity.Warning);
		assert.strictEqual(bySeverity.DEC007, vscode.DiagnosticSeverity.Error);
		for (const diagnostic of ours(sample('triage.ts'))) {
			const code = diagnostic.code;
			assert.ok(typeof code === 'object' && code.target, 'no docs link');
			assert.strictEqual(code.target.authority, 'github.com');
			assert.ok(
				code.target.path.endsWith(`/docs/rules/${code.value}.md`),
				code.target.path,
			);
		}
	});

	it('underlines the thing each finding is about', async () => {
		const editor = await open('triage.jev.json');
		const uri = sample('triage.jev.json');
		await untilCodes(uri, EXPECTED['triage.jev.json'] ?? []);
		const texts = ours(uri).map(
			(diagnostic) =>
				`${codeOf(diagnostic)} ${editor.document.getText(diagnostic.range)}`,
		);
		assert.deepStrictEqual(texts, [
			'DEC001 "jev-latest"',
			'DEC004 "job_type"',
			'DEC008 ["0", "1", "2"]',
			'DEC006 "yes"',
			'DEC006 "no"',
			'DEC007 "nuol"',
			'DEC006 "criteria"',
			'DEC005 "job_type"',
		]);
	});

	it('applies the fallback quick fix and leaves valid JSON', async () => {
		const editor = await open('triage.jev.json');
		const uri = sample('triage.jev.json');
		await untilCodes(uri, EXPECTED['triage.jev.json'] ?? []);
		const target = ours(uri).find(
			(diagnostic) => codeOf(diagnostic) === 'DEC004',
		);
		assert.ok(target);

		const actions = await quickFixes(uri, target.range);
		const fix = actions.find(
			(action) => action.title === "Add an 'other' option",
		);
		assert.ok(
			fix?.edit,
			`no fallback fix among: ${actions.map((a) => a.title)}`,
		);
		assert.strictEqual(await vscode.workspace.applyEdit(fix.edit), true);

		await until(
			() => !codes(uri).includes('DEC004'),
			() => `DEC004 still reported: ${JSON.stringify(codes(uri))}`,
		);
		const text = editor.document.getText();
		assert.ok(
			text.includes(
				'        "gears": "Indexing, cables, or a new cassette",\n        "other": "Fits none of the other options"\n      }',
			),
			'the option was not inserted with the surrounding indentation',
		);
	});

	it('silences a finding with the disable-line quick fix', async () => {
		await open('triage.ts');
		const uri = sample('triage.ts');
		await untilCodes(uri, EXPECTED['triage.ts'] ?? []);
		const target = ours(uri).find(
			(diagnostic) => codeOf(diagnostic) === 'DEC008',
		);
		assert.ok(target);
		const actions = await quickFixes(uri, target.range);
		const silence = actions.find(
			(action) => action.title === 'Disable DEC008 for this line',
		);
		assert.ok(
			silence?.edit,
			`no disable action among: ${actions.map((a) => a.title)}`,
		);
		assert.strictEqual(await vscode.workspace.applyEdit(silence.edit), true);
		await until(
			() => !codes(uri).includes('DEC008'),
			() => `DEC008 still reported: ${JSON.stringify(codes(uri))}`,
		);
	});

	it('re-lints after an edit', async () => {
		const editor = await open('clean.ts');
		const uri = sample('clean.ts');
		await untilCodes(uri, []);
		const at = editor.document.getText().indexOf("'jev-1.13.0'");
		const range = new vscode.Range(
			editor.document.positionAt(at),
			editor.document.positionAt(at + "'jev-1.13.0'".length),
		);
		assert.strictEqual(
			await editor.edit((builder) => builder.replace(range, "'jev-latest'")),
			true,
		);
		await untilCodes(uri, ['DEC001']);
	});

	it('honours a rule switched off in settings', async () => {
		const settings = vscode.workspace.getConfiguration('decisionlint');
		await open('triage.ts');
		await untilCodes(sample('triage.ts'), EXPECTED['triage.ts'] ?? []);
		await settings.update(
			'rules',
			{ DEC004: 'off', DEC000: 'off' },
			vscode.ConfigurationTarget.Global,
		);
		try {
			// With DEC004 off, the comment in the sample that silences a DEC004
			// silences nothing, and is reported where that finding would have been.
			await untilCodes(sample('triage.ts'), [
				'DEC001',
				'DEC008',
				'DEC010',
				'DEC009',
				'DEC007',
				'DEC005',
			]);
		} finally {
			await settings.update(
				'rules',
				undefined,
				vscode.ConfigurationTarget.Global,
			);
		}
	});

	it('runs a wording rule that is off by default once it is switched on', async () => {
		const settings = vscode.workspace.getConfiguration('decisionlint');
		const uri = sample('wording.jev.json');
		await open('wording.jev.json');
		await untilCodes(uri, EXPECTED['wording.jev.json'] ?? []);
		await settings.update(
			'rules',
			{ DEC104: 'warning' },
			vscode.ConfigurationTarget.Global,
		);
		try {
			await untilCodes(uri, [...(EXPECTED['wording.jev.json'] ?? []), 'DEC104']);
		} finally {
			await settings.update(
				'rules',
				undefined,
				vscode.ConfigurationTarget.Global,
			);
		}
	});

	it("lints with the copy of the tool the project installs, in place of the extension's own", async () => {
		const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
		const dir = path.join(folder, 'node_modules', 'decisionlint');
		const manifest = path.join(dir, 'package.json');
		const library = path.join(dir, 'lib.js');
		// A copy that reports one finding no real version has, so its work cannot
		// be mistaken for the extension's own.
		const copy = `module.exports = {
			api: 1,
			syntaxes: ['js'],
			rules: {},
			lint: () => ({
				findings: [{ code: 'DEC777', message: 'From the installed copy.', span: { start: 0, end: 1 }, questionId: undefined, fix: undefined, severity: 'warning' }],
				questionCount: 1,
				unreadableCount: 0,
			}),
			fix: (text) => ({ text, fixed: 0 }),
		};`;
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(manifest, '{ "name": "decisionlint", "version": "9.9.9", "main": "lib.js" }');
		fs.writeFileSync(library, copy);
		try {
			const editor = await open('clean.ts');
			const uri = sample('clean.ts');
			// The extension keeps what it knows of a folder's packages for a few
			// seconds, so the file is nudged until the new copy is noticed.
			const deadline = Date.now() + 40_000;
			while (Date.now() < deadline && codes(uri).join() !== 'DEC777') {
				await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), ' '));
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			assert.deepStrictEqual(codes(uri), ['DEC777']);
			assert.strictEqual(ours(uri)[0]?.message, 'From the installed copy.');
		} finally {
			fs.unlinkSync(library);
			fs.unlinkSync(manifest);
			fs.rmdirSync(dir);
		}
	});

	it('leaves the samples on disk untouched', async () => {
		const bytes = await vscode.workspace.fs.readFile(sample('triage.jev.json'));
		assert.ok(
			!Buffer.from(bytes).toString('utf8').includes('"model": "jev-1'),
			'unexpected content',
		);
		assert.strictEqual(
			vscode.workspace.textDocuments.filter((document) => document.isDirty)
				.length,
			0,
		);
	});
});
