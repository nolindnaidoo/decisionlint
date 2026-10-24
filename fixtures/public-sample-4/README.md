# Public sample 4

300 questions drawn at random from public code on 2026-10-24, each read and
labelled by hand before any rule was run over it. The first three samples
are spent or in view: rules were fixed against the first, `DEC110` and
`DEC112` went off because of the second, and 0.4.0 was tuned with the third
in view. This one is unspent. No rule has been changed because of it, and a
rule changed for what it shows spends it.

## How it was drawn

`scripts/draw-public-sample.ts --seed 4 --max-files 3000` searched GitHub for
files that call Jev or OpenAI's Decisions API, split by language, and kept
those this tool reads. The OpenAI callers had been read since 0.5.0 and never
sampled, and the pool of Jev callers no sample had used was running down, so
ten queries for OpenAI's SDKs, its model id and its endpoint joined the nine
for Jev. It left out all 482 repositories and every question the first three
samples used. Of what remained, about 4,100 files were found and 3,000 read,
holding 642 distinct questions with literal instructions in 239 repositories.
They were shuffled with a fixed seed and taken in order, at most three per
repository, which gave 300 from 177 repositories. A first draw read 1,200
files, as the earlier samples read 900, and found 191: that is why the files
read became a flag.

By shape: 206 in TypeSafe's, 86 in OpenAI's, 8 in the Vercel AI SDK's. The
share in OpenAI's shape, 86 of 300, is the first measure of what the pool
holds there. Without the ten OpenAI queries the draw would have held 214.
By type: 161 Noul, 92 Choice, 47 Score. By file: 85 Python, 139 JavaScript
and TypeScript, 40 Rust, 33 Go, 3 JSON.

## What labels.json holds

The same as the earlier samples: the repository, the path, the question id,
its type, the first 16 hex digits of the SHA-256 of its instructions, and the
labels. The question text is not here, because those files carry their own
licenses. It is in `../decisionlint-samples/public-sample-4.drawn.json`
beside this repository, in a directory that is not one, kept because sample
2's text was lost once and had to be rebuilt. `defects` is a clear case of
what a rule describes. `borderline` is one a careful reader could call either
way. 21 entries are `skipped`: 17 are not in English, and 4 are not questions
(an empty string, a connectivity probe, and two JSON literals written as the
instructions).

Every wording rule was labelled, `DEC011` and `DEC012` included, and `DEC110`
and `DEC112` although both are off, so that either can earn its default back
here. What the labeller counted:

- `DEC012`: clear for one or two words, and for more words that still do not
  say what is asked ("Choose a tier", "Rate the damage.", "Pick one").
  Borderline for a short question whose subject is only a pronoun ("Is it
  relevant?", "Is this ok?", "Duplicate charge?").
- `DEC110`: clear for levels that are degree words or bare labels with
  nothing to match the state against ("low, medium, high", "calm, upset,
  furious", "Low risk, Moderate risk, High risk"). Borderline for label-only
  levels that name a state ("Routine, Disrupted work, Service unavailable").
  OpenAI's shape puts the levels' labels where the drawn text keeps only the
  descriptions, so the 13 such Scores were read from their files again
  before labelling.
- `DEC011`: clear for a description that only repeats or abbreviates its key
  ("billing": "b", "yes": "it does"). Borderline for one that restates the
  key in a sentence ("blue": "The sky is blue.").

The labels were committed on their own, before the commit that added the
scoring, so the order can be checked in the history.

## What it showed

`scripts/score-public-sample.ts` ran every wording rule over the 279
questions read, with the rules as they stand at 1.1.0. A finding is counted
wrong when it fired on a question with neither a clear nor a borderline label
for that rule.

56 of the 279 had a clear defect, 70 defects between them. 47 of the 56 have
instructions that do not say what is asked, and 33 have nothing else wrong.
35 of the 56 are in test, probe or demo code.

| | Default-on rules | Every wording rule |
|---|---|---|
| Clear defects under those rules | 51 | 70 |
| Caught | 34 | 42 |
| Findings | 38 | 47 |
| On a borderline label | 2 | 2 |
| Findings that were wrong | 2 | 3 |

Rule by rule, leaving out the rules that had no clear case and no finding:

| Rule | Default | Clear defects | Caught | Fired | Borderline | Wrong |
|---|---|---|---|---|---|---|
| DEC011 description-repeats-name | on | 2 | 0 | 1 | 0 | 1 |
| DEC012 terse-instructions | on | 47 | 33 | 35 | 2 | 0 |
| DEC101 double-negative | on | 0 | 0 | 1 | 0 | 1 |
| DEC102 arithmetic | on | 2 | 1 | 1 | 0 | 0 |
| DEC104 compound | off | 1 | 0 | 1 | 0 | 1 |
| DEC110 degree-levels | off | 17 | 7 | 7 | 0 | 0 |
| DEC112 undefined-boundary | off | 1 | 1 | 1 | 0 | 0 |

Labelled, with no rule firing: `DEC103` 1 borderline, `DEC105` 3 borderline,
`DEC107` 2 borderline.

### DEC012, measured

This is the first sample `DEC012` was not tuned against: its threshold came
from sample 3's labels. 47 clear cases, 33 caught, 35 firings, of which 33
are on a clear case and 2 on a borderline one ("Duplicate charge?", "Serves
healthcare?"). None wrong. The 14 misses are the two shapes sample 3 named:
a two-word question that opens with a question word, which the rule leaves
alone by design ("How bad?", "How wet?", "How angry?", "How professional?"),
and three or more words that say nothing ("Choose a tier", "Choose a
department", "Rate the damage.", "Choose next step", "Shared rules. Pick
one."). Read against the gate a wording rule stays on by, 35 of 35.

### The three findings wrong by the labels

Each is a case the rule describes and the labeller did not mark. The labels
stand, as they did for `DEC110` on sample 2: they were written first, and a
label changed after the rule ran would measure nothing.

- `DEC011` on "bo": "Bo", among "ada": "Ada, the speaker" and "none":
  "Neither".
- `DEC101` on "A pet found injured or dead, described respectfully, is NOT
  inappropriate.", the second sentence of a moderation question.
- `DEC104`, off, on "would feel helpful and would not interrupt the speaker".

Read against the gate as written, `DEC101` is 0 of 1 on this sample. `DEC011`
is an exact rule and outside the gate. Whether one firing on one sample
moves a default is a decision that spends the sample, and it was not made
here.

### DEC110 and DEC112, off since 1.1.0

`DEC110` fired 7 times and was right 7 times: "calm, upset, furious", "Low
risk, Moderate risk, High risk", "Low, High", "low, medium, high", "None,
Moderate, Severe", "Low, Medium, High", "bad, okay, great". It missed 10 of
its 17 clear cases. Eight are Scores in OpenAI's shape whose levels carry a
label and no description ("low, mid, high", "dry, damp, soaked", "weak,
moderate, strong", "calm, annoyed, furious"): the rule reads the
descriptions, all absent, and never the labels beside them. That is issue
#73. The other two are "Still or minimal effort, Ordinary effort, Vigorous
effort, Very strenuous effort" and "calm, frustrated, angry", where "calm,
upset, furious" was caught.

`DEC112` fired once, on "Is there a big amount of gore in this movie?", the
one clear case, and was right. On sample 2 it was wrong on "cheap" with its
line drawn in the next sentence; nothing like that is here.

7 of 7 and 1 of 1 both pass the gate's ratio, on few firings. Putting either
back on by default because of this run spends the sample, which is the same
decision as for `DEC101` above, and was not made here.

## What to take from it

- **`DEC012` holds on questions it was not tuned against.** 0 wrong in 35,
  33 of 47 caught, and the misses are the shapes it leaves alone on purpose.
- **The pool is thin and the OpenAI queries matter.** 3,000 files for 300
  questions, where sample 3 had 276 from 900. 86 of the 300 are in OpenAI's
  shape, and nearly all of those are test suites and SDK conformance checks.
- **OpenAI's shape puts the levels' meaning in the labels.** 13 of the 15
  OpenAI Scores here describe no level at all. A rule that reads descriptions
  reads nothing there.
- **The defects in public code are still terse instructions and bare
  levels.** 47 of the 56 clear cases say nothing in the instructions, and
  35 of the 56 are in test or demo code.
- **The labels are one reader's.** Three findings the rules made are right
  by the rules' own words and were missed by the reader. The counts are
  small, so read them as "every time" and "nearly all", not as rates.
