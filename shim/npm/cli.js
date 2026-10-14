#!/usr/bin/env node
// jevlint-le is decisionlint since 1.0.0. This file only forwards: the real
// command line is run as a child with the same arguments, streams and exit
// code. It is spawned rather than required because `decisionlint` exports
// only its library, and the notice goes to stderr so output stays parseable.
const { spawnSync } = require('node:child_process');
const { dirname, join } = require('node:path');

process.stderr.write(
	'jevlint-le is now decisionlint. This package only forwards to it: install decisionlint.\n',
);
const cli = join(dirname(require.resolve('decisionlint/package.json')), 'cli.js');
const run = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
process.exitCode = run.status ?? 1;
