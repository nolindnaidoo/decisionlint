# DecisionLint — specification

**Status: released. The current version and its date are the top heading of
[CHANGELOG.md](CHANGELOG.md); the first release, 0.1.0, shipped on
2026-10-04.** The exact rules, the wording rules, the readers, the model-backed
checks, the command line, the MCP server and the VS Code shell exist, with
their tests, and pass. Nothing under an "Extended release" heading is built:
each item there is intent that waits on a request, or is decided against and
says so.

A VS Code extension by the author of the LE family, standalone since 1.0.0, category **Check**, that finds the
questions a project sends to TypeSafe's Jev
model and reports the ones written in a way that is documented to produce bad
answers. Linting never calls Jev.

## The one question

**Which Jev questions in this workspace are written in a way known to fail?**

Answered from the text of the question alone, as the user types, with no API
key, no network request and no cost.

## Why this exists

Jev takes a `state` and a map of typed questions (`noul`, `choice`, `score`)
and returns typed answers with probabilities. The output type is guaranteed.
The answer is not. Jev does not report that a question is badly formed. It
returns a confident-looking number either way, and the failure shows up later
as wrong decisions.

## Position

Other tools point Jev at code: they use it to lint, review or triage. This
one checks the questions people write for Jev. What it adds over checking a
request file from the command line is that findings appear in the editor as
you type, read straight out of source code, with no key and no calls.

Checks that need the meaning of a question and not its shape, such as two
options that overlap, cannot be done from text patterns. Those are available
on demand through the **Ask Jev About This File** command.

## Scope

**In scope.** Static checks over question definitions and the `model` field
around them.

**Out of scope, permanently.**

- Whether a well-formed question is accurate on the user's data. That needs
  labeled data and API calls, and it is a different product.
- Rewriting a question's wording. The extension names the problem. The user
  writes the fix, except where the fix is mechanical.

## Constraints

- Linting makes no network request and needs no API key. This is an LE family
  extension and that is the family's promise. The one exception is the
  **Ask Jev About This File** command, which the user runs on purpose with
  their own key. See "Ask a model".
- No filesystem writes outside edits the user accepts through a quick fix,
  fix on save, or `--fix` on the command line.
- Refuse rather than guess. A question the reader cannot see whole is reported
  as unreadable and counted, never skipped silently.
- Code follows the LE family standard in `AGENTS.md`.

## Where questions are found

Four readers produce one tree. The first tokenizes JavaScript, TypeScript,
JSON and JSONC and reads object literals, keeping duplicate keys, which
`JSON.parse` would collapse. The second does the same for Python dicts and
SDK calls. Rust and Go share a third, which reads a literal written as a type
and a brace and takes the differences between the two as a dialect. A fourth
reads JSON pasted into a string, in any of them. Every rule, fix and Jev
check runs on the tree and does not know which reader made it.

| | Source | How it is recognized |
|---|---|---|
| **S1** | JSON and JSONC request bodies | An object with a `questions` map where at least one entry has `type` in `noul`, `choice`, `score` and an `instructions` or `criteria` field |
| **S2** | `oxlint-plugin-jev` config | A `jev/ask` rule whose options hold a `rules` array. Each entry with a `question` is a Noul question, identified by its `id` |
| **S3** | JavaScript and TypeScript object literals | The same shape as S1, anywhere in the file, including inside call arguments and callbacks. A question object outside a map is recognized on its own |
| **S5** | Python dict literals | The same shape as S1. `True`, `False` and `None` are read, adjacent and bracketed strings are joined, and an f-string with a slot is unreadable. A dict assigned to a name ending in `questions` is read as a question map |
| **S6** | Python SDK classes | `Noul(...)`, `Choice(...)`, `Score(...)` under a name imported from `typesafe_sdk`, `typesafe_ai` or LangChain's `langchain_typesafe`, including `import ... as`. LangChain's `NoulCriteria(true=..., false=...)` is read as the criteria map it stands for. Under any other import, only a call whose arguments are exactly the keywords `instructions` and `criteria` |
| **S7** | Python `system_one(...)` | The first two positional arguments are `state` and `questions`. Keywords are read by name |
| **S8** | Rust | The JSON inside `json!`. A struct or enum variant whose name holds one question type and which has an `instructions` or `criteria` field with a value that could be read. A `::noul(...)`, `::choice(...)` or `::score(...)` call whose first argument is a string, read for its wording only. `Some(x)`, `String::from(x)`, `.to_string()`, `.into()` and `vec![...]` are seen through, and a list of pairs or `BTreeMap::from([...])` is read as a map |
| **S9** | Go | A map with string keys. A struct with a `Type` or `Kind` field, given as a string or as a constant named for the type. A struct named for a question type, `Predicate` included. Field names are read lowercased. `[]string{...}` is a list. OpenAI's Go SDK, `openai.DecisionNewParams{Questions: []...{{OfPredicate: &...{Name, Instructions}}}}`, is read through its one-member unions, with `Choices` of `{Value, Description}` and `Levels` of `{Label, Description}` as the API's own fields |
| **S10** | JSON inside a string | A string that opens with `{` and names `questions`, `instructions` or `criteria`, in any language above. Only a string with no escapes is read, so every position maps back to the file |
| **S4** | SDK helper calls | `noul(...)`, `choice(...)`, `score(...)`, read only for the names the file imports from `@typesafe-ai/sdk`. Method calls, declarations and aliased imports are not read |

A `model` property whose value is a literal alias is found anywhere in the
file, which covers both request bodies and `new TypeSafeClient({ model })`.
So is one named through the AI SDK's factory,
`model: typeSafeAi.decisionModel('jev-latest')` or
`gateway.decisionModel('typesafe-ai/jev')`: the id inside the call is the
model, and its spelling can name the platform. Which provider made the
factory is not read, so a question sent through `anthropic.decisionModel(...)`
to a language model is linted as any other.

### What cannot be read

A value is unreadable when it is not a literal in the file: a variable, a
function call, a template string with a substitution, a shorthand property. An
object or array with a spread, a computed key or a method is partial. Rules
that need an unreadable or partial value do not run. The question gets one
`DEC000` hint, and the unread count is shown beside the findings count. The
count is taken before suppression, so switching `DEC000` off hides the hints
and leaves the count.

## Initial release

Exact checks. Each is true or false from the text, so none can be wrong about
what the text says. `DEC004` is the exception in spirit and is explained below.

### Rules

| Code | Name | Default | Fires when |
|---|---|---|---|
| DEC000 | unreadable | hint | A field a rule needs is built at runtime |
| DEC001 | unpinned-model | warning | `model` is a floating Jev alias in any platform's spelling: `jev-latest`, `jev-preview`, `~typesafe/jev-latest` |
| DEC002 | choice-option-limit | error | A Choice has more than 255 options |
| DEC003 | score-level-limit | error | A Score has more than 10 levels |
| DEC004 | no-fallback-option | info | A Choice has two or more options and none has a fallback word in its name |
| DEC005 | duplicate | error | A question id, a Choice option or a Score level is repeated |
| DEC006 | criteria-shape | error | In a request, a Choice has no map of options or a Score has no array of levels, or a Noul has criteria keys other than `true` and `false` |
| DEC007 | invalid-question | error | The `type` is missing or unknown, or the instructions are an empty string |
| DEC008 | numeric-levels | warning | Every level of a Score is a bare number |
| DEC009 | too-few-options | info | A Choice has fewer than two options, or a Score fewer than two levels |
| DEC010 | unused-disable | warning | A `decisionlint-disable` comment silenced no finding. Not reported for a comment that names only Jev-backed rules, which linting never runs |
| DEC011 | description-repeats-name | info | A Choice option's description is its name again, allowing for case, underscores and a full stop, or a Noul's `true` or `false` criterion is yes, no, true, false, y or n |
| DEC012 | terse-instructions | info | The instructions are one or two words of English, in a question that does not carry another dialect's fields |
| DEC013 | newer-model | info | `model` is a versioned Jev id in any platform's spelling, numbers and nothing after them, above the version the rules were measured on |
| DEC014 | question-limit | error | A `questions` map or list has more entries than its target takes in one request. Only a target in `lint/targets.ts` that publishes the number is checked |

**DEC001's fix is never applied for you.** It offers to pin to `KNOWN_VERSION`,
the version `jev-latest` pointed to when the repo last checked, and is marked
unsafe, so `--fix`, fix on save and `fix_text` leave it alone: which version
to pin is a choice, and a hard-coded id is wrong after the next release. The
message says to copy the `model` value from a response.

**DEC004 is `info`, not `warning`.** TypeSafe's advice is to add `other` or
`none of the above` "when the list might not cover every input", and the text
of a question cannot show whether it does. Measured on 2026-10-04, the rule
fires on 9 of the 11 Choice examples in TypeSafe's own docs. The default
fallback names are `other`, `none`, `none of the above`, `unknown`, `unclear`,
`neither`, `not stated`, `not applicable` and `n/a`, matched case-insensitively
with `_` and `-` read as spaces. The list is a setting.

**Missing instructions are not reported.** The API reference marks
`instructions` required, but the SDK types make it optional and send null, and
public code omits it on Choices whose options carry the meaning.

### What the public questions changed

The exact rules were wrong far more often than their name suggests. On the
first public set 40 of 46 shape and invalid-question findings were false, and
the second set found 23 more. Each cause is fixed and pinned by a test:

- **Local functions named like SDK helpers.** A file's own `noul(...)` wrapper,
  a class method `choice(name)`, an interface signature `score(key): Answer`.
  Helper calls are read only for names the file imports from
  `@typesafe-ai/sdk`, and never for a method call or a declaration.
- **Other clients' field names.** `prompt`, `options`, `legend`, `rubric`,
  `descriptions`. A question carrying one gets no shape finding at all.
- **The Vercel AI SDK's `boolean` type**, which is its name for a Noul.
- **Builders, templates and mocks.** `const q = { type: 'choice', instructions }`
  followed by `q.options = ...`. A missing field is reported only for an entry
  in a `questions` map or an SDK helper call, never for a lone object.
- **Template slots.** `"criteria": "$options"` is a value that arrives later.
- **One option and one level.** Public code sends both where the lists are
  generated, and a public parity suite expects the API to accept them. `DEC009`
  reports both as `info`, and `DEC003` is now only the upper limit.

On the third set, with these in place, the shape rule fired six times in
2,463 questions and all six were real: Nouls with `yes` and `no` criteria, and
Scores sent with no levels.

### Features

