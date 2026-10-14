#!/usr/bin/env node
// jevlint-le-mcp is decisionlint-mcp since 1.0.0. This file only forwards:
// the real server is run as a child on the same stdin, stdout and exit code.
// Stdout is the protocol channel, so the notice goes to stderr and nowhere
// else: one stray line on stdout would break the client.
const { spawnSync } = require('node:child_process');
const { dirname, join } = require('node:path');

process.stderr.write(
	'jevlint-le-mcp is now decisionlint-mcp. This package only forwards to it: install decisionlint-mcp.\n',
);
const server = join(
	dirname(require.resolve('decisionlint-mcp/package.json')),
	'server.js',
);
const run = spawnSync(process.execPath, [server, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
process.exitCode = run.status ?? 1;
