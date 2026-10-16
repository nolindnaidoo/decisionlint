<!-- Written by `bun run docs:cutoffs` from fixtures/validation/. Do not edit. -->

# Cutoffs and where they were measured

A model-backed check asks the model a yes-or-no question about one of your questions and reports when the probability of yes reaches a cutoff. Every cutoff was set on Jev at TypeSafe, on `jev-1.13.0`. The same cutoffs are used on every other model and platform, and this page shows how they hold up there.

The samples are small, about eight examples with the defect and twenty without per check, so read the counts as rough evidence rather than accuracy rates. A different model version can answer differently, so these numbers are true of the versions named here.

## Where the checks have been run

Each run sent every question in the corpus with the checks that apply to it, through the live API, and saved the probability each check came back with. "Difference" is the average gap from the same model where it was first measured, over the answers both runs have, and "flipped" counts the answers that land on the other side of a shipped cutoff.

| Platform | Model asked | Answered by | Shape sent | Run on | Calls | Difference | Findings say the cutoff was set elsewhere |
|---|---|---|---|---|---|---|---|
| TypeSafe | `jev-1.13.0` | Jev | TypeSafe's | 2026-10-04 | 390 | first measured here | no |
| OpenRouter | `typesafe/jev-1.13` | Jev | TypeSafe's | 2026-10-16 | 304 | 0.009 from TypeSafe, 2 of 1114 flipped | no |
| LLM Gateway | `jev-1.13.0` | Jev | OpenAI's | 2026-10-16 | 304 | 0.033 from TypeSafe, 8 of 1114 flipped | yes |
| Vercel AI Gateway | `typesafe-ai/jev` | Jev | OpenAI's | 2026-10-16 | 304 | 0.033 from TypeSafe, 8 of 1114 flipped | yes |
| OpenAI | `gpt-6-luna` | Luna | OpenAI's | 2026-10-16 | 304 | first measured here | yes |
| Vercel AI Gateway | `openai/gpt-6-luna-decisions` | Luna | OpenAI's | 2026-10-16 | 304 | 0.000 from OpenAI, 0 of 1415 flipped | yes |
| Liquid AI | `d1` | the model | TypeSafe's | 2026-10-16 | 304 | first measured here | yes |

Not run yet: LiteLLM, Eden AI, llama.cpp.

## The cutoffs

Each cell is two counts at the shipped cutoff: the examples known to have the defect that were caught, and the examples known to be fine that were flagged anyway. "7/8, 0/20" means 7 of 8 caught and none of 20 flagged.

| Check | Name | Cutoff | Jev at TypeSafe | Jev through OpenRouter | Luna | Liquid d1 |
|---|---|---|---|---|---|---|
| [DEC301](rules/DEC301.md) | model-counting | 0.96 | 9/10, 0/111 | 12/14, 0/119 | 9/14, 1/119 | 13/14, 2/119 |
| [DEC302](rules/DEC302.md) | model-undefined-boundary | 0.7 | 5/5, 0/74 | 5/5, 1/79 | 4/5, 0/79 | 4/5, 0/79 |
| [DEC303](rules/DEC303.md) | model-overlapping-options | 0.75 | 8/8, 0/19 | 7/8, 0/20 | 7/8, 0/20 | 5/8, 0/20 |
| [DEC304](rules/DEC304.md) | model-overlapping-levels | 0.6 | 5/8, 0/18 | 5/8, 0/20 | 3/8, 0/20 | 5/8, 0/20 |
| [DEC305](rules/DEC305.md) | model-label-mismatch | 0.7 | 8/8, 0/19 | 8/8, 0/20 | 8/8, 0/20 | 8/8, 0/20 |
| [DEC306](rules/DEC306.md) | model-criteria-off-topic | 0.7 | 8/8, 0/47 | 8/8, 0/50 | 8/8, 1/50 | 7/8, 0/50 |
| [DEC307](rules/DEC307.md) | model-ordered-options | 0.8 | 8/8, 0/19 | 8/8, 0/20 | 7/8, 0/20 | 7/8, 0/20 |
| [DEC308](rules/DEC308.md) | model-unordered-levels | 0.6 | 8/8, 0/18 | 8/8, 0/20 | 8/8, 1/20 | 8/8, 3/20 |
| [DEC309](rules/DEC309.md) | model-depends-on-sibling | 0.8 | 7/8, 0/9 | 7/8, 0/9 | 7/8, 0/9 | 8/8, 0/9 |
| [DEC310](rules/DEC310.md) | model-overlapping-questions | 0.15 | 4/4, 0/24 | 4/4, 0/24 | 0/4, 0/24 | 2/4, 0/24 |
| [DEC311](rules/DEC311.md) | model-answer-not-in-state | 0.85 | 3/3, 0/9 | 3/3, 0/9 | 3/3, 1/9 | 3/3, 1/9 |
| [DEC312](rules/DEC312.md) | model-orders-in-state | 0.95 | 2/2, 0/6 | 2/2, 0/6 | 2/2, 1/6 | 2/2, 1/6 |

## Notes

- 17 of the 276 corpus questions were added after the TypeSafe run and have not been sent there, so the TypeSafe column counts the rest. The OpenRouter column answers as TypeSafe does and covers all of them.
- DEC302 flags a good example through OpenRouter, where findings are counted as calibrated: `good-p7` at 0.79, against a cutoff of 0.7.