- **Diagnostics** inline and in the Problems panel for open JSON, JSONC,
  JavaScript, TypeScript, Python, Rust and Go documents, recomputed 250 ms after an edit. Each
  links to the vendor page behind the rule.
- **Quick fixes**, each offered only where the edit is mechanical and loses
  nothing:
  - `DEC004`: insert a fallback option, matching the quote style, indentation
    and trailing-comma style already there.
  - `DEC001`: pin an alias to the newest version this extension was checked
    against. The title carries the date, because that stops being the newest.
  - `DEC006`: rename `yes` and `no` criteria to `true` and `false`. Turn a
    Score map into an array, keeping every description. Turn a Choice array of
    names into a map.
  - `DEC007`: correct a mistyped type when exactly one real type is within two
    edits.
- **Project settings file.** `decisionlint.json`, read by the editor, the
  command line and the MCP server. The nearest one to a file applies, looking
  upward as far as the workspace folder in the editor and the working
  directory on the command line. Where one applies it replaces the editor's
  `rules`, `fallbackOptions` and `ignore`, so the editor reports what CI
  would. Merging the two would let them disagree. A file that cannot be used
  stops linting for the files it governs: the editor shows no findings and
  says why in the status bar, and the command line exits 2. A schema
  validates the file as it is written.
- **Quick fixes that silence a finding**: disable its rule for the line or
  for the file, written as a comment in the file's language. Not offered in
  strict JSON, which has no comments, or for JSON pasted into a string, where
  a comment would become part of the JSON.
- **Editor context menu** entries for linting the file, checking it with Jev
  and probing the question at the cursor, shown in the languages the linter
  reads.
- **Status bar** item with the findings count and the unread count for the
  active file. Hidden when the file holds no Jev questions.
- **Commands:** lint the active file, lint the workspace, open settings. The
  workspace command reports files skipped as too large and files it could not
  open.
- **Suppression** by comment: `decisionlint-disable-next-line DEC004`,
  `decisionlint-disable-line`, or `decisionlint-disable` for the file. No code list means
  every rule. JSON has no comments, so the `ignore` setting takes
  `CODE:questionId` entries.
- **JSON schema** for request bodies, applied to files named `*.jev.json`. It
  describes and completes fields and requires `state`, `model` and
  `questions`. It does not validate question types or criteria shapes, because
  the linter reports those with a reason and two reports on one token is noise.
- **Snippets** `jev-noul`, `jev-choice` and `jev-score`. The Choice snippet
  includes a fallback option.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `decisionlint.rules` | `{}` | Severity per rule, by code or name: `off`, `hint`, `info`, `warning`, `error`. An entry that names no rule or no level stops linting and says why, as in a `decisionlint.json` |
| `decisionlint.fallbackOptions` | the list above | Option names that satisfy `DEC004` |
| `decisionlint.ignore` | `[]` | `CODE:questionId` entries to drop |
| `decisionlint.target` | `""` | The platform every request goes to, for its limits. Empty reads it from each model id |
| `decisionlint.ask.models` | `jev-1.13.0` for `typesafe`, each platform's own default for the rest | The model id each Ask command sends, by platform. The TypeSafe default is the version the checks were calibrated on |
| `decisionlint.ask.keys` | empty | An API key per platform, and `endpoint` for a host you name, if you would rather type them here than use the keychain. User settings only, not synced |
| `decisionlint.ask.endpoint` | `""` | The URL **Ask the Model at My Endpoint** posts to, for a platform you host. User settings only |
| `decisionlint.ask.endpointShape` | `""` | The shape sent to that endpoint, `typesafe` or `openai`, where its path does not say |
| `decisionlint.ask.endpointModel` | `""` | The model id sent to that endpoint |
| `decisionlint.ask.maxCalls` | `25` | The most requests one Ask command may send |
| `decisionlint.ask.sendState` | `false` | Also send a state written in the file, so the model can check it |
| `decisionlint.ask.confirm` | `false` | Before a paid command sends anything, show what it will send and cost, and wait for a yes |
| `decisionlint.include` | JSON, JavaScript, TypeScript, Python, Rust and Go files | Files the workspace command lints |
| `decisionlint.exclude` | `node_modules`, build output | Files the workspace command skips |
| `decisionlint.maxFileSizeBytes` | `1000000` | Larger files are reported as skipped |
| `decisionlint.notificationsLevel` | `important` | How much is said in notifications. `important` hides the summary after a command that worked, and `all` shows it. `silent` also hides notes that a run was cancelled or left files out. Why a command could not run is shown at every level |

### Not built from the first draft of this spec

- **A size rule.** The limits are 64k tokens per request and 32k for the state
  plus the longest question. Jev's tokenizer is not public, so a character
  bound would be an invented threshold.
- **YAML request bodies.** They need a YAML parser, and no real usage has been
  seen.
- **Localization and the Rust CLI.** Both decided against, under Extended
  release 2. The MCP server and the npm package were on that list in the
  first draft and shipped in 0.1.0, the server's registry listing in 0.6.0.

## Wording rules

Built. Text heuristics over the instructions, the criteria and the Score
levels. Unlike the exact rules they can be wrong, so each one is scored and
its default follows from the score. Each maps to a failure mode in TypeSafe's
[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) page
or its primitives guide.

| Code | Name | Default | Fires when |
|---|---|---|---|
| DEC101 | double-negative | info | A question negates twice in one clause, or a negation sits directly on another |
| DEC102 | arithmetic | warning | The question asks Jev to count or compare numbers |
| DEC103 | date-comparison | info | The question asks Jev to order two times or measure the gap between them |
| DEC104 | compound | off | A Noul joins two judgments with 'and' |
| DEC105 | generation | warning | The question asks for a value or for text to be written |
| DEC107 | negated-noul | off | A Noul with no criteria is phrased so that yes means something is absent |
| DEC108 | inverted-criteria | off | A Noul's 'true' criterion describes the negative case |
| DEC110 | degree-levels | off | Score levels are degree words, bare labels, or one word turned up and down. Nothing for Jev to match the state against |
| DEC111 | numeric-encoding | off | The question refers to a value by hex or RGB encoding |
| DEC112 | undefined-boundary | off | A Noul with no criteria turns on a word such as large, often or enough |

A rule that is `off` still runs when switched on in `decisionlint.rules`.

Text inside backticks or double quotes is left out before a wording rule
reads a question, because it is a field name or quoted data and not the
question's own wording. Structured instructions are read from their
`question` field.

### How a default is earned

A wording rule is on by default only if it catches at least one bad question
and fires on no good one. Misses are recorded and do not block.
`src/lint/corpus.test.ts` enforces this and holds every number to
`fixtures/corpus/scores.json`.

Since 0.4.0 there is a second gate, for every rule that is on by default and
not exact: on a public sample labelled before the rule was run, it must be
right on at least 9 of 10 of its firings, counting a firing on a borderline
label as right. A rule that fails goes off. One that fails twice is removed.
The measurement is written into the sample's README with the labels it was
made against, so it can be checked.

The corpus is `fixtures/corpus/questions.json`: 157 bad questions, each
labeled with the rule that should fire, and 119 good ones. It was written for
this repo in two batches, plus the questions the public samples taught, put
in the repo's own words. The second batch was written before the rules were
last changed and scored blind first: the rules then caught 25 of its 47 bad
questions. After the changes they catch 41.

| Rule | Caught | Fired on good |
|---|---|---|
| DEC101 double-negative | 10 of 10 | 0 of 119 |
| DEC102 arithmetic | 14 of 14 | 0 of 119 |
| DEC103 date-comparison | 10 of 10 | 0 of 119 |
| DEC104 compound | 6 of 10 | 0 of 119 |
| DEC105 generation | 11 of 11 | 0 of 119 |
| DEC107 negated-noul | 9 of 9 | 0 of 119 |
| DEC108 inverted-criteria | 6 of 9 | 0 of 119 |
| DEC110 degree-levels | 16 of 16 | 0 of 119 |
| DEC111 numeric-encoding | 6 of 7 | 0 of 119 |
| DEC112 undefined-boundary | 5 of 5 | 0 of 119 |

### What the labels are worth

The corpus labels are mine. I wrote each bad question to have a defect and
labeled it as I wrote it. Nobody else reviewed them and nothing checked that
Jev answers those questions badly. "Caught 10 of 10" means the rule fired on
ten questions I decided were double negatives.

Two things in the repo go further.

**A hand-labeled sample of real questions.** `fixtures/public-sample/` holds
labels for 300 questions drawn at random from public code, each read for
every defect before any rule was run over it. About one real question in
twenty had a clear wording defect. The default-on rules caught 7 of the 13 and
were wrong on 1 of their 8 findings. Four rules had no real instance at all.
Five of the six misses are now fixed, which makes that sample spent: the next
number needs a new one.

**Experiments to run against Jev.** `fixtures/validation/experiments.json`
pairs a badly written question with the same question written well, over
states whose answer is known. `scripts/validate-defects.ts` sends both and
reports how often each was right. A rule whose bad question does as well as
its good one is reporting a defect that does not exist. It needs
`TYPESAFE_API_KEY`.

It was run once, on 2026-10-04 against `jev-1.13.0`: 122 calls, 37,869 input
tokens, about a sixth of a cent. Results are in
`fixtures/validation/results.json`.

| Rule | Bad question right | Fixed question right |
|---|---|---|
| DEC008 numeric-levels | 3 of 6 | 6 of 6 |
| DEC112 undefined-boundary | 4 of 6 | 6 of 6 |
| DEC004 no-fallback-option | 4 of 8 | 8 of 8 |
| DEC101 double-negative | 6 of 6 | 6 of 6 |
| DEC102 arithmetic | 6 of 6 | 6 of 6 |
| DEC103 date-comparison | 6 of 6 | done in code |
| DEC104 compound | 8 of 8 | 8 of 8 |
| DEC107 negated-noul | 6 of 6 | 6 of 6 |
| DEC108 inverted-criteria | 6 of 6 | 6 of 6 |
| DEC110 degree-levels | 6 of 6 | 6 of 6 |

Three defects cost answers. Seven did not, on these cases, which were few
and easy. So the seven were run again on harder ones.

**The harder run**, same day and model: 174 calls, 62,849 input tokens.
States that take reading, lists of 20 to 40 items with the true count one
either side of the line, dates a day apart in mixed formats. It also records
how sure Jev was of the right answer, from 0 to 1, because two wordings can
both land on the right side of 0.5 with one of them a nudge from flipping.
Results are in `fixtures/validation/results-hard.json`.

