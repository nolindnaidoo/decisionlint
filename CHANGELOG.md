# Changelog

## 1.0.1 — 2026-10-16

**OpenRouter's Jev is counted as calibrated.** A check asked of
`typesafe/jev-1.13` on OpenRouter no longer ends its findings with "The
cutoff was set on jev-1.13.0". Run over the whole calibration set, it
answered within 0.009 of TypeSafe on average. Luna and Liquid's `d1` were run
over the same set and keep Jev's cutoffs and the caveat, because those
cutoffs still catch most defects there and the set is too small to fit
cutoffs of their own.

**Jev asked in OpenAI's shape is no longer counted as calibrated.** Through
LLM Gateway or Vercel, Jev is sent the Decisions shape, and its answers moved
by 0.033 on average and flipped 8 of 1114 verdicts. A finding there now says
"The cutoff was set on jev-1.13.0 at TypeSafe, not through LLM Gateway."

**The listing leads with Jev and Luna.** The Marketplace and Open VSX name
is "DecisionLint: Jev/Luna Lint", and the description and the npm
description open with "Lint Jev and Luna decision-model questions", where a
search result's card has room for about forty characters. The keywords are
cut from 44 to 29 that someone would search for. The READMEs, the GitHub
Action, the pre-commit hook, both npm packages and the MCP registry entry
lead with the same words.

**The cutoffs are published, with how they hold up on every platform.**
[docs/cutoffs.md](docs/cutoffs.md) lists each model-backed check's cutoff,
how many known defects it caught and how many good questions it flagged on
Jev, Luna and d1, and how far each platform's answers sit from the same
model elsewhere. It is written from the saved runs. The README has a section
on where the checks have been tested, and every rule page links the table.

**The cost shown before a check no longer comes in low.** It was a third
under what Luna billed and an eighth under d1, because it counted the
request before it was put in the platform's shape and assumed Jev's
characters per token for every model. It now counts the body that is sent
and, for any model but Jev, the lowest ratio measured.
Every surface shows it as roughly, rounded up to two figures: "roughly
11,000 input tokens" where it said "about 10289".

## 1.0.0 — 2026-10-14

**JevLint-LE is DecisionLint.** It lints the questions sent to any
decision model, and nine platforms serve one, so the name says what it does
rather than which model came first, and it stands on its own rather than in
the LE family, so the name is the whole word. Everything that carried the
old name is renamed: the extension is `nolindnaidoo.decisionlint` with
`decisionlint.*` settings and command ids, the npm packages are
`decisionlint` and `decisionlint-mcp`, the MCP server is
`io.github.nolindnaidoo/decisionlint`, the repository is
`nolindnaidoo/decisionlint`, the settings file is `decisionlint.json`, the
directive is `decisionlint-disable` and the diagnostic source is
`decisionlint`. Two spellings a repository may already hold are kept for
ever: a `jevlint-le.json` is read where no `decisionlint.json` sits beside
it, and a `jevlint-le-disable` comment still silences. The rule codes are
`DEC`, `DEC004` where it was `JEV004`, with the same numbers, and the twelve
model-backed rules are `model-counting` and so on where they were
`jev-counting`: a rule is named for what it finds, not for the first model
that found it. The old codes and names are read for ever, in a comment, in
`rules`, in `ignore` and in `explain_rule`, and every finding is written
with the new code, so a SARIF baseline is renamed once. Each old rule page
stays and points at the new one.
The old extension and the old npm packages each get one final release that
points here. A new extension id has a new keychain, so a stored TypeSafe or
OpenAI key is set once more.

**The verb is ask, and there is one command per platform.** `--jev` and the
`jev.*` settings were named after one model and now reach nine platforms.
The editor has **Ask Jev About This File**, **Ask Luna About This File**,
**Ask via OpenRouter**, **Ask via Vercel AI Gateway**, **Ask via LLM
Gateway**, **Ask Liquid d1** and **Ask the Model at My Endpoint**, each
sending the model in `decisionlint.ask.models` for that platform with
that platform's own key: typed into `decisionlint.ask.keys`, stored by
its own **Set ... API Key** command, or read from the variable the platform
names. The command line has `--ask`, `--ask-plan`, `--ask-platform`,
`--ask-model`, `--ask-endpoint`, `--ask-shape`, `--ask-max-calls` and
`--ask-send-state`, and the server's tools are `ask_model` and `plan_ask`
with a `platform` argument. The JSON report's totals carry `ask` where they
carried `jev`. The probe asks Jev at TypeSafe.

