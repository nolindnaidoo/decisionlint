# decisionlint

Lints the questions you write for TypeSafe's Jev model and for OpenAI's
Decisions API (`gpt-6-luna`), before they are sent. Either model answers a
badly written question as confidently as a good one, so the mistake shows up
later as wrong answers. This finds it in the code.

The rules and their defaults were set by measuring what each defect costs
Jev. Luna keeps Jev's cutoffs: they were run on Luna and catch most defects
there, and a finding from Luna says its cutoff was set on Jev.

![The command line reporting three findings on a small request](https://raw.githubusercontent.com/nolindnaidoo/decisionlint/main/assets/demos/cli.gif)

This package is the command line and the library, with the MCP server behind
`--mcp`. An agent host installs the server on its own as
[`decisionlint-mcp`](https://www.npmjs.com/package/decisionlint-mcp). None of it
needs an API key or uses the network, unless you pass `--ask` to the command
line.

## Command line

```bash
npx decisionlint src/                 # a directory, searched for files it reads
npx decisionlint request.jev.json     # one file
npx decisionlint --format github .    # annotations on a pull request
```

It reads JSON, JavaScript, TypeScript, Python, Rust and Go, in TypeSafe's
request shape and in OpenAI's Decisions API shape. For any other language,
have your program write the request it sends to a `.jev.json` file and lint
that.

It exits 0 when the run passes, 1 when a finding fails it, and 2 when it
could not do what was asked. Errors always fail a run. Warnings fail it only
past `--max-warnings`.

| Option | What it does |
|---|---|
| `--format <stylish\|compact\|json\|github\|sarif\|junit>` | How findings are printed. `stylish` groups them by file and is the default. `compact` is one per line as `path:line:column`. `sarif` is for code scanning and `junit` for test reporters. Also `-f` |
| `--rule <CODE=level>` | Set one rule to `off`, `hint`, `info`, `warning` or `error`. A rule's name works in place of its code, and `warn` means `warning` |
| `--config <file>` | Use this settings file, and no `decisionlint.json` found near the files. Also `-c` |
| `--max-warnings <n>` | Fail when more than `n` warnings are reported |
| `--stdin-filename <path>` | Lint standard input as if it were that file |
| `--fix` | Write the fixes that only mend what the API would refuse |
| `--quiet` | Print errors only |
| `--ask` | Also ask the model about each question. Sends them to the platform the model id names: TypeSafe with `TYPESAFE_API_KEY` by default, OpenAI with `OPENAI_API_KEY` under `--ask-model gpt-6-luna`, OpenRouter, Vercel AI Gateway, LLM Gateway or Liquid AI under their spellings, or wherever `--ask-endpoint` says |
| `--ask-plan` | Say what `--ask` would send, and send nothing |
| `--ask-platform <id>` | Where `--ask` sends, named outright: `typesafe`, `openai`, `openrouter`, `vercel`, `llmgateway` or `liquid`, each with its own key variable and a default model in its own spelling. Without it a model id goes where its spelling says |
| `--ask-model <id>` | The model `--ask` asks: a Jev version, `gpt-6-luna` for OpenAI's Decisions API, or a model id in another platform's spelling. Default `jev-1.13.0` |
| `--ask-endpoint <url>` | The full URL `--ask` posts to, for a platform you host or a gateway spelling of the model that names no host. Also read from `DECISIONLINT_ASK_ENDPOINT`. A host the tool does not know is sent the key of the shape, or none |
| `--ask-shape <shape>` | The shape sent to `--ask-endpoint` where its path does not end in `/systemone` or `/decisions`: `typesafe` or `openai`. Also read from `DECISIONLINT_ASK_SHAPE` |
| `--ask-max-calls <n>` | The most requests `--ask` may send in the run. Default 25 |
| `--ask-send-state` | With `--ask`, also send state written out in a file |
| `--color`, `--no-color` | Colour the default format, or do not. Without either it is coloured in a terminal, unless `NO_COLOR` is set |
| `--no-error-on-unmatched-pattern` | Pass when the paths hold no file to lint |
| `--mcp` | Run as an MCP server |

### Asking a model

`--ask` runs the checks that ask a decision model, `DEC301` to `DEC312`, after
the linting. It is the only option that uses the network, and nothing in a
settings file can turn it on.

```bash
npx decisionlint --ask-plan src/                    # what it would send. No key, nothing sent
TYPESAFE_API_KEY=... npx decisionlint --ask src/    # send it
```

- `--ask-platform` names where it goes: `typesafe`, `openai`, `openrouter`,
  `vercel`, `llmgateway` or `liquid`, each with a default model in its own
  spelling and its own key variable, `TYPESAFE_API_KEY`, `OPENAI_API_KEY`,
  `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `LLM_GATEWAY_API_KEY` or
  `LIQUID_API_KEY`. Without it, `--ask-model` with a platform's spelling,
  `~typesafe/jev-latest` for OpenRouter, sends there, and a bare id goes to
  its vendor. The key is read from that variable and from nowhere else, and
  is never printed. Each finding from any model but `jev-1.13.0` says that
  its cutoff was set on Jev.
- `--ask-endpoint`, or `DECISIONLINT_ASK_ENDPOINT`, sends to a platform you
  host, with `--ask-shape` where the path does not say which shape it takes.
  A spelling that names no host is refused without it, with nothing sent.
- A question with a part built at runtime is never sent. The summary counts
  the ones held back.
- State is not sent unless you add `--ask-send-state`.
- `--ask-max-calls` is a limit for the whole run. A run that needs more exits
  2, so a job cannot pass after checking part of a project.
- A rejected key, a failed request or a run you stop also exits 2, and says
  how many requests were answered of how many were planned.
- These findings are warnings or less by default, so they fail a run only
  when `--rule` raises one or `--max-warnings` is passed.

## In the editor

Installed in a project's dev dependencies, this package is also what the
[DecisionLint extension](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.decisionlint)
lints with in VS Code, so the editor and CI report the same findings from the
same version. It needs 0.3.0 or newer and a trusted workspace.

## Settings

A `decisionlint.json` in your project sets rule levels, and the VS Code
extension reads the same file, so the editor and CI agree.

```json
{
  "rules": { "DEC004": "error", "DEC112": "off" },
  "ignore": ["DEC004:department"],
  "exclude": ["fixtures", "**/*.generated.ts"]
}
```

`exclude` lists files and folders not to lint, relative to the settings file.

The nearest one to each file is used, looking no higher than the directory
the command is run in.

## MCP server

For an AI agent that writes Jev or OpenAI Decisions questions. It can lint
what it wrote and fix it before you see it. The tool descriptions and the
server's instructions name both vendors, so an agent knows to call it for
either shape.

An agent host should install
[`decisionlint-mcp`](https://www.npmjs.com/package/decisionlint-mcp), which is
this server and nothing else, with no flag to forget. A project that already
has this package reaches the same server with the flag:

```json
{
  "mcpServers": {
    "decisionlint": { "command": "npx", "args": ["-y", "decisionlint", "--mcp"] }
  }
}
```

| Tool | What it does |
|---|---|
| `lint_text` | Lints a request body or source code passed as text. Each finding carries the edit that would mend it |
| `lint_paths` | Lints files or directories on disk |
| `fix_text` | Returns the text with the safe fixes applied, and the report of what is left. Writes nothing |
| `list_rules` | Lists every rule with what it means, its default level and its pages |
| `explain_rule` | A rule's own page as Markdown: an example that is flagged, one that is not, how to fix it and how to silence it |
| `plan_ask` | What `ask_model` would send, and sends nothing |
| `ask_model` | Asks Jev or Luna to check the questions in text or files, with your key, as `--ask` does |
| `probe_question` | Sends one question with its layout varied and reports whether the answer held, with your key |

Every tool answers as structured content beside the text. The first six send
nothing and need no key. The two that send read `TYPESAFE_API_KEY` or
`OPENAI_API_KEY` from the server's environment, or from `.env.local` or
`.env` in its working directory, never from an argument. The server is listed
on the MCP registry as `io.github.nolindnaidoo/decisionlint`.

## As a library

```js
const decisionlint = require('decisionlint');

const { findings } = decisionlint.lint(text, options, 'js');
const { text: mended, fixed } = decisionlint.fix(text, options, 'js');
```

`lint` and `fix` are pure: no filesystem, no network. `options` takes the
same `rules`, `fallbackOptions` and `ignore` as `decisionlint.json`. The third
argument is the syntax, one of `syntaxes`: `js` for JSON, JavaScript and
TypeScript, then `python`, `rust` and `go`. Any other value throws, naming
those four. `rules` lists every rule
with its name, default level and pages, and `api` is the number an editor
checks before loading a copy. Names here are only added to. A change that
removes or alters one raises `api`.

## What it does not do

Nothing here reaches the network unless asked to: `--ask` on the command
line, and `ask_model` and `probe_question` on the server, each with your
key. Linting, fixing and the rule pages are offline.