The rule for reading the result was fixed before the run: a defect is proven
if the bad question is right at least two times fewer than the fixed one,
advisory if it is right as often but at least 0.10 less sure, and otherwise
has no measured cost.

| Rule | Bad question | Sure | Fixed question | Sure | Outcome |
|---|---|---|---|---|---|
| DEC101 double-negative | 14 of 15 | 0.73 | 15 of 15 | 0.87 | Advisory. Now `info` |
| DEC102 arithmetic | 8 of 12 | 0.58 | 9 of 12 | n/a | Kept. See below |
| DEC103 date-comparison | 12 of 12 | 0.90 | done in code | n/a | No cost on ordering. See the window run below |
| DEC104 compound | 14 of 14 | 0.87 | 14 of 14 | 0.92 | No cost. Stays `off` |
| DEC107 negated-noul | 14 of 14 | 0.86 | 14 of 14 | 0.88 | No cost. Now `off` |
| DEC108 inverted-criteria | 14 of 14 | 0.86 | 14 of 14 | 0.95 | No cost. Now `off` |
| DEC110 degree-levels | 11 of 12 | 0.90 | 11 of 12 | 0.95 | No cost. Now `off` |
| DEC111 numeric-encoding | 12 of 12 | 0.94 | 12 of 12 | 0.97 | No cost. Now `off` |

**Counting did not fit the rule, and is kept.** The bad question was right 8
times in 12 at 0.58 sure, which is close to a guess. That is the defect
TypeSafe describes. But the documented fix, one question per item and a count
in code, was right only 9 times in 12, because with the true count one from
the line a single misjudged item flips the answer. So the defect is real and
the fix is not the cure the docs imply near a threshold.

**`DEC108` missed advisory by 0.01.** It is `off` because the rule was set
beforehand. Jev answers the question and ignores criteria that contradict it,
so inverted criteria are a mistake in what the author wrote down and not one
that changes the answer.

**Numbers, run later the same day**, 24 calls, in `results-numbers.json`.
The answer key was checked in code before anything was sent.

| Rule | Question | Right | Sure |
|---|---|---|---|
| DEC102 | Do three to five amounts add up to more than a limit? | 5 of 12 | 0.52 |
| DEC103 | Was the item returned inside a window counted in days? | 11 of 12 | 0.75 |

Addition is worse than a coin. The window question lost one answer and a
quarter of the certainty that code has, which by the rule above is advisory,
so `DEC103` is back on at `info`. Ordering two dates stays cost-free. What
costs is arithmetic on dates.

**What is and is not proven.** Measured to cost answers here: `DEC004`,
`DEC008`, `DEC102`, `DEC110`, `DEC112`. Measured to cost confidence: `DEC101`,
`DEC012`. Measured to cost nothing on sensible names, and kept as `info` for
the names that say nothing: `DEC011`. Everything else on by default is an
exact rule about what the API accepts, plus `DEC105`. `DEC110` and `DEC112`
are proven to cost and off all the same since 1.1.0: they fell under the
second gate on public sample 2, under "What public sample 2 showed at 1.0.1".

`DEC111` was left out of the harder run by mistake and run on its own
afterwards, 24 calls, with the result in `results-encoding.json`. It compared
"closer to #FF0000 than to #0000FF" with "closer to red than to blue". Those
are the two easiest hex values there are, so a finer comparison might still
fail.

`DEC105` cannot be tested this way. A Noul asked "What is the order number?"
returns a probability, and there is no right or wrong probability for a
question that is not yes or no. The rule reports a mismatch between the
question and the type of answer, the way a type checker does, and needs no
measurement to be true.

The rules that are `off` still describe what TypeSafe documents as failure
modes. On `jev-1.13.0`, with up to fifteen cases each written by one person,
they did not fail. A different model version or harder cases could change
that, and the experiments are there to be rerun.

### What public code showed

The corpus has the same author as the rules, so it is a regression suite and
not evidence. The evidence is three sets of public files found by GitHub code
search, 1,411 files from 720 repositories holding 4,168 questions. They are
not committed, because those files carry their own licenses. Each set was run
once, every wording finding was read, and the rules were fixed before the
next set was collected. The third set was collected after the last round of
fixes.

On the third set, 2,463 questions it had never been run on, the default-on
wording rules fired 23 times. Five were wrong, and all five came from three
causes that are now removed:

- `exceed` used loosely ("exceed what the council may lawfully do"). The bare
  word is no longer an arithmetic pattern.
- "How long a session does the learner want?" read as a date comparison. Only
  "how long ago", "since", "until", "before" and "after" count now.
- `DEC104` fired three times and was right once. It is off again.

Over all three sets with the final rules, the default-on wording rules fire
39 times in 4,168 questions: `DEC112` 17, `DEC102` 11, `DEC110` 8, and one each
for `DEC101`, `DEC103` and `DEC107`. Read by hand, about 34 are right. The
weakest is `DEC112`, where three of 17 turn on a word used as a plain
adjective ("an expensive model"), which is why it is `info`.

**Rules that are off for being wrong on public code.** `DEC104` compound was
wrong on two of three firings in the third set.

**Rules removed for being wrong on public code.** `DEC106` multi-hop fired
six times across the sets and was never right, then once more on sample 3,
wrong again. `DEC109` multi-dimension-level fired 166 times across the sets,
nearly all on levels that list examples, then 10 of 11 wrong on sample 2 and
10 of 10 on sample 3. Both were removed in 0.4.0. A settings file that names
either is now refused as naming a rule that does not exist.

**What the first two sets changed.** The double-negative rule fired on 18
questions in the second set and was wrong on almost all of them: instructions
that negate several things once each, "neither ... nor", and words that only
start like a negative ("instructions", "independent"). It now reads a
question clause by clause, trusts only a negation sitting directly on another
outside a question, and matches negative words from a list. Wording rules also
skip text that is not English, read only the asking sentence where there is
one, and ignore template slots such as `$question`.

### What public sample 3 showed

`fixtures/public-sample-3/` is 276 questions drawn on 2026-10-08, labelled
before any rule ran, and scored twice: with the rules as they were, and
after the changes 0.4.0 made. The before run is the measurement. The after
run is a check on the changes against the questions that prompted them, so
it is not blind for `DEC102`, `DEC110` and `DEC112`, and `DEC012`'s threshold
was read off these labels.

35 of the 252 questions read had a clear defect, and 28 of the 35 had one of
two things no rule looked for: an option described as its own name, and
instructions of a word or two that lean on the question id. 27 had nothing
else wrong. The wording rules had 8 clear cases between them.

| | Before | After |
|---|---|---|
| Clear defects under the default-on rules | 3 | 41 |
| Caught | 1 | 36 |
| Findings | 4 | 40 |
| Findings that were wrong | 2 | 0 |

What changed because of it, each measured on the sample afterwards:

- `DEC011 description-repeats-name` and `DEC012 terse-instructions`, new,
  both exact, both `info`. 8 of 10 and 20 of 23, none wrong. `DEC012` leaves
  a two-word question that opens with how, who, what, which, where, when or
  why alone, which is what separated "How severe?" from "how much?" in the
  labels. The levels come from the run below: `DEC012` cost confidence and
  not answers, and `DEC011` cost nothing measurable where the name itself
  says something.
- `DEC110 degree-levels` on, as a warning, and widened to levels that are a
  bare word or two, or carry a slash gloss. 5 of 5, none wrong, after 6 of
  10 with none wrong on sample 2. Proven below: Shallow, Medium, Deep placed
  4 of 12 code reviews right against 12 of 12 for described levels.
- `DEC102 arithmetic` reads comparisons written as symbols or as "greater
  than the number", and "40 minutes or longer". 3 of 3 after 1 of 3.
- `DEC112 undefined-boundary` fires only where the vague word is the
  predicate or closes the question. It was wrong on both of its findings
  here and on 2 of 5 on sample 2, every time on an adjective sitting on a
  noun. It now fires on nothing in this sample.
- `DEC004 no-fallback-option` stays `info`, after a look at raising it. It
  fired on 65 of the sample's 86 Choices, 57 once more names counted as a
  fallback, and text cannot tell an exhaustive
  pair from one that is not. ESLint's `default-case` and Biome's
  `useDefaultSwitchClause` are the same rule for a switch and are off in both
  recommended sets. The message now carries the measured cost, and a fallback
  counts under more names, so `uncertain`, `none_implied` and
  `other_or_unclear` no longer draw it.
- `DEC106` and `DEC109` removed, wrong on every firing across three samples.

**Whether the new defects cost anything.** Four experiments in
`fixtures/validation/descriptions.json`, run on 2026-10-08 against
`jev-1.13.0`, 96 calls, results in `results-descriptions.json`. Twelve cases
each, with the ambiguous ones the bad wording would plausibly lose.

| Rule | Bad question | Sure | Fixed question | Sure | Outcome |
|---|---|---|---|---|---|
| DEC110 Shallow, Medium, Deep | 4 of 12 | 0.76 | 12 of 12 | 0.89 | Proven. `warning` |
| DEC012 "Refund?" | 9 of 12 | 0.70 | 10 of 12 | 0.85 | Advisory. `info` |
| DEC011 true: Yes, false: No | 11 of 12 | 0.83 | 11 of 12 | 0.91 | No cost found. `info` |
| DEC011 billing: Billing | 12 of 12 | 0.98 | 12 of 12 | 1.00 | No cost found. `info` |

The short scale is the largest cost measured on any wording rule in this
project. The two `DEC011` arms found none, because "billing" and "yes"
already say what the description would: the cost that independent runs
report is in names that say nothing, "a": "A", which is what 10 of the 10
public cases were and what no experiment with a sensible name can show.

**The Jev-backed checks on real questions.** The same day, every question
read from sample 3 was sent through `DEC301` to `DEC308` with the cutoffs as
they stand: 252 calls, 171,299 input tokens, every probability saved in
`fixtures/public-sample-3/reviews.json` by hash. The first scoring of those
checks on questions their author did not write. Read by hand:

| Check | Asked | Fired | Right |
|---|---|---|---|
| DEC301 counting | 252 | 3 | 3, the three questions labelled `DEC102` |
| DEC302 undefined boundary | 132 | 6 | 6, two of them the `DEC112` borderlines |
| DEC303 overlapping options | 78 | 13 | 13 plausible, category sets an input could fit twice |
| DEC307 ordered options | 53 | 5 | 5, all tiers such as low, medium, high |
| DEC304, DEC305, DEC306, DEC308 | 28 to 156 | 0 | |

