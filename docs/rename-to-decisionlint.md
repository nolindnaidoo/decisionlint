# Rename to DecisionLint-LE

Status: steps 1 to 3 done on 2026-10-14, steps 4 to 6 pending. Ships as 1.0.0 with the every-platform
work in `SPEC.md` under "Every provider". Nothing of 0.9.0 was published, so
its new surfaces are named right here instead of aliased.

## Decisions

- **D1. The rule codes stay `JEV`**, names included, for this pass. A code
  is an identifier in users' suppression comments, settings files and SARIF
  baselines, where nothing ever updates it. The number ranges carry the
  taxonomy: 0xx shape, 1xx wording, 2xx request, 3xx model-backed.
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

## The names

| Was | Is | Old spelling kept as |
|---|---|---|
| `JevLint-LE` | `DecisionLint-LE` | nothing, branding only |
| `jevlint-le` (npm, extension, repo) | `decisionlint-le` | a shim package and a final extension release that point here |
| `jevlint-le-mcp` | `decisionlint-le-mcp` | a shim package |
| `io.github.nolindnaidoo/jevlint-le` | `io.github.nolindnaidoo/decisionlint-le` | the old listing, marked deprecated if the registry allows |
| `jevlint-le.json` | `decisionlint-le.json` | read when the new file is absent, with a notice. Permanent |
| `jevlint-le-disable*` | `decisionlint-le-disable*` | still silences. Permanent |
| `jevlint-le.*` settings | `decisionlint-le.*` | nothing. A new extension id has new settings |
| `jevlint-le.jev.model` | `decisionlint-le.ask.models` (one id per platform) | nothing, unpublished shape |
| `jevlint-le.jev.apiKey`, `.openaiApiKey` | `decisionlint-le.ask.keys` (one per platform) | nothing |
| `jevlint-le.jev.endpoint`, `.shape` | `decisionlint-le.ask.endpoint`, `.endpointShape`, `.endpointModel` | nothing, unpublished |
| `jevlint-le.checkWithJev` | `decisionlint-le.askJev`, `askLuna`, `askOpenRouter`, `askVercel`, `askLlmGateway`, `askLiquid`, `askEndpoint` | nothing |
| `--jev`, `--jev-plan`, `--jev-model`, `--jev-max-calls`, `--jev-send-state` | `--ask`, `--ask-plan`, `--ask-model`, `--ask-max-calls`, `--ask-send-state`, and `--ask-platform` | nothing. The command line's flags are read from the help, and 1.0 is where they change |
| `--jev-endpoint`, `--jev-shape`, `JEVLINT_LE_JEV_*` | `--ask-endpoint`, `--ask-shape`, `DECISIONLINT_LE_ASK_*` | nothing, unpublished |
| `check_with_jev`, `plan_jev` | `ask_model`, `plan_ask`, with a `platform` argument | nothing. The server's tools change with its name |
| `src/jev/`, `commands/jev.ts`, `cli/jev.ts` | `src/ask/`, `commands/ask.ts`, `cli/ask.ts` | internal |

The `JEV3xx` rule names, `jev-overlapping-*`, keep their names under D1.
Every message about what a model said names the model, not Jev, which the
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
`decisionlint-le.ask.keys`, user settings only and out of Settings Sync; in
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
4. Rename the repository on GitHub, push, and update `letools-site`'s
   registry and `OUTSIDE_FLEET` in the same window.
5. Publish 1.0.0: Marketplace, Open VSX, npm (two packages), the MCP
   registry. Four authorizations, each its own.
6. Bridge the old names, each its own authorization: `jevlint-le@0.9.0` and
   `jevlint-le-mcp@0.9.0` as shims that depend on the new packages, then
   `npm deprecate` both; a final `jevlint-le` extension release that shows
   one notice naming the replacement; a second `jevlint-le` hook id in
   `.pre-commit-hooks.yaml` beside the new one.

## Outstanding

- Whether the MCP registry lets a publisher mark the old server deprecated
  with a pointer, and whether the Marketplace's deprecation banner is set by
  the publisher or granted by the VS Code team. Both are a read before step 6.
- The two demo recordings show the old name in the editor's UI and the
  command line's output. Record both again after step 3.
- The keychain of the old extension is not visible to the new one, so a
  user with a TypeSafe key stored by JevLint-LE sets it again once.
