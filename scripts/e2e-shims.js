#!/usr/bin/env node
/**
 * Proves the bridges to the old names, in shim/. The two npm shims are
 * installed into a throwaway project from local tarballs beside the real
 * packages, so npm satisfies their `^1` with the build on this machine and
 * nothing comes from the registry. Each is then run as a process: the
 * command-line shim must answer as decisionlint does, forward the exit code
 * and keep its notice off stdout; the server shim must answer a ping with
 * nothing but JSON on stdout. The extension shim is packaged with vsce and
 * its manifest held to: the old id, nothing contributed, one activation.
 *
 *   bun run build:npm && bun run test:shims
 */
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');
const version = JSON.parse(
	readFileSync(join(root, 'package.json'), 'utf8'),
).version;
const major = version.split('.')[0];
const out = mkdtempSync(join(tmpdir(), 'decisionlint-shims-'));

const manifest = (dir) =>
	JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));

function pack(dir) {
	const name = execFileSync(
		'npm',
		['pack', '--silent', '--pack-destination', out, join(root, dir)],
		{ encoding: 'utf8' },
	).trim();
	return join(out, name);
}

// The shims carry the old names, the last version under them, and depend on
// the current major of the real package.
for (const [dir, name, dep] of [
	['shim/npm', 'jevlint-le', 'decisionlint'],
	['shim/mcp', 'jevlint-le-mcp', 'decisionlint-mcp'],
]) {
	const shim = manifest(dir);
	assert.equal(shim.name, name);
	assert.equal(shim.version, '0.9.0');
	assert.equal(shim.dependencies[dep], `^${major}.0.0`);
}

for (const file of ['npm/cli.js', 'npm/lib.js', 'mcp/server.js'])
	assert.ok(
		existsSync(join(root, file)),
		`${file} is missing: run bun run build:npm first`,
	);

const project = join(out, 'project');
mkdirSync(project);
writeFileSync(
	join(project, 'package.json'),
	'{ "name": "shim-check", "private": true }\n',
);
// One install for all four, so each shim's `^major` is satisfied by the
// local tarball installed beside it and npm fetches nothing.
const tarballs = ['npm', 'mcp', 'shim/npm', 'shim/mcp'].map(pack);
execFileSync(
	'npm',
	[
		'install',
		'--no-audit',
		'--no-fund',
		'--no-package-lock',
		'--loglevel=error',
		...tarballs,
	],
	{ cwd: project, stdio: 'pipe' },
);
const installed = (name) =>
	JSON.parse(
		readFileSync(join(project, 'node_modules', name, 'package.json'), 'utf8'),
	).version;
assert.equal(installed('decisionlint'), version);
assert.equal(installed('decisionlint-mcp'), version);

const node = process.execPath;
const bin = (name, file) => join(project, 'node_modules', name, file);

// The command line: the real answer on stdout, the notice on stderr, and the
// exit code forwarded, 2 being what decisionlint gives an unknown option.
const asked = spawnSync(node, [bin('jevlint-le', 'cli.js'), '--version'], {
	encoding: 'utf8',
});
assert.equal(asked.status, 0, asked.stderr);
assert.equal(asked.stdout.trim(), version);
assert.match(asked.stderr, /jevlint-le is now decisionlint/);
const refused = spawnSync(
	node,
	[bin('jevlint-le', 'cli.js'), '--no-such-option'],
	{ encoding: 'utf8' },
);
assert.equal(refused.status, 2);

// The library is the same module, not a copy.
const lib = require(join(project, 'node_modules', 'jevlint-le'));
assert.equal(lib, require(join(project, 'node_modules', 'decisionlint')));
assert.equal(typeof lib.lint, 'function');

// The server: a ping is answered, and stdout carries JSON lines and nothing
// else, because the notice went to stderr.
const ping = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' });
const server = spawnSync(node, [bin('jevlint-le-mcp', 'server.js')], {
	input: `${ping}\n`,
	encoding: 'utf8',
});
assert.equal(server.status, 0, server.stderr);
assert.match(server.stderr, /jevlint-le-mcp is now decisionlint-mcp/);
const replies = server.stdout
	.trim()
	.split('\n')
	.map((line) => JSON.parse(line));
assert.deepEqual(
	replies.find((reply) => reply.id === 7),
	{ jsonrpc: '2.0', id: 7, result: {} },
);

// What each shim would upload: the forwarder, the manifest, the readme and
// the license, and nothing else.
for (const [dir, files] of [
	['shim/npm', ['LICENSE', 'README.md', 'cli.js', 'lib.js', 'package.json']],
	['shim/mcp', ['LICENSE', 'README.md', 'package.json', 'server.js']],
]) {
	const listed = JSON.parse(
		execFileSync(
			'npm',
			['pack', '--dry-run', '--json', '--silent', join(root, dir)],
			{ encoding: 'utf8' },
		),
	);
	assert.deepEqual(
		listed[0].files.map((file) => file.path).sort(),
		files,
		dir,
	);
}

// The extension shim: the old id, the last version under it, nothing
// contributed, one activation, and it packages.
const extension = manifest('shim/extension');
assert.equal(
	`${extension.publisher}.${extension.name}`,
	'nolindnaidoo.jevlint-le',
);
assert.equal(extension.version, '0.9.0');
assert.deepEqual(extension.contributes, {});
assert.deepEqual(extension.activationEvents, ['onStartupFinished']);
assert.ok(existsSync(join(root, 'shim/extension', extension.main)));
execFileSync('bunx', ['vsce', 'package', '--no-dependencies', '--out', out], {
	cwd: join(root, 'shim/extension'),
	stdio: 'pipe',
});
assert.ok(readdirSync(out).includes('jevlint-le-0.9.0.vsix'));

console.log('SHIMS TEST: PASS');