No cutoff moved. `DEC303` fires on one Choice in six and stays `info`, as
the first sample already said. `DEC309` to `DEC312` are still unmeasured
on real code.

### What public sample 2 showed at 1.0.1

`fixtures/public-sample-2/` was the unspent sample: labelled on 2026-10-05
and never used to change a rule. On 2026-10-23 it was labelled for `DEC011`
and `DEC012`, which did not exist when it was drawn, and scored with the
rules as 1.0.1 ships them, the first measurement of the 0.4.0 changes on
questions they were not tuned against. The drawn text was gone, so
`scripts/refetch-public-sample.ts` fetched the files again and kept the 278
of the 287 read questions whose instructions still hash to a label.

| | Default-on rules at 1.0.1 |
|---|---|
| Clear defects under those rules | 50 |
| Caught | 34 |
| Findings | 39 |
| On a borderline label | 3 |
| Findings that were wrong | 2 |

What changed because of it:

- `DEC110 degree-levels` off. Right on 8 of 9 firings, under 9 of 10 by
  one. The one wrong by the labels is "low, medium, high, critical", which
  the 2026-10-05 labels did not mark though it is the shape the rule
  describes. The labels came first and stand. The cost it measures is
  unchanged, so a passing run on the next sample puts it back on.
- `DEC112 undefined-boundary` off. Right on 2 of 3 firings. The wrong one is
  "is the consequence cheap to undo", where the next sentence says what
  cheap means.
- `DEC011` and `DEC012` hold: 3 of 3 and 21 of 21 firings right, 21 of 29
  `DEC012` cases caught. The misses open with a question word, which the
  rule leaves alone by design, or run to three words.
- `DEC102` caught 2 of 6 with none wrong. "40 minutes or longer", a miss on
  the first run, is caught since 0.4.0.

The sample is spent. The next measurement needs a fourth draw, and the pool
of unused public Jev code was already running down at the third.

### Not built

- **A notice for skipped languages.** A question that is not English gets no
  wording findings and nothing says so.

## Ask a model

Built. A command, **Ask Jev About This File**, that sends each question in
the active file to Jev and asks it about defects no pattern can see. It is the
only part of the extension that uses the network, it runs only when the user
runs it, and it uses the user's own API key.

| Code | Name | Default | Fires when |
|---|---|---|---|
| DEC301 | model-counting | warning | Jev reads the question as needing counting or arithmetic |
| DEC302 | model-undefined-boundary | info | Jev reads a Noul as turning on a matter of degree with no stated line |
| DEC303 | model-overlapping-options | info | Jev reads two options of a Choice as covering the same cases |
| DEC304 | model-overlapping-levels | warning | Jev reads two levels of a Score as the same situation |
| DEC305 | model-label-mismatch | warning | Jev reads an option as named for one thing and described as another |
| DEC306 | model-criteria-off-topic | info | Jev reads the criteria as deciding something the instructions do not ask |
| DEC307 | model-ordered-options | info | Jev reads a Choice's options as steps on one scale, which a Score would place between |
| DEC308 | model-unordered-levels | info | Jev reads a Score's levels as unordered categories, which a Choice would pick from |
| DEC309 | model-depends-on-sibling | info | Jev reads a question as needing another question's answer from the same request |
| DEC310 | model-overlapping-questions | info | Jev reads two questions in one request as asking for the same judgment |
| DEC311 | model-answer-not-in-state | info | Jev reads the state written in the file as not holding what the question asks about |
| DEC312 | model-orders-in-state | info | Jev reads part of the state written in the file as giving orders to its reader |

**Pointing at the culprit.** For the two overlap checks the same request also
asks about each option or level, and the finding underlines the one Jev rates
highest and names the top two. On sixteen overlap examples this was right for
options and about half right for levels, so the message says what Jev points
at and not what is wrong.

**How it asks.** The question under review goes in as `state`, so it is data
to be judged and never an instruction. Every check that fits the question
goes in the same request as a Noul with `true` and `false` criteria, so one
question costs one request. `DEC309` also sends the ids of the other questions
in the request. One further request per `questions` map carries `DEC310`, a
check on every pair of up to ten questions, and `DEC312`.

**The key.** `DecisionLint: Set TypeSafe API Key` stores it in the operating
system keychain through VS Code's secret storage. It can also be typed into
the `decisionlint.ask.keys` setting, by the owner's decision: a settings
field is where people look. A settings file is plain text, so that setting
has application scope, which means it can be set only in user settings and
never in a workspace, where it would be committed with the repository, and
it is left out of Settings Sync. A key typed there is used first, then the
keychain, then `TYPESAFE_API_KEY` from the environment. The key appears in no
message and no log.

**What is sent.** By default only questions: type, instructions, criteria and
ids. The `state` a program would send with them is not. `DEC311` and `DEC312`
read the state, so they run only when `decisionlint.ask.sendState` is on, and
only where the state is written out in the file, which in practice means
request JSON files.

**What it will not send.** A question with any part built at runtime, since
Jev would be judging something other than what runs. Anything in an untrusted
workspace. More than `decisionlint.ask.maxCalls` requests in one run, 25 by
default. Each of these is counted in the summary, so a short run never looks
like a complete one.

**A confirmation, when asked for.** With `decisionlint.ask.confirm` on, the
command first shows how many requests it will make, an estimate of the input
tokens and the cost, whether the state is included, and what it is holding
back, and waits for a yes. It is off by default, by the owner's decision:
running the command is the decision to send, and a dialog on every run was in
the way. The count shown is the
count sent: both come from the same plan. The estimate counts the body as
the platform is sent it, and divides by two characters per token for Jev,
under the 2.2 to 2.79 measured at TypeSafe and through the gateways, and by
1.5 for every other model, under Luna's 1.67, the lowest measured. So it
errs high. `ask/estimate.test.ts` fails if it comes in under what a
platform billed for the calibration set.

**After an edit** the findings are removed. They were about text that has
changed.

**The model is pinned** to `jev-1.13.0` in `decisionlint.ask.models`, because the
cutoffs below were set on that version.

### How the cutoffs were set

`scripts/calibrate-reviews.ts` sends every corpus question and request to Jev
with the checks that apply and saves each probability in
`fixtures/validation/calibration.json`, 390 calls so far. A cutoff is read off
those numbers, so changing one costs nothing, and adding a check sends only
that check. `src/ask/reviews.test.ts` holds each per-question cutoff to the
saved numbers: a check may not flag a question the corpus calls good.

| Check | Cutoff | Bad caught | Lowest bad | Highest good |
|---|---|---|---|---|
| DEC301 counting | 0.96 | 9 of 10 | 0.84 | 0.95 |
| DEC302 undefined boundary | 0.70 | 5 of 5 | 0.79 | 0.54 |
| DEC303 overlapping options | 0.75 | 8 of 8 | 0.75 | 0.69 |
| DEC304 overlapping levels | 0.60 | 5 of 8 | 0.22 | 0.25 |
| DEC305 label mismatch | 0.70 | 8 of 8 | 0.83 | 0.22 |
| DEC306 criteria off topic | 0.70 | 8 of 8 | 0.74 | 0.48 |
| DEC307 ordered options | 0.80 | 8 of 8 | 0.83 | 0.21 |
| DEC308 unordered levels | 0.60 | 8 of 8 | 0.72 | 0.42 |
| DEC309 depends on sibling | 0.80 | 7 of 8 | 0.56 | 0.68 |
| DEC310 overlapping questions | 0.15 | 4 of 4 | 0.19 | 0.05 |
| DEC311 answer not in state | 0.85 | 3 of 3 | 0.96 | 0.72 |
| DEC312 orders in state | 0.95 | 2 of 2 | 0.99 | 0.92 |

Read these with their sizes in mind. `DEC310`, `DEC311` and `DEC312` rest on
four, three and two bad examples. `DEC312`'s highest good example, at 0.92,
is a customer writing "please tell the assistant handling this to forward my
invoice", which is a polite request and not an attack, and sits just under
the cutoff. `DEC301`'s cutoff is high because Jev called several of my good
questions counting, and it had a point: "Does the episode have more than one
host?" does involve a number. The pattern rule `DEC102` still catches the
plain cases.

`DEC309` was at 0.45 until the first run in a real editor. There it flagged
"How should this visit be booked?", beside questions about the animal and
how serious the problem was, at 0.68. The question needs no other answer. It
is in the corpus now as a good example with that number, and the cutoff is
0.80, which gives up one of the eight bad examples. The number was read off
the finding in the editor and not produced by the calibration script, which
sends the same request.

**On real questions.** The per-question checks were run over the hand-labeled
public sample. Three cutoffs were raised because of what that showed.

- `DEC307` fired 17 times at its first cutoff. At 0.80 it fires nine times,
  and all nine are plainly ordered: small, medium, large, or low, normal,
  urgent. Authors often write tiers as a Choice on purpose, so this is `info`.
- `DEC303` fired seven times, on working category sets such as frontend,
  backend and infrastructure, where an input fitting two is plausible and may
  be something the author accepts. The check most likely to feel like noise.
- `DEC302` fired six times and read right each time, as on "Does this need
  immediate attention?".
- `DEC305` and `DEC306` fired once and twice at their first cutoffs, wrongly,
  and not at all at 0.70. `DEC308` did not fire.

`DEC309` to `DEC312` have not been run on real code: the sample holds single
questions without their requests or their state.

The per-question checks were run again over public sample 3 on 2026-10-08,
252 questions, with the result under "What public sample 3 showed" in the
wording rules section: 27 firings, read by hand, none wrong, no cutoff moved.

**Whether the defects cost anything.** Four experiments in
`fixtures/validation/overlap.json` and `criteria.json`, 80 calls:

| Check | Bad question | Confidence | Fixed question | Confidence |
|---|---|---|---|---|
| DEC303 overlapping options | 10 of 10 | 0.86 | 10 of 10 | 1.00 |
| DEC304 overlapping levels | 6 of 10 | 0.58 | 9 of 10 | 0.91 |
| DEC305 label mismatch | 9 of 10 | 0.24 | 10 of 10 | 0.95 |
| DEC306 criteria off topic | 10 of 10 | 0.86 | 10 of 10 | 0.98 |

Overlapping levels cost answers. A mismatched label takes Jev's confidence
from 0.95 to 0.24, which is the largest effect measured in this project. The
other two cost confidence only. `DEC307` to `DEC312` are unmeasured and
`info`.

**What this is not.** Jev judging a question is still Jev, with the
weaknesses the rest of this document measures. The cutoffs come from a corpus
its author wrote. A finding from this command is an argument with a number
attached, and the number is shown.

