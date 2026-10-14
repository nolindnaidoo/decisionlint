# jevlint-le is now decisionlint

JevLint-LE was renamed to **DecisionLint** at 1.0.0, when it grew from one
model to every platform that serves a decision model. The command line and
the library live on npm as [`decisionlint`](https://www.npmjs.com/package/decisionlint),
and the MCP server as [`decisionlint-mcp`](https://www.npmjs.com/package/decisionlint-mcp).

This package, `jevlint-le` 0.9.0, is the last under the old name. It depends
on `decisionlint` and forwards to it, so `npx jevlint-le` keeps working and
runs the current version. Switch when convenient:

```sh
npm uninstall jevlint-le
npm install --save-dev decisionlint
```

Then replace `jevlint-le` with `decisionlint` wherever it is run. Everything
written for the old name still works under the new one: a `jevlint-le.json`
is read where no `decisionlint.json` sits beside it, `jevlint-le-disable`
comments still silence, and the `JEV` rule codes are read as their `DEC`
successors.

The source, the docs and the rule pages are at
https://github.com/nolindnaidoo/decisionlint.
