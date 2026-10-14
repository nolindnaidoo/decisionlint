# JevLint-LE is now DecisionLint

JevLint-LE was renamed to **DecisionLint** at 1.0.0, when it grew from one
model to every platform that serves a decision model: TypeSafe's Jev,
OpenAI's Decisions API, OpenRouter, Vercel AI Gateway, LiteLLM, LLM Gateway,
Eden AI, Liquid AI and llama.cpp. Install it from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.decisionlint)
or [Open VSX](https://open-vsx.org/extension/nolindnaidoo/decisionlint), or
with `ext install nolindnaidoo.decisionlint`.

This version of JevLint-LE, 0.9.0, is the last under the old name. It lints
nothing. On startup it offers to install DecisionLint and remove itself, and
that is all it does. The last version that linted on its own was 0.8.1.

Everything written for the old name still works under the new one: a
`jevlint-le.json` is read where no `decisionlint.json` sits beside it,
`jevlint-le-disable` comments still silence, and the `JEV` rule codes are
read as their `DEC` successors. DecisionLint is a new extension id, so its
settings are `decisionlint.*` and an API key stored by JevLint-LE is set
once more.

The source, the docs and the rule pages are at
https://github.com/nolindnaidoo/decisionlint.
