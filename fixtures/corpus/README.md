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
state. The set reached the size the same day: 16 with each defect, 17 for
`DEC307` and 22 for `DEC311`, and 40 or more without.

## How a cutoff is fit

Fixed on 2026-10-24, with the runs in hand: `fitCutoff` in
`src/docs/calibration.ts`. Jev's cutoffs were set by hand until 2026-10-31,
when the run on `jev-1.14.0` was fit by the same rule.
A cutoff is a hundredth from 0.01 to 0.99 that flags none of the good
examples and catches at least six in ten of the bad ones, the floor Jev's
were held to from the first run. It sits halfway between the highest
good example and the lowest bad one above it, so an example on either side
has to cross half the gap to move it, unless that midpoint catches too few,
when it is the lowest hundredth above the good examples. Where no hundredth
qualifies, the check has no cutoff on that model and is not asked of it.
`src/ask/reviews.test.ts` holds each model's table in `src/ask/cutoffs.ts` to
exactly what the rule fits on its run.

One label moved after the runs. `good-c3` offered the slow, medium and fast
lanes as a Choice, which is the ordered-options defect by `DEC307`'s own
definition, and all three models rated it so. It is `jev307-17` now, with
its saved numbers under that id, and `good-c21` holds the good Choice count
at 40. Every other label stands, including the good examples a model rates
highly: those are what keep a check off that model.

## scores.json

Generated. Per rule: how many bad questions it caught, how many good ones it
fired on, and the id of every miss and every false firing. Regenerate with
`bunx vitest run src/lint/corpus.test.ts -u` and read the diff before
committing it.