## Python

Built. Public files that call the API split about 50% JavaScript and
TypeScript, 31% Python, 6% Rust, 5% Go and 8% everything else, counted by
GitHub code search on 2026-10-04. The shapes read are S5 to S7 above, taken
from `typesafe-sdk` 0.7.2.

**On public code.** 439 Python files from 353 repositories, at most three per
repository, none seen before the reader was written.

| | |
|---|---|
| Files holding a question | 248 |
| Questions read | 795 |
| Questions with a part built at runtime | 390, about half, the same share as JavaScript |
| Crashes | 0 |
| Findings | `DEC004` 91, `DEC001` 50, `DEC009` 11, `DEC006` 6, `DEC112` 6, `DEC102` 1 |

Every `DEC006`, `DEC009`, `DEC102` and `DEC112` finding was read, with a
sample of the other two. None was wrong about the code in front of it.
Several sit in other projects' test suites, where the mistake is planted on
purpose.

The first run read 725 questions. Two changes made on the strength of it
added 70: wrapper libraries re-export the three classes under their own
module names, and questions built in a loop sit under a key that is an
f-string. Of 1,116 places in those files that look like a question, 783 are
now inside one that was read. The rest sampled as answers, class
definitions, docstrings and prose.

**Not read.** `dict(type="noul", ...)`, a question class called through a
variable, and a `questions` dict passed to a function under another name.

## Command line

It is one npm package, `decisionlint`, assembled in
`npm/`, that is both the command line and the MCP server. `src/cli/` wraps
`lintText` in a process: it finds
files, lints each with the reader its extension calls for, prints, and sets
an exit status. It imports nothing from the editor. It uses the network only
under `--ask`. The probe is not in it.

| | Behaviour |
|---|---|
| Paths | A directory is searched for the extensions in `EXTENSIONS`, skipping installed packages, build output and `.git`. No path means the current directory |
| Formats | `stylish`, the default, grouped by file for a person to read. `compact`, one finding per line as `path:line:column`. `json`, with one-based positions, the rule name and its docs link. `github`, workflow annotations. `sarif`, version 2.1.0, for code scanning. `junit`, one suite per file, failing only on errors |
| Integrations | `action.yml`, a composite GitHub Action, and `.pre-commit-hooks.yaml`. Both run the published package through `npx` at the version they ship with. Neither has been run by its host tool yet |
| Fixing | `--fix` writes the fixes marked safe, then reports what is left. Never with standard input or `--mcp` |
| Files | `exclude` in `decisionlint.json` leaves files out, relative to that file. `--no-error-on-unmatched-pattern` passes a run with nothing to lint |
| Exit status | 0 passed. 1 an error was found, or more warnings than `--max-warnings`. 2 the run could not be done as asked |
| Settings | The `decisionlint.json` nearest each file. `--config` names one to use for every file instead. `--rule CODE=level`, repeatable, overrides either |
| Standard input | `--stdin-filename` lints piped text under a file name, which picks the reader |

It refuses where passing would mislead. An unknown option is an error and
never a path. A file named outright must be a type it reads. A run that
finds no file to read exits 2, so a CI job pointed at the wrong directory
does not pass. A folder or file that cannot be read is named in the summary
and the rest is linted. A linked folder is not followed. An unknown key in the config file is an error, because a
misspelt `rules` would leave a rule on that its author believes is off. The
summary line always carries the count of questions not read in full.

The help is printed from the table the parser reads, so a flag cannot exist
without its line. `scripts/e2e-cli.js` runs the built bundle as a real
process on `samples/`.

### A page per rule

Built for 0.3.0. `docs/rules/DEC004.md` and its 34 siblings, plus an index,
generated by `bun run docs:rules`. Each has the rule's meaning from the
README table, whether it is on, what kind of rule it is, a flagged example
with the linter's real message, an example that is not flagged, whether
`--fix` mends it, how to silence it, and the vendor page behind it. A
Jev-backed rule has no offline example, so its page shows the question Jev is
asked and the cutoff.

Findings link to these pages. Before, they linked to TypeSafe's pages, which
this project does not control and which carry no example of the rule.

Not built: the same pages on letools.dev.

### The project's own copy in the editor

Built for 0.3.0, as Biome's extension does it. A project that lists
`decisionlint` in its dev dependencies is linted in the editor by that copy.

| The project has | The editor lints with |
|---|---|
| A copy at 0.3.0 or newer, in a trusted workspace | The project's copy |
| A copy, in an untrusted workspace | The bundled copy, with the reason |
| A copy older than 0.3.0, or one that does not load | The bundled copy, with the reason |
| A copy that does not read the file's language | The bundled copy for that file, with the reason |
| No copy, or the version the extension carries | The bundled copy, silently |

The npm package's `main` is `lib.js`, built from `src/lib.ts`: `lint`,
`fix`, `rules`, `syntaxes` and `api`. The extension reads the installed
manifest for the version and the `main` path, loads that file once per
version, and checks `api` before using it. Findings, quick fixes and fix on
save come from the project's copy. The Jev-backed checks and the probe do
not.

Verified in a real editor: the integration test installs a marked copy into
the samples' `node_modules` and expects its finding.

Not built: a setting to force the bundled copy, and loading from a global
install.

### Asking from the command line

Built, in 0.2.0. `--ask` runs the model-backed checks after linting, through
`src/ask/review.ts`, the same code the editor's command runs. The two send
identical requests for identical text, and a test compares them.

| | Behaviour |
|---|---|
| Key | The variable the platform names, in the environment and nowhere else: `TYPESAFE_API_KEY` by default, `OPENAI_API_KEY` for Luna, the target row's `envKey` for the rest, and none for a host the user runs. `--ask` without it exits 2 before a file is read |
| Consent | The flag. No setting in `decisionlint.json` turns it on, which stands in for workspace trust |
| Plan | `--ask-plan` prints what would be sent and sends nothing. Under `--ask` the same count goes to standard error before the first request |
| Limit | `--ask-max-calls`, default 25, for the whole run and not per file as in the editor. A run that needed more exits 2 |
| State | Sent only with `--ask-send-state` |
| Model | `--ask-model`, default the pinned calibration model |
| Failure | A rejected key, a rejected request, a busy or failing service after three tries, a reply that is not a Jev reply, no answer in 30 seconds, or an interrupt stops the sending. What was found is printed, the reason and the count answered of the count planned go to standard error, and the exit is 2 |
| Output | Jev findings join each file's findings. `totals.ask` is present only when asked for |
| Standard input | `--stdin-filename` with `--ask` checks the piped text |
| Quiet | `--quiet` prints errors only, and every model-backed check defaults below that, so `--quiet --ask` pays for its requests and prints a finding only where `--rule` raised one. The help says so |

Not built: the model and state settings in `decisionlint.json`, so a team's
editors and its CI can still ask different models. A price in the plan line,
because a stale one in a CI log reads as a quote. The probe.

Not verified: a real request from the built bundle to TypeSafe. Every test
stubs `fetch`.

### MCP server

Built. `--mcp` runs the same program as a Model Context Protocol server on
standard input and output, one JSON message per line. An agent that writes a
Jev question can lint it and mend it before a person sees it, which is the
case this tool is most useful for.

| Tool | Input | Returns |
|---|---|---|
| `lint_text` | `text`, an optional `filename` whose extension picks the reader, optional `rules` | The same report as `--format json`, each finding with the edit that would mend it and whether it is safe |
| `lint_paths` | `paths`, optional `rules` | The same, one entry per file |
| `fix_text` | as `lint_text` | The text with the safe fixes applied, how many were mended, and the report of what is left. Nothing is written |
| `list_rules` | nothing | Every rule with its meaning, default level, its pages, and whether it runs offline here |
| `explain_rule` | `code` | The rule's own page as Markdown, rendered from the bundle, and the same fields as `list_rules` |
| `plan_ask` | `text` or `paths`, optional `model`, `maxCalls`, `sendState`, `rules` | The report with `totals.ask` saying what `ask_model` would send. Nothing is sent and no key is needed |
| `ask_model` | the same | The report with the model's findings added and `totals.ask` saying what was sent and answered, where the key came from, and why the check fell short when it did |
| `probe_question` | `text`, optional `filename`, `questionId`, `model` | The probe report as Markdown with its verdict and the variants that moved the decision. Jev only |

Every tool declares the shape of its answer and returns it as structured
content beside the text, and carries a title. The first six are annotated
read-only and reach nothing past the files they are given, so a host can let
an agent call them without asking. The two that send are open-world and not
idempotent, since each call costs, and their descriptions and the server's
instructions tell an agent to call them only when the user asks for a check
or a probe. That reverses the first decision, which kept the server offline
so that an agent could not spend the key unasked: the owner chose on
2026-10-10 to give the server everything the editor and the command line
have, with the descriptions carrying the caution.

The key is found the way `cli/dotenv.ts` finds it: `TYPESAFE_API_KEY` or
`OPENAI_API_KEY` in the environment the client started the server with,
then `.env.local`, then `.env` in its working directory. Never a tool
argument, so no key lands in an agent's transcript, and never a workspace
setting or `decisionlint.json`, for the reason the command line refuses those.
No answer carries the key: the report names where it came from.

The server is listed on the MCP registry from `server.json` at the root,
published by the Release workflow after npm, as the family does.

The extension also offers the server to the editor it runs in, through
`mcpServerDefinitionProviders`, so an agent in VS Code has the tools with no
setup. The command line bundle ships in the VSIX as `dist/cli.js` for this.
An editor without agent mode is left alone.

From 0.7.0 it is also a package of its own, `decisionlint-mcp`, as every
sibling's server is: one `bin` that is the server, with no flag. Until then
the server was reached only as `decisionlint --mcp`, on the reasoning that two
packages would be two versions to keep equal. What changed the decision: a
client that installs by package name, and an index that reads one, starts
`decisionlint` bare and gets a linter that exits, and the family's convention
is what the outside world pattern-matches. The two versions are kept equal
the way the family keeps them: `build-npm.js` writes both from one source and
CI fails if they differ. `decisionlint` keeps `--mcp` for a project that already
pins it, and the VSIX starts its own bundled copy that way.

A bad argument, an unknown tool or a tool that throws is a failed call with
the reason in it. Bad JSON, JSON that is not a request and an unknown method
are protocol errors. None of them ends the server. It answers in the protocol
version the client asked for when it knows it, from `2024-11-05` to
`2025-06-18`. The process test speaks to the built bundle over a real pipe.
It has not been tried in a real agent client.