| Was | Is |
|---|---|
| `jevlint-le`, `jevlint-le-mcp` on npm | `decisionlint`, `decisionlint-mcp` |
| `nolindnaidoo.jevlint-le` on the Marketplace and Open VSX | `nolindnaidoo.decisionlint`, called DecisionLint. The old listing gets one final release that points here |
| `io.github.nolindnaidoo/jevlint-le` on the MCP registry | `io.github.nolindnaidoo/decisionlint` |
| `jevlint-le.json` | `decisionlint.json`, the old name still read |
| `jevlint-le-disable` | `decisionlint-disable`, the old name still honoured |
| `JEV000` to `JEV312` | `DEC000` to `DEC312`, the same numbers, the old codes still read |
| `jev-counting` and the other eleven `jev-*` names | `model-counting` and so on, the old names still read |
| `jevlint-le.jev.model`, `.apiKey`, `.openaiApiKey` | `decisionlint.ask.models`, `decisionlint.ask.keys`, one entry per platform |
| `jevlint-le.jev.maxCalls`, `.sendState`, `.confirm` | `decisionlint.ask.maxCalls`, `.sendState`, `.confirm` |
| Check This File with Jev; Set TypeSafe API Key, Set OpenAI API Key | one Ask command and one Set API Key command per platform |
| `--jev`, `--jev-*` | `--ask`, `--ask-*`, plus `--ask-platform` |
| `check_with_jev`, `plan_jev` | `ask_model`, `plan_ask` |
| `totals.jev` in the JSON report | `totals.ask` |

Every platform that serves a decision model, not two. Microsoft, Liquid AI
and Cloudflare serve their own models in TypeSafe's shape; OpenRouter, Vercel
AI Gateway, LiteLLM and LLM Gateway forward to any of them in either shape;
llama.cpp, vLLM and Ollaya run open models on a machine of your own. The two
shapes were already read, so every one of them is linted by the same rules.
What differed between them, the limits, the spelling of a model id, the host
and the key, is now held in one table, `src/lint/targets.ts`, with the page
each fact was read from. The research behind it is in `docs/research/`.

- **The limits a request is held to are its platform's.** The platform is
  read from the model id where its spelling says, `~typesafe/jev-latest` is
  OpenRouter and `typesafe-ai/jev` is Vercel, from the one platform a URL in
  the file names, or from a new `target` setting, in `jevlint-le.json` or as
  `decisionlint.target`. Vercel's 255 choices and 10 levels, LiteLLM's 128
  questions per request, and none where a platform publishes none: a
  request bound for OpenAI gets no limit finding, as before. Nothing saying
  where a request goes, a TypeSafe-shaped question keeps TypeSafe's limits.
  A new `DEC014` reports a request with more questions than its platform
  takes in one call. Messages name the platform: "Vercel AI Gateway accepts
  at most 10".
- **A floating alias is caught in every spelling**, and pinned in the one
  the platform documents: `jev-latest` to `jev-1.13.0`,
  `~typesafe/jev-latest` to `typesafe/jev-1.13`. A spelling no page gives a
  pinned form for, `typesafe/jev-latest`, is reported with no fix. `DEC013`
  reads the version out of any spelling. A Hugging Face repo id, an Ollama
  tag or a deployment name is left alone.
- **A check goes to any platform, and the host is never guessed.** A model
  id is sent to the platform its spelling names, with the key in that
  platform's own variable: `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`,
  `LLM_GATEWAY_API_KEY`, `LIQUID_API_KEY`, beside the two there were. A
  spelling that names no host, such as `openai/gpt-6-luna-decisions`, which
  every gateway writes, is refused with nothing sent, where before it went
  to OpenAI and failed with the key spent. A platform you host is named
  with `decisionlint.jev.endpoint`, `--jev-endpoint` or
  `JEVLINT_LE_JEV_ENDPOINT`, and the shape with `decisionlint.jev.shape`,
  `--jev-shape` or `JEVLINT_LE_JEV_SHAPE` where the path does not say. The
  endpoint is read from the same places as the key and never from a
  repository file or a tool argument. A host the table does not know is
  sent the key of the shape's SDK, or no key when none is set, which is how
  a local llama.cpp is reached. Findings from any model but Jev or Luna name
  "the model", and every finding from a model but `jev-1.13.0` still says
  where the cutoff was set.
