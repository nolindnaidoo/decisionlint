# Rename to DecisionLint

Status: steps 1 to 7 done on 2026-10-14. Step 6's site change is in
letools-site pull request #56, and merging it is the deploy, its own
authorization. Step 8 is optional and the owner's. Shipped as 1.0.0 with
the every-platform work in `SPEC.md` under "Every provider". Nothing of
0.9.0 was published, so its new surfaces are named right here instead of
aliased.

## Decisions

- **D1. Superseded by D7.** The rule codes were to stay `JEV` because a
  code is an identifier in users' suppression comments, settings files and
  SARIF baselines, where nothing ever updates it.
- **D2. The verb is `ask`, and the editor has one command per platform.**
  `--jev` and `jev.*` were named after one model and reach nine platforms.
  On the command line and in the server the platform is an argument; in
  the editor it is the command: Ask Jev, Ask Luna, Ask via OpenRouter, and
  so on, each with its own key.
- **D3. One release, 1.0.0, under the new name.** `jevlint-le` 0.8.1 stays
  the last real release under the old name. A final `jevlint-le` 0.9.0 on
  npm and the Marketplace is a shim that points here.
- **D4. The repository is renamed in place.** GitHub redirects clones, web
  links, the rule pages and `uses:` in workflows.
- **D5. Superseded by D6.** For a few hours on 2026-10-14 the extension kept
  its install identity, `nolindnaidoo.jevlint-le`, on the reasoning that a
  new id is a new listing at zero installs. The listing had 6 installs,
  which a final release points across in one line.
- **D6. The product is DecisionLint, standalone, the whole word on every
  surface.** A registry search ranks the exact name above a suffixed one
  whatever the install counts (the Marketplace puts an "EnvSync" with 3
  installs above EnvSync-LE with 16), nothing on a registry can keep
  another publisher off a name, and `decisionlint` was free on npm, GitHub,
  both extension registries and the `.com`, `.dev`, `.io` and `.ai` domains
  on 2026-10-14. So the way to be the result for "DecisionLint" is to be
  the exact name first, with the installs and the age. The suffix was the
  one thing in the way. The tool stays the author's and is listed on
  letools.dev, outside the family's naming. Decided on 2026-10-14.
- **D7. The rule codes are `DEC`, and the model-backed rules are `model-*`.**
  With D6 nothing under the new name is published, so this is the last cheap
  moment, and the base is 6 installs and 0.8.1 on npm. The numbers stay, so
  the taxonomy stays: 0xx shape, 1xx wording, 2xx request, 3xx model-backed.
  What D1 protected is kept another way: the old codes and names are read
  for ever in comments, `rules`, `ignore` and `explain_rule`, every finding
  is written with the new code, and each old rule page stays as a pointer.
  A SARIF baseline is renamed once. Decided on 2026-10-14.

## The names

| Was | Is | Old spelling kept as |
|---|---|---|
| `JevLint-LE` | `DecisionLint` | nothing, branding only |
| `jevlint-le` on npm | `decisionlint` | a shim package |
| `jevlint-le-mcp` | `decisionlint-mcp` | a shim package |
| `nolindnaidoo/jevlint-le`, the repository | `nolindnaidoo/decisionlint` | GitHub redirects |
| `nolindnaidoo.jevlint-le`, the extension id | `nolindnaidoo.decisionlint` | a final 0.9.0 of the old extension with one notice |
| `io.github.nolindnaidoo/jevlint-le` | `io.github.nolindnaidoo/decisionlint` | the old listing, marked deprecated |
| `jevlint-le.json` | `decisionlint.json` | read when the new file is absent, with a notice. Permanent |
| `jevlint-le-disable*` | `decisionlint-disable*` | still silences. Permanent |
| `JEV000` to `JEV312` | `DEC000` to `DEC312`, the same numbers | read for ever in comments, `rules`, `ignore` and `explain_rule`; each old page points at the new. Permanent |
| `jev-counting` and the other eleven 3xx names | `model-counting` and so on | read for ever where a rule is named by name. Permanent |
| `jevlint-le.*` settings and command ids | `decisionlint.*` | nothing. A new extension id has new settings |
| `jevlint-le.jev.model` | `decisionlint.ask.models` (one id per platform) | nothing, unpublished shape |
| `jevlint-le.jev.apiKey`, `.openaiApiKey` | `decisionlint.ask.keys` (one per platform) | nothing. The keychain is per extension id, so each key is set once more |
| `jevlint-le.jev.endpoint`, `.shape` | `decisionlint.ask.endpoint`, `.endpointShape`, `.endpointModel` | nothing, unpublished |
| `jevlint-le.checkWithJev` | `decisionlint.askJev`, `askLuna`, `askOpenRouter`, `askVercel`, `askLlmGateway`, `askLiquid`, `askEndpoint` | nothing |
| `--jev`, `--jev-plan`, `--jev-model`, `--jev-max-calls`, `--jev-send-state` | `--ask`, `--ask-plan`, `--ask-model`, `--ask-max-calls`, `--ask-send-state`, and `--ask-platform` | nothing. The command line's flags are read from the help, and 1.0 is where they change |
| `--jev-endpoint`, `--jev-shape`, `JEVLINT_LE_JEV_*` | `--ask-endpoint`, `--ask-shape`, `DECISIONLINT_ASK_*` | nothing, unpublished |
| `check_with_jev`, `plan_jev` | `ask_model`, `plan_ask`, with a `platform` argument | nothing. The server's tools change with its name |
| the `jevlint-le` pre-commit hook id | `decisionlint` | a second `jevlint-le` id in `.pre-commit-hooks.yaml`, in every tag from 1.0.0, because pre-commit reads the file at the tag |
| `src/jev/`, `commands/jev.ts`, `cli/jev.ts` | `src/ask/`, `commands/ask.ts`, `cli/ask.ts` | internal |