## Rust and Go

Built. Neither has an SDK from the vendor that this project could confirm, so
there are no standard question classes to recognise. Every project defines
its own types, and the reader works from shape.

**What a project's own types mean.** A struct literal says less than a map.
Its field names are the project's, its question type may live in the type
and not in a field, and how it serialises is not written at the place it is
used. So the reader holds back:

- Criteria held in a named type are not judged. `NoulCriteria { yes, no }`
  drew 58 false shape findings before this.
- A struct with a field the API does not have is the project's own shape, and
  gets no shape finding.
- A struct with no `type` field is never reported as missing one.
- In Rust a struct literal, a pattern and a type definition look alike, so a
  typed question counts only when one of its values could be read.

**On public code.** Files it had not seen, at most three per repository.

| | Rust | Go |
|---|---|---|
| Files, repositories | 442, 305 | 450, 306 |
| Files holding a question | 213 | 185 |
| Questions read | 901 | 732 |
| With a part built at runtime | 233 | 386 |
| Crashes | 0 | 0 |
| `DEC001` unpinned model | 89 | 32 |
| `DEC004` no fallback | 90 | 38 |
| `DEC006` wrong shape | 37 | 23 |
| `DEC009` one option or level | 33 | 23 |

The shape findings that are not plain JSON were each read, 30 in all. After
the changes above none was wrong about the code in front of it. One Go
project scores news with a map of `"0"`, `"3"` and `"5"` where the API wants
a list, which is a real bug the rule found.

Read these numbers with the sample in mind. A large share of the Rust and Go
files are servers that imitate the API and client libraries with their own
test suites, where malformed questions are planted on purpose. The shape
counts say the rules fire where they should. They do not say how often
application code gets it wrong.

**JSON inside a string** changed the JavaScript and Python results by two
questions across 1,850 files, so it matters for Rust and Go and hardly at all
elsewhere.

**Not read.** In Go, a constructor such as `jev.Noul("...")`, because
projects disagree on what the first argument is. In Rust, maps built with
`insert` calls or a `hashmap!` macro. In both, JSON in a string that has
escapes.

## Values built at runtime

About half of the questions in public code have a part that is not written
out where the question is. Every such part in 2,742 public files was sorted
by what kind of code it is.

| Kind | JavaScript | Python | Rust | Go |
|---|---|---|---|---|
| A name passed in, such as a parameter | 32% | 24% | 44% | 58% |
| A member of another value, such as `q.instructions` | 20% | 19% | 6% | 12% |
| A name bound to a literal in the same file | 16% | 20% | 4% | 7% |
| Text with runtime parts in it | 17% | 17% | 6% | 3% |
| A function call | 10% | 13% | 35% | 11% |
| Other | 5% | 7% | 5% | 9% |

Two of these are read now.

**A name bound to a literal** is followed to it, and so is a member of one,
`TEXT.late.ask`. A finding is reported where the literal is written. The
reader does not know scopes, so it follows a name only when the file binds
it exactly once, it is not a parameter anywhere in the file, and nothing
assigns into it or calls a method that changes it. An empty container is
never followed: it is a starting point for something built later. Each of
those conditions was added after a false finding on public code. The first
run reported 71 single-option findings, all on containers filled after they
were written.

**Text with runtime parts** keeps its fixed text, with a placeholder where
each runtime part goes: template literals, f-strings, `str.format`,
`format!`, `Sprintf`, and strings joined with `+`. The rules that the fixed
text can answer run on it. `DEC112` does not, because a slot may be where
the line is stated. The question is still counted as not fully read, and Jev
is never shown it.

**What it changed.** Across those files 187 "cannot read" hints went away
and 114 unpinned models and 35 missing fallback options were found that
were hidden behind a name. Reading fixed text added one wording finding.

| Not fully read | Before | After |
|---|---|---|
| JavaScript and TypeScript | 58% | 54% |
| Python | 49% | 39% |
| Rust | 26% | 27% |
| Go | 53% | 51% |

The share moved little, and the table above says why. The largest group is
a name passed in, and most of those are wrapper functions: `function
ask(instructions, criteria)` returning a question built from its
parameters. That object is not a question. The question is at each place
the function is called.

### Wrapper functions

Built. A function defined in the file that builds one question from its
parameters is a wrapper. Each call to it is read as the question that call
builds, with every parameter replaced by what the call passes. A finding is
reported on the argument, where the text is written, and a fix edits it
there.

The wrapper itself draws no hint any more: it holds no question. A part the
wrapper computes from a parameter, such as `dict.fromkeys(options)`, stays
unread at each call, and so does a part the call computes or leaves out.

It reads a call only when the name can mean one thing: defined once in the
file, not a method, building exactly one question. A call that only hands on
names it was given is another wrapper and is not read.

Across the same public files this found 271 more questions than before and
removed 595 hints, against 310 new ones on calls that pass something
computed. It found 77 missing fallback options, 14 counting and date
questions, and a handful of shape mistakes that were invisible before.

| Not fully read | At first | With names and templates | With wrapper calls |
|---|---|---|---|
| JavaScript and TypeScript | 58% | 54% | 45% |
| Python | 49% | 39% | 39% |
| Rust | 26% | 27% | 23% |
| Go | 53% | 51% | 39% |

Of the JavaScript questions still not fully read, about a third have their
fixed text checked and about a third take their wording from a value passed
in from another file or a loop.

**Not read.** A wrapper defined in another file. A wrapper that is a method.
Questions built in a loop over a table of data.

### Loops over a table: measured, not built

A loop such as `for (const c of CHECKS)` that builds a question from each row
looked like the next thing to read. It was counted before any code was
written, under the rules that would keep it safe: a plain loop, over a table
written in the same file and never changed, using the row's fields directly.

| | JavaScript | Python | Go | Rust |
|---|---|---|---|---|
| Wording is a field of another value | 218 | 99 | 47 | 10 |
| In a plain loop | 130 | 38 | 22 | 3 |
| Table is written in the same file | 11 | 8 | 2 | 1 |
| Rows whose text could be read | 39 | 0 | 0 | 3 |

About 42 questions in 3 files, out of roughly 6,000. In 100 of the 130
JavaScript loops the table is a parameter of the function the loop is in, so
the code is a general helper and the data is in another file or arrives at
runtime. The loop is not the barrier. Reading across files is, and that
would need its own count first.

## Probe a question

Built. **Probe the Jev Question at the Cursor** sends one real question
against the real state written beside it, several times, and reports whether
the answer depends on how the question is laid out.

| Variant | Applies to | What changes |
|---|---|---|
| as written, three times | every question | Nothing. Shows how far the number moves on its own |
| options reversed | Choice | The same options in the opposite order. TypeSafe documents a lean toward the first |
| names hidden | Choice with every option described | Each name replaced by a blank one, read back by position |
| levels reversed | Score | The same levels in the opposite order, read back flipped |
| criteria removed | Noul with criteria | The instructions alone |

Every change is mechanical. Nothing rewrites the wording, because a reworded
question changes the meaning along with the layout, and a moved answer could
then be blamed on either.

The report opens as a Markdown page: a verdict, the spread across the three
identical requests, and one row per request. If identical requests disagree
it says the answer is too close to call and blames no layout.

It needs the state as a literal in the file, so it works on request JSON files
and on code that writes the state inline. It sends that state without the
`decisionlint.ask.sendState` setting, because a probe is a test against the
real input. It asks first only when `decisionlint.ask.confirm` is on. Five or
six requests per probe.

Tried once against `jev-1.13.0` on a parcel that was both late and damaged:
the answer held at "damaged" through every variant with confidence between
0.59 and 0.66.

## Roadmap

Status: refreshed 2026-10-23, at 1.0.1. Done since this list was written:
the site listing, the command line and its npm package, the MCP server and
its registry listing, OpenAI's Decisions API and every provider, each under
its own heading in this document. Decided against: a Rust port of the
command line, under "Publishing", and localization, under "Extended release
2". The rest, more languages, output for other editors and reading across
files, waits on a request. Reading across files has an issue, #63, to count
what it would recover before it is built.

### More languages

No tool lints Jev questions in any of these. Counts are public files that
call the API, from GitHub code search on 2026-10-04.

| Language | Files | How it would be read |
|---|---|---|
| Swift | 213 | A dialect of the reader Rust and Go share |
| C# | 182 | The same |
| Java | 155 | The same |
| Kotlin | 88 | The same |
| PHP | 132 | A second shared reader, for maps written with `=>` |
| Ruby | 93 | The same |
| Elixir | 77 | The same |
| Shell | 155 | No reader. The JSON-in-strings reader, pointed at shell files, for requests pasted into `curl` |

Together about 8% of public Jev code. Three of them have under 100 public
files, so the run over public code that every language so far has had will
be thin for those.

### Other editors, through the command line

A reader added once serves both the VS Code extension and the command line.
Separate extensions for Xcode, the JetBrains editors and Visual Studio are
not planned: each is its own product, in its own language, for a small
audience. Those editors show the output of a command run at build time or on
save, so the command line reaches them.

- **An output format per editor that needs one.** Xcode shows a line of the
  form `File.swift:12:5: warning: message` inline. This is how the usual
  Swift linter works. Not checked against a current Xcode.
- **A Swift Package build plugin**, so a package can run the lint on every
  build without a hand-written build step.

Findings then appear at build time in those editors, and as you type only in
VS Code.

### Reading across files

The one barrier left to reading more questions: a wrapper, a constant or a
table defined in one file and used in another. It is a larger change than
anything built so far, because the reader takes one file at a time. Count
how many questions it would recover before building it, as was done for
loops.

### The LE Tools site

Done on 2026-10-04, in `letools-site`. The site carries this tool and allows
a tool that differs from the other sixteen.

- **A featured section ahead of the other extensions**, with this tool in it,
  and the tool also listed among the rest in its right place.
- **The site's claims are read per tool.** Its registry and its copy stated
  things of every tool, such as twelve locales and a Rust crate, that are not
  true of this one. The registry now declares what this tool has: an npm
  package for the command line and one for the MCP server, its Open VSX
  namespace, its MCP registry listing as `io.github.nolindnaidoo/decisionlint`,
  and that one command sends on request.
- **The fleet check names it and does not compare it.** `OUTSIDE_FLEET` in the
  site's `scripts/check-fleet.ts` lists this repo, and a test there holds every
  tool in exactly one list. The files this repo copies unchanged, listed in
  AGENTS.md, are still kept equal by hand.

