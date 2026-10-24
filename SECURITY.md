# Security

DecisionLint lints without a network and without a key. One kind of command,
run by the user with their own key, sends questions to a decision-model
platform. This page says what the tool does with that key and that
connection, and how to report a problem. The rules behind each line are
under Invariants in [AGENTS.md](AGENTS.md), and the tests named there hold
them.

## Supported versions

The latest release on each surface: the VS Code extension, the `decisionlint`
and `decisionlint-mcp` npm packages, the GitHub Action and the pre-commit
hook. A fix ships as a new version on every surface the project publishes
to. Earlier versions are not patched.

## What reaches the network, and when

- **Linting never uses the network.** The extension, the command line and
  the MCP server lint with no key and send nothing. No telemetry is collected.
- **Five callers may reach a platform, and only when the user runs them:**
  the Ask commands and the probe in the editor, `--ask` on the command line,
  and the `ask_model` and `probe_question` tools of the MCP server. Tests
  hold `fetch` uncalled everywhere else, including the other six MCP tools.
- **What is sent is the questions.** The request's `state` is sent only
  when the user turns `decisionlint.ask.sendState` or `--ask-send-state`
  on, and only a state written out in the file. A question with any part
  built at runtime is never sent.
- **The host is never guessed.** A model id is sent to the platform its
  spelling names in `src/lint/targets.ts`, with the key in that platform's
  own variable. A spelling that names no host is refused with nothing sent.
  Any other host comes from the user's own settings, flags or environment,
  never from a `decisionlint.json` or a project's `.env`, so a repository
  cannot point the user's key at a host of its choosing.
- **Every request has a time limit**, and only a busy or failing server is
  retried.

## What happens to a key

- **In the editor** a key lives in the operating system keychain through
  the Set API Key commands, or in `decisionlint.ask.keys`, which has
  application scope and is left out of Settings Sync, so it can never be a
  workspace setting committed to a repository.
- **On the command line** a key is read from the platform's own environment
  variable and from nowhere else. No flag takes one, so it cannot reach
  shell history or a CI log.
- **In the MCP server** a key comes from the environment the client started
  it with, or from `.env.local` or `.env` in its directory, never from a tool
  argument, so none lands in an agent's transcript. Every answer says where
  the key came from and never what it was.
- **No message, finding or error contains a key.** The client reports a
  failure's status code and not the response body, which can echo the
  request.
- **Untrusted workspaces cannot send.** The Ask commands are disabled
  there, and a project's own copy of the linter is not loaded, because
  loading it runs code from the workspace.

## Reporting a vulnerability

Report privately through GitHub:
[Report a vulnerability](https://github.com/nolindnaidoo/decisionlint/security/advisories/new).
Private vulnerability reporting is turned on for this repository. Do not open
a public issue for a security problem.

Say which surface and version, what you did, what happened, and what you
expected. A file that shows it is worth more than a description of one.
Remove any key from anything you paste. The maintainer reads reports and
answers through the advisory, and a fix is released as a new version on
every surface, with the advisory published alongside.

In scope: the extension, the two npm packages, the GitHub Action, the
pre-commit hook and the three bridges under `shim/`. Out of scope: the
platforms' own APIs and the answers their models give.