The `DEC3xx` rules are named `model-*` under D7. Every message about what a model said names the model, not Jev, which the
0.9.0 work already does.

## The platforms a command can ask

One command per platform whose host the table in `src/lint/targets.ts`
publishes, with the model id it sends by default and the key it reads:

| Command | Platform | Default model | Key |
|---|---|---|---|
| Ask Jev | TypeSafe | `jev-1.13.0`, the measured version | `TYPESAFE_API_KEY` |
| Ask Luna | OpenAI | `gpt-6-luna` | `OPENAI_API_KEY` |
| Ask via OpenRouter | OpenRouter | `typesafe/jev-1.13` | `OPENROUTER_API_KEY` |
| Ask via Vercel AI Gateway | Vercel | `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` |
| Ask via LLM Gateway | LLM Gateway | `jev-1.13.0` | `LLM_GATEWAY_API_KEY` |
| Ask Liquid d1 | Liquid AI | `d1` | `LIQUID_API_KEY` |
| Ask the Model at My Endpoint | a host the user runs | `ask.endpointModel` | the shape's, or none |

Each key is held three ways, as the TypeSafe key was: typed into
`decisionlint.ask.keys`, user settings only and out of Settings Sync; in
the keychain through the platform's own **Set ... API Key** command, one per
slot, because a picker would need the editor mock to grow for one dialog;
or in the environment variable the platform names. **Clear API Keys**
removes every slot. The probe asks in Jev's shape only and so runs through
Ask Jev, Ask via OpenRouter, Ask via LLM Gateway, Ask Liquid d1, or the
endpoint when its shape is `typesafe`.

## Sequence

1. Mechanical rename of every identifier, directories included, with the
   two permanent aliases and a test for each.
2. The `ask` verb: flags, settings, commands, tools, messages, with the
   per-platform commands and keys.
3. 1.0.0: the version in its four files, `CHANGELOG.md` with an old-to-new
   table, the readmes, `AGENTS.md`, `SPEC.md`, the rule pages. Every gate,
   the installed VSIX and the integration tests included.
4. Rename the repository on GitHub and push. Done on 2026-10-14, twice: to
   `decisionlint-le` in the morning and to `decisionlint` under D6, and
   both old URLs redirect. The site's registry, `letools-site`, stays on
   the old names until step 6: its entries link to the published listings
   and its sync reads their download counts, so a registry naming
   `decisionlint` before it is published would link to pages that do not
   exist. It moves with the first publish, together with the local
   directory, which the site's sync reads by the registry id.
5. Publish 1.0.0: npm (two packages) and then the MCP registry in one
   workflow run, the Marketplace, Open VSX. Three runs, each its own
   authorization.
6. The site and the local directory: `letools-site` lists `decisionlint`
   as the author's, outside the family, and the directory is renamed to
   match. The site's deploy is a push to its `main`, its own authorization.
   Done on 2026-10-14 as letools-site pull request #56: the registry entry,
   the regenerated facts and demo, the ordering, the fleet lists and ledger,
   the home copy, and a redirect from `/tools/jevlint-le`, which the 0.8.1
   listing links. The directory is `decisionlint`.
7. Bridge the old names, each its own authorization: `jevlint-le@0.9.0`
   and `jevlint-le-mcp@0.9.0` as shims that depend on the new packages at
   `^1`, then `npm deprecate` both; a final `nolindnaidoo.jevlint-le`
   0.9.0 whose only act is one notice naming `nolindnaidoo.decisionlint`,
   on the Marketplace and Open VSX, and a comment in the VS Code team's
   "Deprecated extensions" discussion, which is how a listing gets the
   deprecation banner; the old MCP listing marked deprecated through
   `PATCH /v0.1/servers/{name}/status`, which the registry grants the
   namespace's publisher. Built on 2026-10-14: `shim/npm`, `shim/mcp` and
   `shim/extension`, proven by `scripts/e2e-shims.js`, published by
   `release-shim.yml` with one opt-in per target, in the order npm,
   deprecate, Open VSX, Marketplace, registry. The publisher binary's
   `status` command is the route confirmed against the raw docs.
8. Reservations, each its own authorization and optional: the GitHub
   organisation `decisionlint` and the domain `decisionlint.dev`, both of
   which only the owner can create.

## Outstanding

- The two demo recordings are taken again under D6, because the problems
  panel names the diagnostic source and the command line names the
  command.