### Publishing

Released from the `Release` workflow since 0.1.0 on 2026-10-04, each
surface its own opt-in: the VS Code Marketplace, Open VSX and npm. The
current version is the top heading of [CHANGELOG.md](CHANGELOG.md). The
repository is public.

On Open VSX it is published under the `nolindnaidoo` namespace, which is the
manifest's publisher. The rest of the family is under `OffensiveEdge` there
until they are moved, so this tool sits apart from them on that registry for
now. The owner claimed the `nolindnaidoo` namespace on 2026-10-04 and Open VSX
granted it, so the listing is verified. The family is to follow it there.

Decided against: a Rust port of the command line, which every sibling has.
The TypeScript one lints thousands of files in seconds, and a port would be
every reader and rule kept in agreement twice. AGENTS.md's "Not done" points
here.

The MCP registry listing, `io.github.nolindnaidoo/decisionlint`, is in
`server.json` and goes out with the npm job of the Release workflow from
0.6.0, pointing at the npm package with `--mcp`. It was held back until the
server gave an agent something to act on: the fixes, `fix_text` and
`explain_rule` went in with the listing, so the first entry a client sees is
that server and not the lint-only one.

## OpenAI's Decisions API

Built for 0.5.0. OpenAI opened a Decisions API in public beta on 2026-10-06,
`POST /v1/decisions`, one model, `gpt-6-luna`: text or images in, typed
answers out, the same idea as System One in a different shape. Two days in,
GitHub code search found 14,720 public files naming the endpoint, against
17,088 for TypeSafe's. Before 0.5.0 this linter read a Decisions request as a
foreign shape and reported it clean, which is the one outcome it refuses
everywhere else.

**The shape, and how it is read.** A question now carries a `dialect`. The
rules do not look at it: every dialect is read into the `criteria` the rules
already read, in `extraction/requests.ts`, and nothing below that layer
changed.

| | TypeSafe | OpenAI | Vercel AI SDK `decide()` |
|---|---|---|---|
| Yes/no type | `noul` | `predicate` | `boolean` |
| Questions | a map, key is the id | a list, `name` is the id | a map |
| Evidence | `state` | `input` | `state` |
| Options | `criteria: { name: description }` | `choices: [{ value, description }]` | `options: { name: description }` |
| Levels | `criteria: [description]` | `levels: [{ label, description }]` | `levels: [description]` |
| Found in | `systemOne(...)`, `system_one(...)`, literals | `client.decisions.create(...)` in TypeScript and Python, literals | `decide({ questions })` |

A shape with `choices`, `levels` or `options` in a form none of the three
dialects writes stays `open`, as before: a client this reader does not know
proves nothing by what it lacks.

**What runs on a Luna question.** Every rule with evidence behind it:
fallback option, description repeats name, terse instructions, degree
levels, bare-number levels, duplicates, the wrapped list, counting, undefined
boundary, and the rest of the wording rules. OpenAI's own guide asks for the
same things: observable criteria, one concern per question, distinct
choices, distinct adjacent levels, a fallback such as `other`. A message
about a Luna question says Luna, and one about an AI SDK question says "the
model", since the SDK routes to either vendor.

**What does not.** The two API-limit rules, `DEC002` and `DEC003`: OpenAI
publishes no limits. `DEC001`: there is no alias to pin against yet. The
shape rule reports a Decisions mistake in OpenAI's own field names, and a
mistyped `predicate` is caught and fixed; a shape mistake in the AI SDK's
form cannot be told from a foreign client and is left alone.

**Asking Luna.** `--ask-model gpt-6-luna`, or `decisionlint.ask.models` in the
editor, sends the same checks to OpenAI's Decisions API with the key in
`OPENAI_API_KEY`, or in the keychain through **Set OpenAI API Key**, or in
`decisionlint.ask.keys`. `ask/provider.ts` is the one file that knows
the difference: the review's Nouls go as predicates with their criteria
folded into the instructions, the state goes as JSON text in `input`, a
check's dotted id travels as underscores, and a refusal is read as no
answer. The cutoffs were set on `jev-1.13.0`, so every finding from Luna
says "The cutoff was set on jev-1.13.0, not on Luna". Luna, Liquid's `d1`
and Jev through OpenRouter and LLM Gateway were run through
`calibrate-reviews.ts --platform` on 2026-10-16, each saved to its own
`fixtures/validation/calibration-<platform>-<model>.json`. Luna and d1 keep
Jev's cutoffs and the caveat: they flip 30 and 25 of 1114 verdicts, and a
cutoff fitted on eight bad and twenty good questions, several landing near
0.01, is not one to ship. OpenRouter's Jev differed from TypeSafe's by 0.009
on average and is counted as calibrated (`isCalibrated` takes the route).
Jev in the Decisions shape, through LLM Gateway or Vercel, differed by 0.033
and flipped 8, and the two gateways were 0.010 from each other, so the shape
moves Jev's answers. A Jev check sent in that shape carries the caveat, even
under TypeSafe's id. Luna through Vercel answered as Luna at OpenAI did. The probe asks Jev only: its variants are
built and read in Jev's shape, and Luna's reply for a Choice or a Score is
not read yet.

**Not measured.** The wording rules' costs are measurements of `jev-1.13.0`.
Whether Luna fails the same way is unknown, and the rule pages say "measured
on Jev". A labelled sample of public Decisions requests and a bad-against-good
run on Luna are the next two measurements. The second waits on Choice and
Score in the Decisions shape, which `validate-defects.ts` sends and
`ask/provider.ts` does not yet write.

## Every provider

Status: built on 2026-10-14 as 0.9.0, all four phases. One thing is
outstanding: the reading of OpenAI's Go SDK was added from the vendor's
guide and has not yet had the run over public Go code that every other
reader change had, issue #45. The research behind it is
`docs/research/reports/Decision model API providers.md`, with the notes
beside it, and every claim below that is not already in the code comes from
there.

**What the research found.** Four weeks after Jev shipped, every typed
decision API found speaks one of two wire shapes. TypeSafe's, `state` with a
`questions` map and the types `noul`, `choice` and `score`, is used by
Microsoft-Decision-1, Liquid d1, Cloudflare Clef, Upstage, llama.cpp, vLLM
and nine community projects that each call themselves "Open Jev". OpenAI's,
`input` with a `questions` list and the type `predicate`, is used by OpenAI
and spreading through the gateways: Vercel, LiteLLM, OpenRouter and LLM
Gateway serve both shapes and convert between them. The AI SDK adds a third
word for yes/no, `boolean`. No model, vendor or API named "JAY" was found.
The three dialects this linter reads already cover every body shape seen.
What differs between the platforms is everything around the body: the
limits, the spelling of a model id, the host, and the call that sends it.

The platforms differ in three ways the rules do not yet know:

1. **Limits are per platform, and most are unpublished.** OpenAI states
   none. Vercel's OpenAI-shaped path takes 1 to 255 choices and 2 to 10
   levels. LiteLLM refuses more than 128 questions and refuses a single
   option. Together's Tev1 takes 2 to 24 options. The rules today apply
   Jev's limits to the TypeSafe dialect and none to the others.
2. **A model id has fifteen spellings for two models.** Jev is `jev-1.13.0`,
   `jev-latest`, `typesafe/jev-1.13`, `~typesafe/jev-latest`,
   `typesafe-ai/jev` and `jev-1.13.0` unprefixed on LLM Gateway. Luna is
   `gpt-6-luna`, `openai/gpt-6-luna`, `gpt-6-luna-decisions`,
   `openai/gpt-6-luna-decisions` and a dated `-20261006`. Other platforms
   use tier suffixes (`d1:free`), `@cf/` paths, Azure deployment names,
   Ollama tags and Hugging Face repo ids. `DEC001` knows two aliases and
   `DEC013` one version pattern, and `ask/provider.ts` picks the host by
   matching the id against `gpt-6-luna`.
3. **The path and the model id do not say which shape a request is in.**
   Ollaya serves TypeSafe bodies on `/v1/decisions`, Eden AI on
   `/v3/alpha/decisions`, and LiteLLM serves `openai/gpt-6-luna` on
   `/v1/systemone`. The body decides, which is what the reader already does.

### Design

**D1. A platform is a row in a table, not a branch in the code.**
`lint/targets.ts`, beside `limits.ts`, holds every platform as data: an id,
a name, its kind (a vendor, a gateway or a runtime a user hosts), the wire
shapes it accepts, the hosts it is reached at, how its model ids are spelt,
which of them are floating aliases and what the pinned spelling is, and its
limits, each with the page and the date it was read from. A limit the
platform does not publish is absent, not borrowed from a neighbour. A number
enters the table only from the platform's own page. The research marks
every secondary figure, and those stay in the report until a primary page
says them. Adding a platform is a row and a test, and never a change to a
rule.

**D2. The target of a request is resolved from the file, and resolved is not
guessed.** In order: the `target` setting in `decisionlint.json` or
`decisionlint.target`, for a project that sends everything to one platform;
a base URL written in the file whose host a target claims; the model id,
where its spelling names a platform (`@cf/`, `~typesafe/`, a `liquid`
model) or a family of them (`openai/` is every gateway, so it resolves to
"a gateway" and no further). What none of these settles is unknown. A rule
that needs a limit asks the target. With the target unknown, the TypeSafe
dialect keeps Jev's limits and the others keep none, as today, and the
message says whose limit it is. With the target known and publishing no
limit, the rule is silent.

**D3. A model id is parsed, never matched.** `lint/models.ts` reads an id
into its family, its version, whether it floats, and the spelling it was
written in. `DEC001` fires on every floating spelling, and its fix pins in
the same spelling: `~typesafe/jev-latest` becomes `typesafe/jev-1.13`, as
OpenRouter writes it, and `jev-latest` becomes `jev-1.13.0`. `DEC013`
compares the version out of any spelling. A Hugging Face repo id, an Ollama
tag or a deployment name is not a Jev id, so neither rule reads it.

**D4. An Ask command reaches any target, and never guesses a host.**
`ask/provider.ts` becomes a provider built from a target row: the wire
shape, the endpoint and the name of the environment variable that holds the
key. A vendor with a fixed host, TypeSafe, OpenAI, Liquid, OpenRouter, LLM
Gateway and Vercel, needs nothing set. A runtime the user hosts, llama.cpp,
vLLM, Ollaya, LiteLLM, needs an endpoint, from `decisionlint.ask.endpoint` in
the editor or `--ask-endpoint` on the command line, and the shape to send is
the target's or, for a host the table does not know, `--ask-shape`. A model
id that resolves to no fixed host, such as `openai/gpt-6-luna-decisions`
with no endpoint set, is refused before anything is sent: routed by the
old rule it would carry the OpenAI key to `api.openai.com` on a request that
fails there. The endpoint is never read from `decisionlint.json`, for the
reason the key is not: a cloned repository could point the key at any host.
The reply is read against the request, in the shape that was sent, as today.