- **More of the SDKs are read.** The AI SDK's model factory,
  `typeSafeAi.decisionModel('jev-latest')`, is read for the id inside it.
  LangChain's `langchain_typesafe` is trusted like `typesafe_sdk`, and its
  `NoulCriteria(true=, false=)` is read as the criteria map it stands for.
  OpenAI's Go SDK is read through its `OfPredicate`, `OfChoice` and
  `OfScore` unions, with `Predicate` as the yes/no type. A module-qualified
  Python class, `ts.Noul(...)`, is read directly instead of as a literal
  inside an unreadable expression.
- **The JSON report and the MCP server's answers** say who was sent the
  requests and what answers, as `vendor` and `answerer` beside `model`.
- **Not measured.** The cutoffs of the checks were set on `jev-1.13.0` at
  TypeSafe, and the reading of OpenAI's Go SDK has not yet been run over
  public Go code. Neither JAY nor Open Jev is a platform: no model, vendor or
  API named JAY was found, and "Open Jev" is a name nine unrelated projects
  use for a reimplementation of `/v1/systemone`, each reached as an endpoint
  you set.

## 0.8.1 — 2026-10-14

A pass over every surface, the extension, the command line, the library and
the MCP server, read in full. Nineteen defects fixed, each with the test that
would have caught it. Nothing new to configure.

- **A key named `constructor` is no longer renamed to
  `function Object() { [native code] }`.** Every table the linter looks
  document text up in, Noul criteria keys, question types, bare identifiers,
  Python class names, Rust and Go field aliases, is a Map, so a name that
  `Object.prototype` happens to have reads as any other name. A question typed
  `valueOf` used to make its file unlintable; it is `JEV007` like any unknown
  type.
- **A file named `a.constructor` is refused as a type the tool does not
  read**, instead of being read, failing inside the linter and passing the
  run. The same name handed to the library as a syntax throws the sentence
  naming the four, not a TypeError.
- **Long instructions lint in one pass.** Three wording patterns were the
  square of an instruction's length: a 25 KB instruction took eight seconds
  on every keystroke and a 100 KB one two and a half minutes, with every other
  server request waiting behind it. Each pattern now reads the text once.
- **The command line exits 2 when every file failed in the reader**, instead
  of printing "0 findings in 0 files" and passing. A named pipe, socket or
  device under a `.json` name is refused by name and never opened; a pipe
  with nobody writing to it used to hold the process for ever.
- **A finding on the first line of a file with a byte order mark is on the
  right column**, on the command line, in `lint_paths` and in the editor's
  workspace run, and `--fix` keeps the mark.
- **A `--jev` run against OpenAI that falls short says Luna**, not Jev.
- **The MCP server keeps to the protocol.** An unknown tool, a call with no
  name, arguments that are not an object, a required argument left out or one
  of the wrong type are refused with `-32602` before any tool runs; a tool
  that ran and could not do what it was asked still answers `isError`. A
  frame without `jsonrpc: "2.0"` is refused with `-32600`. A method named
  `constructor` is unknown like any other. A request line is bounded at
  16 MiB and refused by its length past that, so one frame with no newline
  cannot grow until the process dies. Text handed to a tool is held to the
  same one-million-byte limit as a file. The interrupt is listened for once,
  not once per paid call.
- **The editor's paid commands read your settings once**, before the first
  wait. Switching `jev.model` while the confirmation was on screen could send
  the TypeSafe key to OpenAI, or the other way round. A second probe while
  one is running is refused instead of paying twice. A command whose body
  throws says so instead of doing nothing. A project copy whose
  `package.json` cannot be read is named in the status bar as `project copy
  unreadable` rather than passed over as none installed. The project-copy
  lookup remembers at most 512 folders, and the probe report page is disposed
  with the extension.
- **A rule entry in the editor settings that names no rule or no level stops
  linting and says why**, in the status bar and the Lint command, as the same
  entry in a `jevlint-le.json` always has. Before, the entry was dropped and
  the rule stayed on with no word. `jevlint-le.rules` also takes a rule by its
  name and `warn` for `warning`, as the file does.
- **A reply from TypeSafe that answers fewer questions than were asked is a
  failure, not a clean check.** TypeSafe's API reference returns one answer
  per question under the same ids, each with its type's value. A 200 whose
  body lacks a question's answer, or carries one without its `noul`, `choice`
  or `score`, is now reported as "did not answer with a Jev reply", naming the
  question, where before it read as a check with nothing to report.
