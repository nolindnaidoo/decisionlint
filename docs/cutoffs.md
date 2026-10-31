<!-- Written by `bun run docs:cutoffs` from fixtures/validation/. Do not edit. -->

# Cutoffs and where they were measured

A model-backed check asks the model a yes-or-no question about one of your questions and reports when the probability of yes reaches a cutoff. Jev's cutoffs were fit on `jev-1.14.0` at TypeSafe on 2026-10-31, and a route measured to answer as that run does uses them. Luna's and Liquid d1's were fit on their own runs over the whole set on 2026-10-24. All follow one rule: a cutoff is a hundredth that flags none of the good examples and catches at least six in ten of the bad ones, and it sits halfway between the highest good example and the lowest bad one above it. Where no such cutoff exists the check is not asked of that model, and the notes name the example in the way. Every other model and route is judged by its family's cutoffs, or Jev's, and its findings say so.

A cutoff is fit on at least 16 examples with the defect and 40 without, per check and per model, a size fixed on 2026-10-24 before the set was grown to it: none of 40 flagged bounds the false-flag rate at about 1 in 14 with 95% confidence, and 16 place the catch count in steps of about 6 points. Where a cell has fewer, read the counts as rough evidence rather than accuracy rates. A different model version can answer differently, so these numbers are true of the versions named here.

## Where the checks have been run

Each run sent every question in the corpus with the checks that apply to it, through the live API, and saved the probability each check came back with. "Difference" is the average gap from the same model where it was first measured, over the answers both runs have, and "flipped" counts the answers that land on the other side of a shipped cutoff.

| Platform | Model asked | Answered by | Shape sent | Run on | Calls | Difference | Findings say the cutoff was set elsewhere |
|---|---|---|---|---|---|---|---|
| TypeSafe | `jev-1.14.0` | Jev | TypeSafe's | 2026-10-31 | 556 | first measured here | no |
| OpenRouter | `typesafe/jev-1.14` | Jev | TypeSafe's | 2026-10-31 | 556 | 0.012 from TypeSafe, 12 of 2587 flipped | no |
| LLM Gateway | `jev-1.14.0` | Jev | OpenAI's | 2026-10-31 | 556 | 0.041 from TypeSafe, 21 of 2587 flipped | yes |
| Vercel AI Gateway | `typesafe-ai/jev` | Jev | OpenAI's | 2026-10-31 | 556 | 0.041 from TypeSafe, 26 of 2587 flipped | yes |
| OpenAI | `gpt-6-luna` | Luna | OpenAI's | 2026-10-24 | 556 | first measured here | no |
| Vercel AI Gateway | `openai/gpt-6-luna-decisions` | Luna | OpenAI's | 2026-10-16 | 304 | 0.000 from OpenAI, 0 of 1415 flipped | no |
| Liquid AI | `d1` | the model | TypeSafe's | 2026-10-24 | 556 | first measured here | no |

Not run yet: LiteLLM, Eden AI, llama.cpp.

## The cutoffs

Each cell is the cutoff the model is judged by and two counts at it: the examples known to have the defect that were caught, and the examples known to be fine that were flagged anyway. "0.75: 7/8, 0/20" means a cutoff of 0.75 caught 7 of 8 and flagged none of 20. "not asked" means no cutoff fit on that model, and the notes say what stood in the way.

| Check | Name | Jev at TypeSafe | Jev through OpenRouter | Luna | Liquid d1 |
|---|---|---|---|---|---|
| [DEC301](rules/DEC301.md) | model-counting | 0.96: 15/16, 0/159 | 0.96: 15/16, 0/159 | not asked | not asked |
| [DEC302](rules/DEC302.md) | model-undefined-boundary | 0.84: 15/16, 0/79 | 0.84: 14/16, 1/79 | 0.72: 12/16, 0/79 | 0.45: 14/16, 0/79 |
| [DEC303](rules/DEC303.md) | model-overlapping-options | not asked | not asked | not asked | 0.59: 12/16, 0/40 |
| [DEC304](rules/DEC304.md) | model-overlapping-levels | 0.29: 14/16, 0/40 | 0.29: 14/16, 0/40 | not asked | 0.15: 14/16, 0/40 |
| [DEC305](rules/DEC305.md) | model-label-mismatch | 0.66: 16/16, 0/40 | 0.66: 16/16, 0/40 | 0.34: 16/16, 0/40 | 0.37: 16/16, 0/40 |
| [DEC306](rules/DEC306.md) | model-criteria-off-topic | 0.52: 16/16, 0/90 | 0.52: 16/16, 0/90 | not asked | 0.36: 15/16, 0/90 |
| [DEC307](rules/DEC307.md) | model-ordered-options | 0.64: 17/17, 0/40 | 0.64: 17/17, 0/40 | 0.35: 17/17, 0/40 | 0.47: 17/17, 0/40 |
| [DEC308](rules/DEC308.md) | model-unordered-levels | 0.5: 16/16, 0/40 | 0.5: 15/16, 0/40 | 0.88: 15/16, 0/40 | 0.89: 15/16, 0/40 |
| [DEC309](rules/DEC309.md) | model-depends-on-sibling | 0.75: 16/16, 0/40 | 0.75: 15/16, 0/40 | 0.48: 16/16, 0/40 | 0.76: 16/16, 0/40 |
| [DEC310](rules/DEC310.md) | model-overlapping-questions | 0.12: 15/16, 0/82 | 0.12: 15/16, 0/82 | 0.01: 16/16, 0/82 | 0.03: 16/16, 0/82 |
| [DEC311](rules/DEC311.md) | model-answer-not-in-state | not asked | not asked | not asked | 0.98: 18/22, 0/72 |
| [DEC312](rules/DEC312.md) | model-orders-in-state | 0.93: 15/16, 0/40 | 0.93: 15/16, 0/40 | 0.97: 14/16, 0/40 | not asked |

## Notes

- DEC301 is not asked of Luna. The highest good example is `good-h32` at 0.99, and no cutoff sits above it.
- DEC303 is not asked of Luna. The highest good example is `good-c12` at 0.96, and the lowest cutoff above it, 0.97, catches 9 of the 16 examples with the defect, where a cutoff needs 10.
- DEC304 is not asked of Luna. The highest good example is `good-50` at 0.00, and the lowest cutoff above it, 0.01, catches 8 of the 16 examples with the defect, where a cutoff needs 10.
- DEC306 is not asked of Luna. The highest good example is `good-h39` at 1.00, and no cutoff sits above it.
- DEC311 is not asked of Luna. The highest good example is `req-state-4/names_trail` at 1.00, and no cutoff sits above it.
- DEC301 is not asked of Liquid d1. The highest good example is `good-h19` at 0.99, and the lowest cutoff above it, 0.99, catches 8 of the 16 examples with the defect, where a cutoff needs 10.
- DEC312 is not asked of Liquid d1. The highest good example is `req-state-7` at 0.99, and no cutoff sits above it.
- DEC302 flags a good example through OpenRouter, where findings are counted as calibrated: `good-p7` at 0.87, against a cutoff of 0.84.
