# Public sample 2

300 questions drawn at random from public code on 2026-10-05, each read and
labelled by hand for every wording defect before any rule was run over it.
The first sample was spent when rules were fixed against it. This one was not
used to change a rule until 2026-10-23, so both runs below are measurements.
It is spent since: two rules went off because of the second run.

## How it was drawn

`scripts/draw-public-sample.ts` searched GitHub for files that call Jev,
split by language, and kept those this tool reads. It left out all 197
repositories and every question the first sample used. Of what remained, 900
files were read and 461 distinct questions with literal instructions were
found, in 162 repositories. They were shuffled with a fixed seed and taken in
order, at most three per repository, until there were 300 from 152
repositories.

By type: 155 Noul, 99 Choice, 46 Score. By file: 89 Python, 151 JavaScript
and TypeScript, 31 Go, 17 Rust, 12 JSON.

## What labels.json holds

The same as the first sample: the repository, the path, the question id, its
type, the first 16 hex digits of the SHA-256 of its instructions, and the
labels. The question text is not here, because those files carry their own
licenses. `defects` is a clear case of what a rule describes. `borderline` is
one a careful reader could call either way. Thirteen entries are `skipped`:
twelve are not in English and one is not a question.

The labels were committed on their own, before the commit that added the
scoring, so the order can be checked in the history.

Two codes were added on 2026-10-23, for rules that did not exist when the
sample was labelled: `DEC011`, a description that only repeats its name, and
`DEC012`, instructions that do not say what is being asked. The 278
questions whose text could be fetched again were read for both from the
text alone, before either rule was run over them, and those labels were
also committed on their own. The nine read questions whose files had
changed or gone carry no label for the two codes.

## What it showed

`scripts/score-public-sample.ts` ran every wording rule over the 287
questions that were read. A finding is counted wrong when it fired on a
question with neither a clear nor a borderline label for that rule.

19 of the 287 had a clear wording defect, about one in fifteen.

| | Default-on rules | Every wording rule |
|---|---|---|
| Clear defects under those rules | 8 | 20 |
| Caught | 2 | 9 |
| Findings | 7 | 27 |
| Findings that were wrong | 2 | 14 |

Rule by rule:

| Rule | Default | Clear defects | Caught | Fired | Wrong |
|---|---|---|---|---|---|
| DEC101 double-negative | on | 0 | 0 | 0 | 0 |
| DEC102 arithmetic | on | 6 | 1 | 2 | 0 |
| DEC103 date-comparison | on | 1 | 0 | 0 | 0 |
| DEC104 compound | off | 2 | 1 | 1 | 0 |
| DEC105 generation | on | 0 | 0 | 0 | 0 |
| DEC106 multi-hop | off | 0 | 0 | 2 | 2 |
| DEC107 negated-noul | off | 0 | 0 | 0 | 0 |
| DEC108 inverted-criteria | off | 0 | 0 | 0 | 0 |
| DEC109 multi-dimension-level | off | 0 | 0 | 11 | 10 |
| DEC110 degree-levels | off | 10 | 6 | 6 | 0 |
| DEC111 numeric-encoding | off | 0 | 0 | 0 | 0 |
| DEC112 undefined-boundary | on | 1 | 1 | 5 | 2 |

## What to take from it

- **The default-on rules catch a quarter of what is there.** 2 of 8. The
  first sample's 7 of 13 was the better result, and the 12 of 13 claimed
  after tuning against it does not carry over.
- **`DEC102 arithmetic` is where the misses are.** It caught 1 of 6. The five
  it missed compare quantities without a counting word: "most of the
  technologies", "more HP off them than off me", "runs 40 minutes or longer",
  "under five seconds to live", prices within "ordinary variation".
- **`DEC110 degree-levels` is the most common real defect and is off.** 10 of
  the 19 questions with a defect had it, the rule caught 6 and was wrong on
  none. The four it missed are short scales: "broken, poor, fair, good, like
  new", "Shallow, Medium, Deep", "Poorly, Well", "almost none, some, a lot".
  A rule is on only where a run against Jev showed a cost, so this is a case
  for running that experiment, not for switching it on from these numbers.
- **`DEC109 multi-dimension-level` is rightly off.** 10 of its 11 findings
  were wrong. It fires on a level that lists examples of one quality, such as
  "destructive, security-sensitive, or difficult to reverse".