- **The documents are held to the code.** The settings tables, the tool
  tables and counts, the README's example pins and every test file a document
  names are read by a test, and nine stale sentences were corrected.

## 0.8.0 — 2026-10-12

The linter says when it is behind the Jev you are using.

- **`JEV013 newer-model`**, new, informational. Fires when `model` is a
  versioned Jev id above the version the rules were measured on, which is
  `jev-1.13.0`. A wording rule is on because the defect cost that version
  answers, so on a later one a finding may cost nothing and a new weakness is
  not looked for. Nothing is fetched to find this out: it reads the id in
  your code. An alias such as `jev-latest` is not reported by this rule,
  since where it points cannot be known offline, and `JEV001` already asks
  you to pin it.
- **A check with another Jev version says so.** With `--jev-model`, or
  `jevlint-le.jev.model`, set to a Jev version other than `jev-1.13.0`, every
  finding from the check now ends "The cutoff was set on jev-1.13.0, not on"
  that version, as findings from Luna already did. Before, any Jev version
  was treated as the one the cutoffs were set on.

## 0.7.0 — 2026-10-10

The MCP server gets a package of its own, `jevlint-le-mcp`, as every sibling
has, and everything the editor and the command line can do.

- **`check_with_jev`, `plan_jev` and `probe_question`.** The server now
  has the editor's Check with Jev and Probe for an agent: `check_with_jev`
  asks Jev, or Luna with `model: gpt-6-luna`, about the questions in text or
  files and returns the lint report with the model's findings added;
  `plan_jev` says what that would send and sends nothing; `probe_question`
  varies one question's layout and reports whether the answer held. The two
  that send are marked open-world and not idempotent, and their descriptions
  tell an agent to call them only when asked, since each call spends your
  key. This reverses the decision to keep the server offline.
- **The key comes from the environment or the project's `.env`.** The server
  reads `TYPESAFE_API_KEY` or `OPENAI_API_KEY` from the environment the
  client started it with, then from `.env.local`, then `.env` in the
  directory it started in. Never from a tool argument, so no key lands in an
  agent's transcript, and no answer carries one.
- **`npx -y jevlint-le-mcp` is the server, with no flag.** A client that
  installs by package name, and an index that reads one, gets the server
  and not a linter that exits. It is the same server as `jevlint-le --mcp`,
  built from the same source at the same version, and `jevlint-le` keeps
  `--mcp` for a project that already pins it and for the copy inside the
  VSIX.
- **The registry listing points at `jevlint-le-mcp`** from this version,
  so `io.github.nolindnaidoo/jevlint-le` has the family's shape: a package
  that is the server, and nothing to pass. `mcpName` moves to that package
  and off `jevlint-le`, since the registry verifies ownership from the
  package its listing names.
- The Release workflow publishes both packages, refuses either version that
  exists, and lists the server after npm serves `jevlint-le-mcp`. CI holds
  the four versions and the registry identity together.
- The GitHub Action and the pre-commit hook pin 0.7.0.

## 0.6.0 — 2026-10-10

The MCP server gives an agent something to act on, and the release publishes
it to the MCP registry.

- **Every finding carries its fix.** `--format json` and the MCP report give
  the edit the linter would make, with `safe` saying whether `--fix` applies
  it unasked. Before this the report counted the fixable findings and kept
  the edits to itself. The field is new and nothing else in the report moved.
- **`fix_text`.** The MCP server returns the text with the safe fixes
  applied, how many it mended, and the report of what is left for the author.
  It writes nothing.
- **`explain_rule`.** A rule's own page, as `docs/rules/` has it, with the
  flagged and the clean example and the message the linter gives. The pages
  render from inside the bundle, so an agent with no network reads the same
  page a person does.
- **Typed, read-only tools.** Each tool declares the shape of its answer and
  returns it as structured content beside the text, carries a title, and is
  marked read-only, so a host can let an agent call it without asking.
  `list_rules` says what each rule means.
- **The MCP registry.** `server.json` lists the server as
  `io.github.nolindnaidoo/jevlint-le`, pointing at the npm package with
  `--mcp`. CI holds its version and identity to the manifests, and the
  Release workflow publishes it after npm, as the family does.
- The README's "What it means" column is held to the rule registry, which
  now carries each rule's meaning. The rule pages did not change.
