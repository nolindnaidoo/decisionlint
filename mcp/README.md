# decisionlint-mcp

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.decisionlint">
    <img src="https://img.shields.io/badge/Install%20from-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode" alt="Install from VS Code Marketplace" />
  </a>
  <a href="https://open-vsx.org/extension/nolindnaidoo/decisionlint">
    <img src="https://img.shields.io/open-vsx/dt/nolindnaidoo/decisionlint?style=for-the-badge&label=Open%20VSX&color=blue" alt="Open VSX downloads" />
  </a>
  <a href="https://www.npmjs.com/package/decisionlint-mcp">
    <img src="https://img.shields.io/npm/v/decisionlint-mcp?style=for-the-badge&label=MCP%20server&color=blue&logo=npm" alt="decisionlint-mcp on npm" />
  </a>
  <a href="https://letools.dev/tools/decisionlint">
    <img src="https://img.shields.io/badge/LE%20Tools-letools.dev-blue?style=for-the-badge" alt="LE Tools" />
  </a>
</p>

![An agent in Claude Code linting a request through the MCP server and listing its three findings](https://raw.githubusercontent.com/nolindnaidoo/decisionlint/main/assets/demos/mcp.gif)

Lint Jev and Luna questions from your agent. An
[MCP](https://modelcontextprotocol.io) server that lints the questions a
project sends to TypeSafe's Jev model or to OpenAI's Decisions API
(`gpt-6-luna`) before they are sent, and mends the ones it can. It is the
engine behind the [DecisionLint](https://letools.dev/tools/decisionlint) editor
extension, as eight tools an agent can call.

Linting needs no API key and makes no network calls, and nothing here writes
a file. Two tools ask the model itself, with your key, when you ask them to.

## Use it

Point any MCP host at `npx decisionlint-mcp`.

**Claude Code**

```bash
claude mcp add decisionlint -- npx -y decisionlint-mcp
```

**Anything with a JSON config**, such as Cursor, Windsurf or Claude Desktop:

```json
{
  "mcpServers": {
    "decisionlint": {
      "command": "npx",
      "args": ["-y", "decisionlint-mcp"]
    }
  }
}
```

**VS Code** needs nothing here. Install the extension instead. It carries
this server and registers it for you:
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.decisionlint)
· [Open VSX](https://open-vsx.org/extension/nolindnaidoo/decisionlint)

**Already running `decisionlint` in CI?** The same server is
`npx decisionlint --mcp`. This package is the one with no flag to forget: a
client that starts `decisionlint` bare gets a linter that exits, not a server.

Prefer a global install to `npx` on every launch:

```bash
npm install -g decisionlint-mcp
```

```json
{
  "mcpServers": {
    "decisionlint": { "command": "decisionlint-mcp" }
  }
}
```

No configuration of its own, and no key unless you want a check with the
model. To check it before wiring it into anything:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y decisionlint-mcp
```

## Tools

| Tool | What it does | Sends |
|---|---|---|
| `lint_text` | Lints a request body or source code passed as text. Each finding carries the edit that would mend it | nothing |
| `lint_paths` | Lints files or directories on disk | nothing |
| `fix_text` | Returns the text with the safe fixes applied, and the report of what is left. Writes nothing | nothing |
| `list_rules` | Lists every rule with what it means, its default level and its pages | nothing |
| `explain_rule` | A rule's own page as Markdown: an example that is flagged, one that is not, how to fix it and how to silence it | nothing |
| `plan_ask` | What `ask_model` would send for the text or files: requests, model, tokens, questions held back | nothing |
| `ask_model` | Asks a decision model to check the questions in text or files, and returns the lint report with the model's findings added. `platform` names where: `typesafe` for Jev, `openai` for Luna, `openrouter`, `vercel`, `llmgateway` or `liquid`, each with its own key variable | the questions, with your key |
| `probe_question` | Sends one question as written and with its layout varied, and reports whether the answer held | about a dozen requests, with your key |

Every tool answers as structured content beside its text. The first six are
read-only and offline, so a host can let an agent call them without asking.
The two that send are marked open-world and not idempotent, each call costs,
and their descriptions tell an agent to call them only when you ask for a
check or a probe. `lint_paths` and `ask_model` read the files under the
paths they are given and nothing else. A `decisionlint.json` near those files
applies as it does on the command line, and `rules` on any call overrides it.

## The key

`ask_model` and `probe_question` look for `TYPESAFE_API_KEY`, or
`OPENAI_API_KEY` for Luna, in this order, and use the first they find:

1. The environment the client started the server with. Most clients take an
   `env` map beside `command` in their config.
2. `.env.local`, then `.env`, in the directory the client started the server
   in, which is the project for every client that runs servers per project.

A key is never taken as a tool argument, so none can land in an agent's
transcript or a host's log, and no answer ever carries one: the report says
where the key came from, not what it was. With no key anywhere the call fails
before anything is sent and says where it looked.

It is listed on the MCP registry as `io.github.nolindnaidoo/decisionlint`.

## License

MIT
