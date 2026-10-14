# jevlint-le-mcp is now decisionlint-mcp

JevLint-LE was renamed to **DecisionLint** at 1.0.0, when it grew from one
model to every platform that serves a decision model. The MCP server lives
on npm as [`decisionlint-mcp`](https://www.npmjs.com/package/decisionlint-mcp)
and on the MCP registry as `io.github.nolindnaidoo/decisionlint`.

This package, `jevlint-le-mcp` 0.9.0, is the last under the old name. It
depends on `decisionlint-mcp` and forwards to it, so a client configured with
`npx -y jevlint-le-mcp` keeps working and runs the current server. Switch
when convenient, in the client's configuration:

```json
{
  "mcpServers": {
    "decisionlint": { "command": "npx", "args": ["-y", "decisionlint-mcp"] }
  }
}
```

The tools are `lint_text`, `lint_paths`, `fix_text`, `explain_rule`,
`list_rules`, `plan_ask`, `ask_model` and `probe_question`. The `JEV` rule
codes are read as their `DEC` successors.

The source, the docs and the rule pages are at
https://github.com/nolindnaidoo/decisionlint.