- The GitHub Action and the pre-commit hook pin 0.6.0.

## 0.5.2 — 2026-10-09

- **The listing says Luna.** The Marketplace and npm descriptions and
  keywords name OpenAI's Decisions API and `gpt-6-luna`, and the README has
  a section that says exactly what is read, checked, held back and not yet
  measured on Luna.
- The GitHub Action and the pre-commit hook pin 0.5.2.

## 0.5.1 — 2026-10-09

- **The MCP server tells an agent it reads both vendors.** Its tool
  descriptions and its `instructions` name Jev, OpenAI's Decisions API and
  the AI SDK's `decide()`, so an agent writing a Decisions request knows to
  lint it. The tools themselves already read every shape.
- The GitHub Action and the pre-commit hook pin 0.5.1.

## 0.5.0 — 2026-10-08

OpenAI's Decisions API, `gpt-6-luna`, is read and checked the way Jev is.

- **A Decisions request is linted.** The `predicate`, `choices` and
  `levels` shape, in a request body, in `client.decisions.create(...)` in
  TypeScript and Python, and in the Vercel AI SDK's `decide()` for either
  vendor. Every rule with evidence behind it fires on a Luna question as on
  a Jev one, with Luna named in the message. Before this a Decisions request
  was read as a foreign shape and reported clean.
- **Held back on a Luna question**: the two TypeSafe limit rules, since
  OpenAI publishes none, and the model-alias rule, since there is no alias.
- **Shape mistakes in OpenAI's own words.** `choices` written as a map or as
  bare names, a Choice with no `choices`, a Score with no `levels`, and a
  mistyped `predicate`, which is fixed on the lightbulb. The fallback option
  is added as a `{ value, description }` entry.
- **Check with Luna.** `--jev-model gpt-6-luna` on the command line, or
  `jevlint-le.jev.model` in the editor, sends the same checks to OpenAI's
  Decisions API with the key in `OPENAI_API_KEY`, in the keychain through
  **Set OpenAI API Key**, or in `jevlint-le.jev.openaiApiKey`. The cutoffs
  were set on `jev-1.13.0`, and every finding from Luna says so. The probe
  asks Jev only. **Clear API Keys** now clears both.
- **A Score with one degree word beside one described level was flagged as
  a ladder.** `["Low", "Nobody can log in"]` no longer is.
- The GitHub Action and the pre-commit hook pin 0.5.0.

## 0.4.0 — 2026-10-08

Fewer rules, every one measured. A third sample of public Jev questions,
labelled before any rule ran, showed that nearly every real defect is an
option described as its own name or instructions of a word or two, and that
the wording rules were right or wrong in the same places as on the two
samples before. The rules now follow that.

- **`JEV011 description-repeats-name`**, new, informational. An option whose
  description is its name again (`"a": "A"`, `"billing": "Billing"`), or a
  Noul whose criteria say yes and no. Jev matches the state against the
  description, and these add nothing to the name. Measured: where the name
  already says something, no cost; the cost is in names that say nothing,
  which is what every public case was.
- **`JEV012 terse-instructions`**, new, informational. Instructions of one or
  two words (`Rate`, `Which?`, `Pick one.`) that lean on the question id,
  which Jev never sees. Measured: "Refund?" was right 9 of 12 times at 0.70
  sure, against 10 of 12 at 0.85 for the question written out. A two-word
  question that opens with how, who, what, which, where, when or why is left
  alone.
- **`JEV110 degree-levels` is on**, as a warning. Measured: Shallow, Medium,
  Deep placed 4 of 12 code reviews right, against 12 of 12 for levels that
  describe what each looks like. It was also the most common real defect in
  two samples and right every time it fired. It now catches levels that are
  a bare word or two (`Shallow`, `Like new`, `Almost none`) and levels with a
  gloss after a slash (`Very casual / slang`).
- **The checks that ask Jev were scored on real questions for the first
  time**: 252 public questions through `JEV301` to `JEV308`. 27 findings,
  every one read, none wrong. No cutoff moved. The probabilities are in
  `fixtures/public-sample-3/reviews.json`.