- **Six rules had no real instance in 287 questions:** `double-negative`,
  `generation`, `multi-hop`, `negated-noul`, `inverted-criteria` and
  `numeric-encoding`. Four of those also had none in the first sample. Nothing here says they are wrong, only that what they look for is
  rare in public code.
- **The labels are one reader's.** A second reader would move some
  borderlines. The counts above are small, so read them as "about a quarter"
  and "most common", not as rates.

No rule was changed because of this run. The second run, below, changed two
defaults and spent the sample.

## After the changes

The same labels, scored again on 2026-10-23 with the rules as they stand at
1.0.1. 0.4.0 changed `DEC102`, `DEC110` and `DEC112` and added `DEC011` and
`DEC012` with sample 3's labels in view, and no sample those five rules were
not tuned against had scored them since. This one had not been used to
change a rule, so this run is a measurement.

The question text from the draw was gone. `scripts/refetch-public-sample.ts`
fetched the files again by repository and path and kept each question whose
instructions still hash to a label: 278 of the 287 that were read. Four files
had changed or gone, taking nine questions with them, none of which carried
a clear label.

45 of the 278 had a clear defect. 31 of those had one only `DEC011` or
`DEC012` looks for, and 26 had nothing else wrong.

| | Default-on rules | Every wording rule |
|---|---|---|
| Clear defects under those rules | 50 | 52 |
| Caught | 34 | 35 |
| Findings | 39 | 40 |
| On a borderline label | 3 | 3 |
| Findings that were wrong | 2 | 2 |

| Rule | Default at 1.0.1 | Clear defects | Caught | Fired | Borderline | Wrong |
|---|---|---|---|---|---|---|
| DEC011 description-repeats-name | on | 3 | 3 | 3 | 0 | 0 |
| DEC012 terse-instructions | on | 29 | 21 | 21 | 0 | 0 |
| DEC101 double-negative | on | 0 | 0 | 0 | 0 | 0 |
| DEC102 arithmetic | on | 6 | 2 | 3 | 1 | 0 |
| DEC103 date-comparison | on | 1 | 0 | 0 | 0 | 0 |
| DEC104 compound | off | 2 | 1 | 1 | 0 | 0 |
| DEC105 generation | on | 0 | 0 | 0 | 0 | 0 |
| DEC107 negated-noul | off | 0 | 0 | 0 | 0 | 0 |
| DEC108 inverted-criteria | off | 0 | 0 | 0 | 0 | 0 |
| DEC110 degree-levels | on | 10 | 7 | 9 | 1 | 1 |
| DEC111 numeric-encoding | off | 0 | 0 | 0 | 0 | 0 |
| DEC112 undefined-boundary | on | 1 | 1 | 3 | 1 | 1 |

### What the second run showed

- **`DEC011` and `DEC012` were right every time they fired.** `DEC012`
  caught 21 of 29. Six of its misses open with a question word and are left
  alone by design: "How urgent?", "How deep?", "how bad", "Which
  department?", "Which worker?", "What kind?". The other two are three
  words, "Check the reason." and "it is true".
- **`DEC102` caught 2 of 6 and was wrong on none.** "Runs 40 minutes or
  longer", a miss on the first run, is caught since 0.4.0. Still missed:
  "most of the nice-to-have technologies", "more HP off them than off me",
  prices within "ordinary variation", and "under five seconds to live",
  which sits in the guidance after the question, where the wording rules do
  not read.
- **`DEC110` fired 9 times: 7 caught, 1 on a borderline label, 1 wrong by
  the labels.** The borderline is "How urgent?" with Routine, Soon, Now. The
  wrong one is "How severe is this issue?" with low, medium, high, critical,
  which the 2026-10-05 labels did not mark for `DEC110`, though it is the
  shape the rule describes. The labels were written first and stand. 8 of 9
  is under 9 of 10 by one firing. The three missed are two ten-level scales
  from None to Extreme and "almost none, some, a lot, as much as possible".
- **`DEC112` fired 3 times: 1 caught, 1 on a borderline label, 1 wrong.** The
  wrong one is "is the consequence cheap to undo", where the question goes
  on to say what cheap means. 2 of 3 is under 9 of 10.
- **The labels are one reader's**, and the second reader, for `DEC011` and
  `DEC012`, is not the first. The counts are small, so read them as "every
  time" and "most", not as rates.

Read against the gate, two defaults moved in 1.1.0: `DEC110` and `DEC112`
are off. Both are proven to cost answers, so a passing run on the next
sample puts either back on. This spends the sample.
