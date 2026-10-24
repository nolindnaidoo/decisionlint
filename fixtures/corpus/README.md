# Corpus

Questions the wording rules are scored against, written for this repo.
Nothing here is linted as source: `src/lint/corpus.test.ts` reads
`questions.json`, runs every wording rule over every question, and holds the
result to `scores.json`.

## questions.json

Each entry has an `id`, the `question`, and `defects`: the wording rules that
should fire on it. An empty list means the question is good, one a careful
author would be content to send.

The bad questions include ones the rules are known to miss, on purpose. A
corpus that only held what the patterns already match would report a perfect
score and mean nothing. The good questions include ordinary uses of the words
the rules look for: "and" between two nouns, "before" with nothing after it,
a single negation, a ticket number that looks like a hex colour.

Entries whose id contains `-h` are a second batch, written before a round of
rule changes and scored blind first. Do the same for the next batch: write
it, score it, record the number, and only then change a rule.

When a rule is wrong on a real question, add that question here in your own
words with the right label, then fix the rule.

## How big the set has to be for a cutoff

Fixed on 2026-10-24, before any example was added for it: a model-backed
check's cutoff is fit on at least 16 examples with the defect and 40 without,
per check and per model. A cutoff that flags none of 40 good examples is
wrong on at most about 1 in 14 of them with 95% confidence, by the rule of
three, and 16 bad examples place the catch count in steps of about 6 points.
Fewer than that and a cutoff is one outlier away from moving, which is why
Luna and Liquid's `d1` kept Jev's cutoffs at 1.0.1. A set grown until the
numbers look right would be tuned, not measured, so the size comes first and
the examples after.

On that date the checks stood at, with the defect and without: `DEC301`
14 and 119, `DEC302` 5 and 79, `DEC306` 8 and 50, each of `DEC303`,
`DEC304`, `DEC305`, `DEC307` and `DEC308` 8 and 20, `DEC309` 8 and 9,
`DEC310` 4 pairs and 24, `DEC311` 3 and 9, `DEC312` 2 and 6. The good
examples are shared: a clean question counts for every check that applies to
it, so growing the set means clean Choices with three or more described
options, clean Scores, clean questions with siblings, and requests with a
state.

## scores.json

Generated. Per rule: how many bad questions it caught, how many good ones it
fired on, and the id of every miss and every false firing. Regenerate with
`bunx vitest run src/lint/corpus.test.ts -u` and read the diff before
committing it.