- **`JEV004 no-fallback-option` says what a missing fallback costs**, which
  is the largest cost measured anywhere: in our run Jev answered every input
  that fit no option wrong, and an independent audit found 95% abstention
  with an "unknown" option against 0% accuracy without one. It stays `info`,
  because text cannot tell an exhaustive set of options from one that is
  not, and it fires on most Choices in public code. More names count as a
  fallback: `uncertain`, `unsure`, `ambiguous`, `undetermined`,
  `insufficient_evidence`, `cannot_tell`, and "other" in five more
  languages, and a name counts when it is a word in the option's name, so
  `none_implied` and `other_or_unclear` count.
- **`criteria: { "options": [...] }` is reported as the mistake it is.** The
  API accepts that as a one-option Choice that answers `options` every time
  at full confidence. `JEV006` now says so, as an error, with a fix on the
  lightbulb that is never applied unasked, since the API does not refuse it.
- **`JEV102 arithmetic` reads comparisons with no counting word**: `x > 50`,
  "greater than the number", "40 minutes or longer", "under five seconds".
  It caught 1 of 3 on the sample before and 3 of 3 after.
- **`JEV112 undefined-boundary` fires only where the vague word decides the
  answer**: after a form of "be", or closing the question. Every wrong
  finding it had on public code was an adjective on a noun, "heavy luggage"
  or "an expensive model". It now has none.
- **`JEV106 multi-hop` and `JEV109 multi-dimension-level` are removed.**
  Wrong on every firing across three samples. A settings file or `--rule`
  that names either is refused, as for any rule that does not exist.
- **A second gate on defaults.** A wording rule stays on only while it is
  right on at least 9 of 10 of its findings on a public sample it was not
  tuned against. The samples and their labels are in `fixtures/`.
- The GitHub Action and the pre-commit hook pin 0.4.0.

## 0.3.0 — 2026-10-08

- **The editor lints with the copy a project installs.** Add `jevlint-le` to
  a project's dev dependencies and the extension uses that copy, for findings
  and for fix on save, so the editor and the project's command line report
  the same things and the version changes only when `package.json` does. The
  status bar says which copy is in use.
- **With none installed, nothing changes.** The extension lints with the copy
  it carries, with no setup, as before.
- **It falls back to its own copy and says why** when the project's copy
  cannot be used: the workspace is not trusted, the copy is older than 0.3.0,
  it does not load, or it does not read that kind of file. The status bar
  names the project's version, since findings can then differ from CI.
- **Lint Workspace reads files from disk** and opens none of them. A run over
  a large project used to leave every file it read held in the editor's
  memory. A file you have open is still linted as it is in the editor,
  unsaved edits included.
- **`--format sarif`** for GitHub code scanning and security dashboards, and
  **`--format junit`** for test reporters. In JUnit only an error is a failed
  case, since only an error fails a run.
- **A GitHub Action**, `nolindnaidoo/jevlint-le`, that annotates a pull
  request, and **a pre-commit hook**. Both run the published command line at
  the version they were released with.
- **Every rule has its own page**, in `docs/rules/`: what it catches, an
  example that is flagged with the message the linter gives, one that is not,
  how to fix it and how to silence it. A finding in the editor links to its
  page, which links on to the TypeSafe page the rule comes from. JSON output
  and the MCP server's `list_rules` gain a `page` beside `docs`.
- **A request whose only question had its type misspelt was not reported.**
  `"type": "nuol"` was caught beside a valid question and missed on its own,
  and a file holding only that was never read. Both are fixed, and the same
  goes for a lone question with criteria and no type.
- The npm package can be required as a library: `lint`, `fix`, `rules`,
  `syntaxes` and an `api` number. This is what the editor loads. A syntax it
  does not have is refused with a message naming the four it does.
- Check with Jev and the probe always run the extension's own code. They
  spend your key, and are not handed to code from a workspace.

## 0.2.0 — 2026-10-05

### Check with Jev from the command line

- `--jev` runs the checks that ask Jev itself, `JEV301` to `JEV312`, the same
  ones the editor's **Check with Jev** command runs. It sends the same
  requests the editor sends for the same file.
- The key is read from `TYPESAFE_API_KEY`. Nothing in a settings file can
  turn `--jev` on.
- `--jev-plan` says what would be sent and sends nothing.
- `--jev-model`, `--jev-max-calls` and `--jev-send-state`. The call limit is
  for the whole run, and a run that needs more exits 2.
- A rejected key, a failed request or a stopped run exits 2 and says how many
  requests were answered of how many were planned.

### Fixing

