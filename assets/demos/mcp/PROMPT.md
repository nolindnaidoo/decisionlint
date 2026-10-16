# The kept MCP take

- Recorded: 2026-10-16, at 1.0.1
- Host: Claude Code 2.1.301, Opus 5.5, medium effort, auto mode
- Server: this repo's `mcp/server.js`, the only one loaded (`--strict-mcp-config`)
- Tools allowed: `lint_paths`, `explain_rule`, `Read`. Bash, WebFetch, WebSearch and sub-agents refused, so the
  agent answers from the server and not from a shell.
- Prompt: `Lint request.jev.json with decisionlint. One short line per finding.`
- Answer: one `lint_paths` call, three findings (DEC006, DEC001, DEC102), each with whether it has a safe fix.

The model answers differently each run. This is the take that was kept.