**D5. The calls that send a request are read, in every SDK the research
found.** JavaScript and TypeScript: `client.decisions.create({...})` and
`client.systemOne({...})` as requests, so an entry inside is `inRequest`;
the AI SDK's `experimental_decide` and the older `experimental_evaluate`
from `ai`, including the aliased import the docs themselves use,
`experimental_decide as decide`, which is one named exception to the rule
that an aliased import is not followed; and `*.decisionModel('<id>')` as a
model reference, with the factory naming the platform. Python: the
`langchain_typesafe` module beside `typesafe_sdk` for `Noul`, `Choice`,
`Score` and `NoulCriteria`, after the run over public code the invariant
asks for. Go: `openai.DecisionNewParams{...}`, once the SDK's struct fields
are read from its source. Rust: `typesafe-rs` and `kunobi-jev`, the same.

**D6. Messages name the platform.** "The API accepts at most 255" becomes
"TypeSafe's API accepts at most 255", or the target's name when one is
resolved. A finding about a question the AI SDK may send to a language model
through `anthropic.decisionModel(...)` says that the model may not be a
decision model at all.

### Phases

Each phase is a commit on `feat/every-provider`, gates green, and the
version is finished in one pull request with its changelog dated.

| Phase | Builds | Done when |
|---|---|---|
| P1 | `lint/targets.ts`, `lint/models.ts`, limits keyed by target, `DEC001` and `DEC013` over every spelling, `target` in the settings | A gateway id is pinned in its own spelling, a Vercel-targeted Luna request with 11 levels gets `DEC003`, an unknown target changes nothing |
| P2 | `ask/provider.ts` from the target table, `decisionlint.ask.endpoint` and `--ask-endpoint`, `--ask-shape`, per-target key variables | A check runs against a local llama.cpp with no key, and a gateway id with no endpoint sends nothing |
| P3 | The calls in D5: the AI SDK's `decisionModel` factory, LangChain's module and `NoulCriteria`, OpenAI's Go SDK unions. Rust's community crates were not added: only their constructors are documented | Each call is read as a request in its language's reader test. The public-code run for Go is still to do |
| P4 | A URL in the file resolves the target, over the model id and under the setting; the readmes, the rule pages, `CHANGELOG.md` 0.9.0 | Release gates |

### Not built, and why

- **Field names from the unshipped "Open Jev" (`options` with `legend`).**
  The project is at phase 0 with no weights and no server. Its fields are
  already foreign fields, so a question written in them is `open` and gets
  no shape finding, which is the right answer for a shape that may change.
- **A limit from a secondary source.** Cloudflare's 64 questions,
  Perplexity's 128 and OpenRouter's 200 for Luna each rest on one page that
  is not the vendor's. They go in when read from the vendor.
- **JAY.** Nothing by that name exists in any source searched. Built when
  someone supplies a URL or a model id.
- **Cutoffs of their own for any model but `jev-1.13.0`.** Reaching a
  platform is not the same as having measured it. In 1.0.1 the calibration
  set was run through the platforms, and `docs/cutoffs.md` has the numbers:
  OpenRouter's Jev answered within 0.009 of TypeSafe and is counted as
  calibrated, while Luna and Liquid's `d1` keep Jev's cutoffs, and a finding
  there keeps saying where the cutoff was set, because the set is too small
  to fit cutoffs of their own. Issue #47 grows it.

## Extended release 1: request-level rules

| Code | Name | Fires when | Notes |
|---|---|---|---|
| DEC201 | batchable | Two or more calls in one function pass the same `state` expression | Vendor cookbook: one call with 13 questions was 12.2x cheaper and 10.0x faster |
| DEC202 | ungated-answer | A Choice or Score answer is used and `confidence` is never read | Needs data flow. Highest false-positive risk in this spec |
| DEC203 | large-state | A literal state exceeds a size bound | "Large state full of irrelevant detail". Bound is proposed |
| DEC204 | option-order | A Choice whose options were never tested in another order | Vendor: Jev leans toward the first option. Cannot be checked statically. Listed so it is not forgotten |

More sources: the Vercel AI SDK's `experimental_evaluate`.

## Extended release 2: surfaces

- **Question inventory.** A tree view of every question in the workspace with
  type, model and findings. Not built and not scheduled: issue #64.
- **Rust CLI.** Decided against, under "Publishing" above. It would have been
  `crate/`, following the family pattern: the lint ported, an ignore-aware
  tree walk, and a shared fixture corpus with a parity check against the
  extension. The command line in `src/cli/` already gives CI an exit code,
  so the port was about the family pattern and not a missing feature.
- **Localization** into the family's 12 locales. Decided against, as
  AGENTS.md's "Not done" records.

## Verification

### What was verified, and how

Read from the raw documentation pages on 2026-10-04, not through a summarizer:

- Request and response shape, the three question types and their `criteria`
  shapes, and that Noul `criteria` is optional:
  `docs.typesafe.ai/api`.
- 255 options and 2 to 10 levels: the same page.
- The aliases `jev-latest` and `jev-preview`, and the vendor's own advice to
  pin a versioned id once thresholds are tuned: `docs.typesafe.ai/models`.
- The fallback advice and the bare-number levels example (score 0.55 at
  confidence 0.33 with numeric levels, 0.0 at confidence 1.0 with described
  ones): `docs.typesafe.ai/primitives/choice` and `/primitives/score`.
- Helper signatures `noul(instructions?, criteria?)`,
  `choice(instructions, criteria)`, `score(instructions, criteria)`:
  `typesafe-ai/typesafe-sdk-js` at `v0.6.0`, `src/questions.ts`.
- The `oxlint-plugin-jev` rule shape: its README.

Measured on 2026-10-04 against the 14 embedded TypeScript examples in
TypeSafe's docs pages: 28 of 28 questions found, none unreadable, no rule other
than `DEC004` fired.

### What failing on purpose found

The stand-in for the editor that the unit tests run against could not fail:
a progress notification could not be cancelled, the keychain always worked,
and a page always opened. It was given a way to fail in each, and a test was
written for what should happen. Ten tests failed. Five defects were behind
them:

- A Jev check the user cancelled reported its partial result as the whole.
- A request cut off by that cancel was reported as "Could not reach TypeSafe".
- A cancelled probe opened a report built from some of its requests.
- A probe whose report page could not be opened lost the result, after the
  requests had been paid for.
- A keychain that could not be read or written threw, and the environment key
  was not tried.

Each is fixed, and each test was seen to fail before its fix.

### Not verified

- **Where `oxlint-plugin-jev` reads its `model` setting.** The README lists the
  setting and does not show its place in the config. `DEC001` therefore fires
  on an alias written anywhere in the file and never on an absent `model`.
- **What the API does with Noul criteria keys other than `true` and `false`.**
  `DEC006` reports them as undocumented.
- **The rendered UI.** The extension runs in a real VS Code under test, both
  from source and as an installed VSIX, and the tests read its diagnostics
  through the API. Nobody has looked at the status bar, the squiggles or the
  hover on screen.
- **Open VSX and Marketplace name search beyond the first page of results.**

## Guarding against drift

- **Vendor facts live in `src/lint/limits.ts` and `src/lint/targets.ts`**
  with the page read and the date. Rules import from them and hold no vendor
  number of their own.
- **A Jev release is noticed within a week.** The `Jev release` workflow runs
  `bun run check:jev-release` every Monday and fails when `jev-latest` has
  moved off `KNOWN_VERSION`, or when the models page no longer says where it
  points. No other platform has such a watch.
- **Rule tables and the registry must agree.** `src/lint/rules.test.ts` fails
  when the code, name or default severity in this document or the README
  differs from `src/lint/rules.ts`.
- **Declared settings and code defaults must agree**, and every declared
  command must be registered. `src/extension.test.ts` holds both.

## Risks

- **R1. Vendor change.** Jev shipped on 2026-09-15 and is closed, and by
  2026-10-14 at least fifteen hosted decision APIs stood beside it, under
  "Every provider". Limits, field names and failure modes can change in any
  release of any of them. The jaggedness page is written per model version,
  so wording rules will need a version dimension. Revised 2026-10-23: what
  holds this now is the vendor numbers in `lint/limits.ts` and
  `lint/targets.ts` with the date read, `KNOWN_VERSION` and `MEASURED_ON`
  kept as two facts in AGENTS.md's invariants so a release is told apart
  from a measurement, and the weekly check under "Guarding against drift"
  that fails when `jev-latest` moves. Issue #65 is the runbook for that day.
  Only Jev is watched.
- **R2. Vendor ships validation.** TypeSafe could add question validation to
  the API or SDK. The SDK already throws on a Choice given an array.
- **R3. Name.** Decided 2026-10-04: `jevlint-le`, in the LE family. "Jev" is
  TypeSafe's product name and its trademark policy has not been checked.
  `jevlint` alone is taken on GitHub and PyPI by tools that are not this one.
  Revised 2026-10-14: `decisionlint`, standalone, the whole word on every
  surface, because the exact name wins a registry search and it was free
  everywhere. D6 in `docs/rename-to-decisionlint.md`.
- **R4. Small audience.** API access is gated, so the number of people writing
  Jev questions today is unknown.

## Open questions

- **Q2.** Should the lint target typed-decision requests in general?
  Answered 2026-10-08: yes. OpenAI's Decisions API is read and checked from
  0.5.0, under "OpenAI's Decisions API" below.
- **Q3.** What false-positive rate lets a wording rule ship on by default?
  Answered 2026-10-08, in 0.4.0: a rule that is on by default and not exact
  must be right on at least 9 of 10 of its firings on a public sample
  labelled before it ran, counting a firing on a borderline label as right,
  under "How a default is earned" above. A rule that fails goes off, and one
  that fails twice is removed. The README says the same to users under "What
  it will not tell you", and AGENTS.md adds the rule for reading a run
  against Jev: proven at two or more answers lost, advisory at 0.10 less
  sure, otherwise off.

## Sources

- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/primitives
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
- https://github.com/typesafe-ai/typesafe-sdk-js
- https://github.com/wobsoriano/oxlint-plugin-jev