- `--fix` writes the fixes that only mend what the API would refuse: a
  renamed criteria key, a mistyped question type, criteria in the wrong
  shape. The summary of any run says how many findings it would mend.
- The editor offers the same as `source.fixAll.jevlint-le`, so fix on save
  works.
- Adding a fallback option and pinning a model are never written unasked.
  They change what a working request does, and stay on the lightbulb.

### New rule and settings

- `JEV010 unused-disable` reports a `jevlint-le-disable` comment that
  silences nothing. On by default as a warning.
- `exclude` in `jevlint-le.json` lists files and folders not to lint. The
  command line, the MCP server and the editor leave out the same files.
- A rule can be named by its name as well as its code, and `warn` is taken as
  `warning`, in `--rule` and in `jevlint-le.json`.

### Command line

- `-h`, `-v`, `-f` and `-c` work. `-h` used to answer "No such file or
  directory: -h".
- `--no-error-on-unmatched-pattern` passes a run that finds no file to lint,
  for lint-staged and for packages with no Jev code. Without it that run
  still exits 2.
- `--color` and `--no-color`. `NO_COLOR` is respected.

### Changed

- **The terminal output is grouped by file**, with the rule named and the
  message wrapped under it, in colour when a terminal is reading. The
  one-line `path:line:column` form is now `--format compact`. **`--format
  text` is removed**, so a script that passes it needs `compact`.
- JSON output gains `totals.fixable`, `totals.excluded` and `totals.unread`
  on every run, `totals.fixed` under `--fix`, and `totals.jev` under `--jev`
  or `--jev-plan`.
- The README lists every command with its id, for binding to keys.

### Fixed

- **A reply from TypeSafe that was not a Jev reply crashed the run.** A proxy
  or sign-in page answering 200 threw out of the client. The command line
  lost its report, and the editor's command failed after the requests were
  paid for. It is now reported as its own failure.
- **A server error was blamed on the request and never retried.** A 5xx or a
  408 now retries like a busy service, and is reported as TypeSafe's fault.
  `Retry-After` is honoured, up to 30 seconds.
- **A request with no answer waited forever**, which held a CI job until the
  job was killed. It is given up on after 30 seconds.
- **Cancelling during the wait before a retry** took up to four seconds to be
  noticed. It is now immediate.
- **The MCP server ended on one bad input.** A line holding `null`, or a tool
  that threw on a folder it could not list, took the server down and the
  agent lost its tools. Both are now answered as failures.
- **One unreadable folder ended a command line run**, and so did a linked
  folder that led back to its parent. Unreadable folders and files are now
  named in the summary and the rest is linted. Linked folders are not
  followed. A run in which nothing could be read still exits 2. JSON output
  gains `totals.unread`.
- **Jev's findings could be shown on text they were not about.** An edit
  during a check cleared the old findings, then the check wrote its own back
  with positions from the text it had read. An edit or a close now stops the
  check and drops its findings, with a message. A second check of a file is
  refused while one is running.
- **A second Lint Workspace wiped the first one's findings.** It is refused
  while one is going. The run now shows progress and can be stopped.
- **A reader that failed in the editor left stale findings on screen** with no
  message. The findings are cleared and the status bar says why. On the
  command line the file is named and the other files are still linted.
- **A settings file that vanished between being found and being read** threw.
  It is reported like any other that cannot be used.
- **The size limit was counted in characters in the editor and bytes on the
  command line**, so a file of mostly non-ASCII text could be linted in one
  and skipped in the other. Both count bytes.
- **Standard input had no size limit**, so piped text was the way around the
  one files are held to.
- **What Jev said stayed on screen after a rule was switched off.** It is now
  cleared when the settings change.
- **A file with thousands of findings was slow**, because duplicates were
  removed by comparing every finding with every other.
- **The probe kept every report it had made** for the life of the window. It
  keeps the latest 20.
- **Piping a large report into a command that closes early**, such as `head`,
  crashed with a stack trace and status 1.

## 0.1.0 — 2026-10-04

First release.

- Ten rules, `JEV000` to `JEV009`, over Jev questions read from JSON, JSONC,
  JavaScript and TypeScript, from `@typesafe-ai/sdk` helper calls, and from
  `oxlint-plugin-jev` configs.
- Diagnostics as you type, a status bar count that includes questions the
  reader could not see whole, and a quick fix that adds a fallback option to a
  Choice.
- Commands to lint the active file and the workspace.
- Suppression by comment directive and by setting.
- A JSON schema for `*.jev.json` request bodies and snippets for the three
  question types.
