## What and why

<!-- One paragraph. Link the issue. -->

## Checks

<!-- Delete the lines that do not apply. The rules behind each are in AGENTS.md. -->

- [ ] `bun run typecheck && bun run lint && bun run test` pass.
- [ ] A new or changed rule has its three tests (it fires, it does not fire, it stays quiet on a value it cannot read), a pair in `fixtures/rule-examples.json`, and `bun run docs:rules` has been run.
- [ ] A reader or rule change was run over public code before it was trusted, and the pull request says what that run found.
- [ ] A corpus addition is in your own words, never copied from another project or from vendor docs, and `fixtures/corpus/scores.json` was regenerated and its diff read.
- [ ] A change to a model-backed check or a cutoff ran `bun run docs:cutoffs`.
- [ ] A new language or platform updated the issue forms' dropdowns, and a new rule the test in `src/issue-forms.test.ts` holds them to.
- [ ] If this finishes a version, the `CHANGELOG.md` heading is dated here, as `## <version> — <date>`, and the version in `npm/package.json` and `mcp/package.json` was not edited by hand (`bun run build:npm` writes it).
- [ ] AGENTS.md was updated in this change if the change alters what it documents.