- Findings from a workspace run stay when the editor closes the files it read.
- Commands return without waiting for their notification to be dismissed.
- Eleven wording rules, `JEV101` to `JEV111`, for double negatives, arithmetic,
  date comparison, compound questions, generation, multi-hop questions,
  negated and inverted Nouls, and weak Score levels. Eight are on by default.
  Each default follows from a score against a labeled corpus.
- Helper calls are read only for names imported from `@typesafe-ai/sdk`.
- The Vercel AI SDK's `boolean` question type is read as a Noul.
- Missing instructions are no longer reported, and a question built with a
  spread or with another client's field names is not told a field is missing.
- A twelfth wording rule, `JEV112`, for questions that turn on a word with no
  stated line, such as large, often or enough.
- The double-negative, arithmetic, date, compound, generation, negated-Noul
  and degree-level rules were rewritten after three runs over public code.
- Wording rules skip non-English text, template slots and guidance sentences.
- A missing `criteria` is reported only inside a request. A one-option Choice
  and a one-level Score are informational.
- The date, degree-level, arithmetic and undefined-boundary rules catch five
  defects found by hand in a random sample of 300 real questions.
- Wording defaults now follow measurements against `jev-1.13.0`. Double
  negatives are informational. Date comparison, negated Nouls, inverted
  criteria and degree-word levels are off: Jev answered them correctly.
- **Check This File with Jev**: an opt-in command that asks Jev itself about
  each question, for overlapping options, overlapping levels, counting and
  undefined boundaries. It uses your own API key, stored in the system
  keychain. Linting still makes no network request.
- Quick fixes for a pinned model, `yes`/`no` criteria, a mistyped type, and
  Score or Choice criteria in the wrong shape.
- The overlap checks point at the options or levels Jev thinks are at fault.
- Date comparison is back on as informational: Jev lost an answer and a
  quarter of its certainty on a window counted in days.
- Eight more checks in **Check This File with Jev**: mismatched option names,
  off-topic criteria, a Choice that is a scale, a Score that is a set of
  categories, a question that depends on another, two questions that ask the
  same thing, and, with `jev.sendState` on, a state that lacks the answer or
  carries orders.
- **Check This File with Jev** shows the request count, a token and cost
  estimate and what it will send, and waits for a yes.
- **Probe the Jev Question at the Cursor**: sends one question against its
  state with the layout changed, and reports whether the answer moved.
- Python: dicts, the `typesafe_sdk` question classes, wrapper libraries that
  re-export them, and `system_one(...)` requests. Every rule, quick fix and
  Jev check works on them.
- A command-line version of the linter, with text, JSON and GitHub annotation
  output, for CI and other editors. On npm as `jevlint-le`.
- Rust and Go: the JSON inside `json!`, Go maps, structs and enum variants
  named for a question type, and Rust constructors.
- A request pasted as JSON into a string is read in every language.
- A name bound to a literal in the same file is followed to it, so a prompt
  or a set of options kept in a constant is linted where it is written.
- Templates, format calls and joined strings are linted for their fixed
  text.
- A function that builds a question from its parameters is read at each call,
  so questions passed to a local helper are linted where they are written.
- An MCP server, so an AI agent can lint the Jev questions it writes. It is
  the same program as the command line, run with `--mcp`.
- Right-click entries in the editor for linting, checking with Jev and
  probing the question at the cursor.
- Agents running in VS Code get the MCP server with no setup.
- A cancelled Jev check or probe now says it was cancelled, a probe result is
  no longer lost when its report cannot be opened, and a locked keychain is
  reported and falls back to the environment key.
- A `jevlint-le.json` in the project sets the rules for the editor, the
  command line and the MCP server alike.
- Quick fixes to disable a rule for a line or a file.
- The message shown in an untrusted workspace now says how to trust it.

- The message for a missing key has a button that sets one, and the one for
  an untrusted workspace has a button that opens workspace trust.

- The check for a question that depends on another one is stricter, after it
  misfired on its first real use.

- The confirmation before a paid command is one question and one line.
- The API key can be typed into user settings as well as stored in the
  keychain.
- The confirmation before a paid command is off by default and can be turned
  on in settings.
- A setting for how much is said in notifications: everything, only what
  matters, or only why a command could not run.

- The probe report opens as a rendered page, and closing it no longer asks to
  save.
