# Commercial vendors with a typed decision-model endpoint (as of 2026-10-14)

Scope: hosted, commercial APIs that take text (or images) plus typed questions and return a typed answer with probabilities. Open-source and self-hosted options, "JAY" and "Open Jev" are covered by other researchers. They appear here only where a commercial host resells them.

Method note: research was done on 2026-10-14 with web search and fetch. Primary vendor docs were fetched for OpenAI, Liquid AI and OpenRouter. Most other facts come from secondary coverage, aggregators and model listings, and are labeled as such. Primary docs for TypeSafe, Microsoft (the GitHub doc URL returned 404), Cloudflare, Perplexity and Upstage were not retrieved.

Two wire families exist:
- **TypeSafe "System One" shape**: `POST .../v1/systemone`, with `state` and a `questions` map keyed by name. Each question has a `type` of `choice` / `score` / `noul`, plus `instructions` and `criteria`. Most vendors use this shape.
- **OpenAI "Decisions" shape**: `POST /v1/decisions`, with `model`, `input` (a string, or messages with `input_text` / `input_image` parts) and a `questions` array. Each question has `type` (`predicate` / `choice` / `score`), `name` and `instructions`, plus `choices[{value, description}]` or `levels[{label, description}]`.

## Q1. Inventory of commercial providers with a decision endpoint

### Takeaway
At least 15 commercial hosted decision APIs existed by 2026-10-14. Almost all launched between 2026-09-15 and 2026-10-09. TypeSafe Jev and OpenAI Decisions are the two reference shapes. Nearly every other hosted vendor (Microsoft, Liquid, Cloudflare, Upstage, Nace, Kev on OpenRouter) copies the TypeSafe `/v1/systemone` shape. The only vendors found using a `/v1/decisions` path were OpenAI, Perplexity (one aggregator source, unverified) and the gateways that front them.

### Cited Findings

**TypeSafe AI: Jev (the reference System One shape)**
- Endpoint: `POST https://api.typesafe.ai/v1/systemone`. Model alias `jev-latest`. Question types are Choice, Score and Noul. Official SDKs are `typesafe-sdk` (Python) and `@typesafe-ai/sdk` (TypeScript). Source is secondary coverage — [MarkTechPost 2026-09-19](https://www.marktechpost.com/2026/09/19/typesafe-ai-releases-jev/), [Requesty](https://www.requesty.ai/blog/typesafe-jev-explained)
- Launched 2026-09-15. Choice takes up to 255 options. Pricing is $0.042 per 1M input tokens and output is free. Text and JSON only at launch — [explainx.ai, 2026-10-08](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026), [systemonemodels.org, as of 2026-10-12](https://systemonemodels.org/models/)
- Context is reported as 32K tokens ([explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026); [OpenRouter Jev docs](https://openrouter.ai/docs/guides/community/jev) says 32,000 including `state` plus questions). Other sources say 64K ([systemonemodels.org](https://systemonemodels.org/models/); [logeshwaran.org, Oct 2026](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html)). **The sources conflict.**
- Current version is 1.13. OpenRouter ids are `typesafe/jev-1.13` and the floating alias `~typesafe/jev-latest`. OpenRouter serves it at `POST https://openrouter.ai/api/v1/systemone`, which TypeSafe SDKs reach by changing the base URL, and also at `POST https://openrouter.ai/api/alpha/decisions` — [OpenRouter Jev docs](https://openrouter.ai/docs/guides/community/jev)
- Access conflict: some coverage describes a waitlist. jevmodel.org says the API "is now open · no waitlist · 21 Sep 2026", but that site is not clearly TypeSafe's own — [search summary of jevmodel.org](https://jevmodel.org/)

**OpenAI: Decisions API (the second reference shape)**
- `POST /v1/decisions`. The only model is `gpt-6-luna`, and no aliases or snapshots are listed. Status is public beta, and the docs say "GA in the coming weeks" — [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions) (fetched 2026-10-14)
- Request fields are `model`, `input` and `questions`. Question types:
  - `predicate`: `type`, `name`, `instructions`. Returns `probability`.
  - `choice`: adds `choices[{value, description}]`. Returns `choice`, `probabilities[{value, probability}]` and `confidence`.
  - `score`: adds `levels[{label, description}]`, indexed from 0. Returns `score`, `probabilities[{value, label, probability}]` and `confidence`.
  - A `refusal` answer type exists. Each `name` must be unique, and answers come back as an `answers` array.

  Source: [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions)
- Limits on choices, levels, questions per request or input length are **not stated in the guide**. Images are accepted only as inline base64 data URLs. Hosted image URLs and `file_id` are rejected — [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions)
- Pricing is $0.10 per 1M input tokens. Output and cache tokens are free. Regional and long-context multipliers apply — [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions). LLM Gateway quotes $0.20 per 1M above 272K input tokens and a 1.05M context — [llmgateway changelog 2026-10-12](https://llmgateway.io/changelog/openai-compatible-decisions-api)
- Minimum SDK versions are Python 3.26.0, JavaScript 7.30.0, Go 3.73.0, Ruby 0.101.0 and Java 4.78.0. ZDR and HIPAA are available, with US and EU data residency — [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions)
- Introduced at DevDay on 2026-09-29 ([Vercel](https://vercel.com/i/what-is-openai-decisions-api)). Another source says it was announced 2026-09-30 ([explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026)). Public beta opened 2026-10-06 — [Unite.AI](https://www.unite.ai/openai-releases-decisions-api-in-public-beta-powered-by-gpt-6-luna/), [aiweekly](https://aiweekly.co/alerts/openai-launches-decisions-api-public-beta-on-gpt-6-luna)
- One commentary notes that gpt-6-luna's endpoint support table omits `/v1/decisions` — [search summary](https://www.winzheng.com/en/article/openai-decisions-api-public-beta-gpt6-luna)

**Microsoft: Microsoft-Decision-1 (Foundry)**
- Endpoint is `<Foundry resource>/providers/microsoft/v1/systemone`, a System One path rather than `/openai/v1`. Auth is Entra ID or an API key. The catalog name is "Microsoft-Decision-1", version 1, and the `model` field takes your deployment name. The response `model` can differ from the deployment name you sent — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html). Microsoft's doc file is [azure-ai-docs use-foundry-models-microsoft-decision.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision.md), which returned 404 on fetch.
- Question types are `noul`, `choice` and `score`. Input is limited to 32K tokens of text or JSON, and responses carry no rationales. Pricing is $0.042 per 1M input and output is free. The base model is Qwen3.5-9B, post-trained by Microsoft, and weights are closed — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html), [The New Stack headline](https://thenewstack.io/microsoft-decision-model-foundry/)
- Public preview opened 2026-10-08 or 2026-10-09, and **sources conflict on the date** — [testingcatalog](https://www.testingcatalog.com/microsoft-launches-decision-1-model-in-foundry/), [orcarouter GA claim](https://www.orcarouter.ai/blog/microsoft-decision-1-ga-foundry-no-published-benchmarks). Orcarouter's title says "GA", while logeshwaran says "public preview". **The sources conflict.**
- Latency: an independent test measured a 459 ms median against Microsoft's claimed 85 ms — [search summary, eesel/orcarouter](https://www.eesel.ai/blog/microsoft-decision-1)

**Microsoft / Azure as a reseller of OpenAI Decisions**
- `gpt-6-luna` appears in the Azure AI Foundry catalog ("Direct from Azure", version 2026-09-22, 1.05M context) — [ai.azure.com catalog](https://ai.azure.com/catalog/models/gpt-6-luna). **No source found shows Azure exposing a `/decisions` route for it.** Microsoft instead built its own model on the System One shape. LLM Gateway routes `microsoft-decision-1` as an "Azure" provider behind its own `/v1/decisions` — [llmgateway](https://llmgateway.io/changelog/openai-compatible-decisions-api)

**Liquid AI: d1**
- Endpoint: `POST https://api.liquid.ai/decisions/v1/systemone`, authenticated with Bearer keys prefixed `liquid_`. Model ids are `d1` (paid, accepts images) and `d1:free` (text only) — [Liquid docs](https://docs.liquid.ai/lfm/models/d1) (fetched 2026-10-14)
- Request fields are `model`, `state` (text or JSON), `questions` keyed by name, and optional `images`. Question types:
  - `noul` takes `instructions`.
  - `choice` takes `instructions` and `criteria`, an object mapping option name to description.
  - `score` takes `instructions` and `criteria` as an ordered list. It returns `score`, `probabilities` keyed by level index, `confidence` and `legend`.

  `usage.output_tokens` is always 0 — [Liquid docs](https://docs.liquid.ai/lfm/models/d1)
- Limits: up to 8 images, a request body under 4.5 MB, and no remote image URLs. Maximum options, levels, questions and context are **not stated** in the docs. Third parties cite 32K or 65,536 tokens of context. The official clients are TypeSafe's own SDKs (`typesafe-sdk` and `@typesafe-ai/sdk`) — [Liquid docs](https://docs.liquid.ai/lfm/models/d1), [systemonemodels.org](https://systemonemodels.org/models/)
- d1:free launched 2026-09-29. Vision arrived 2026-10-05 and open d1-3B / d1-omni-600M weights on 2026-10-07. Pricing is $0.04 per 1M input via OpenRouter `liquid/d1`, but **Liquid's own paid rate is unpublished or disputed** — [MarkTechPost 2026-09-29](https://www.marktechpost.com/2026/09/29/liquid-ai-releases-d1-a-decision-model-that-returns-calibrated-probabilities-with-zero-output-tokens/), [systemonemodels.org](https://systemonemodels.org/models/), [aireiter](https://aireiter.com/blog/liquid-ai-d1-api-review-pricing)
- Vercel AI Gateway id: `liquid/d1` — [Vercel](https://vercel.com/i/what-is-openai-decisions-api)

**Cloudflare: Clef, Clef-flash and Clef-omni (Workers AI)**
- Workers AI id `@cf/cloudflare/clef`. Weights are Apache 2.0 on Hugging Face — [gradually.ai](https://www.gradually.ai/en/ai-models/clef/), [innfactory](https://innfactory.ai/en/ai-models/cloudflare-clef/)
- Question types are `noul`, `choice` and `score`. Up to 64 questions per request, and choice takes 2 to 255 options — [flaviocopes](https://flaviocopes.com/clef/). Reported as compatible with the Jev API — [xenospectrum](https://xenospectrum.com/en/cloudflare-clef-decision-models/)
- Prices per 1M input, output free:
  - Clef: $0.24, 64K context.
  - Clef-flash: $0.038, down from $0.09 until 2026-10-09, with 24K context.
  - Clef-omni: $0.15, accepts image, audio and video, launched 2026-10-09.

  Clef launched 2026-10-01. Clef accepts up to 4 images. Accessed through the Workers AI `run` method, path not given — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html), [systemonemodels.org](https://systemonemodels.org/models/)

**Perplexity: pplx-decider**
- Model ids `pplx-decider-v1-27b` (open-sourced under Apache 2.0, 2026-10-01) and `pplx-decider-v1.1-27b` (2026-10-06; OpenRouter id `perplexity/pplx-decider-v1.1-27b-20261006`). It is a Qwen3.8-27B fine-tune with a decision head, about 250K context, and accepts images — [explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026), [OpenRouter](https://openrouter.ai/perplexity/pplx-decider-v1.1-27b-20261006)
- Endpoint reportedly `POST https://api.perplexity.ai/v1/decisions`, with input under 262,144 tokens and **up to 128 named questions** per request. Answers are yes/no, choice or score, and pricing is input-only. Source is an aggregator, **unverified against Perplexity docs** — [search summary of llmreference/infrabase](https://www.llmreference.com/provider/perplexity-api/pplx-decider-v1-27b)
- Price conflict: $0.02 or $0.04 per 1M input — [systemonemodels.org](https://systemonemodels.org/models/), [usagepricing 2026-10-04](https://www.usagepricing.com/blueprint/activity/perplexity-ai-2026-10-04-decisions-api-launch)

**Upstage: Solar Decide and Solar Decide Flash**
- Beta since 2026-09-22, built on Solar Mini 4 with 512K context. Uses the System One schema at `/v1/systemone`, and the schema "may change before GA". Types are choice, score and yes/no. Pricing is $0.10 per 1M input from Upstage, or $0.05 on OpenRouter — [llmreference](https://www.llmreference.com/provider/upstage/solar-decide), [OpenRouter](https://openrouter.ai/ko-KR/upstage/solar-decide)
- Solar Decide Flash was released 2026-10-08 (`upstage/solar-decide-flash-20261008`) — [OpenRouter](https://openrouter.ai/upstage/solar-decide-flash-20261008)
- Headline: "AWS, Upstage and Ollama agree on a decision-model API. OpenAI hasn't signed on." The article body could not be retrieved — [The New Stack](https://thenewstack.io/decision-models-system-one/)

**Smaller hosted vendors.** All of these come from a single aggregator, [systemonemodels.org](https://systemonemodels.org/models/), with prices as of 2026-10-12, so each is unverified against the vendor.

| Vendor | Model | Types | Price per 1M input | Context | Launch |
|---|---|---|---|---|---|
| Celeris | Celeris-1 Decision | Choice/Score/Noul | $0.04 | not published | not stated |
| Fastino Labs | GLiDE | Noul/Choice/Score | $0.15 | 40K | 2026-09-30 |
| Inception | Mercury Decide | choice/score/yes-no | $0.02 | 65,536 | not stated |
| Hanzo AI | Kai 1 | Choice/Score/Noul | $0.021 | 1,024 | not stated |
| Nace.AI | Drex 1.5 | Choice/Score/Noul | $0.05 | 128K to 136K (source inconsistent) | not stated |
| Respan | Span-01 | Noul only | $0.02 | not published | not stated |
| Together AI | Tev1-4B-experimental | Choice only, 2 to 24 options, one-letter output | $0.042 | 2,048 | 2026-09-23 |
| meraGPT | Decider 1 | Choice/Score/Noul | $0.03 | 4,096 | 2026-09-22 |

- Mercury Decide is also on OpenRouter, with a free tier there. Nace.AI Drex 1.5 serves `/v1/systemone` and its 9B weights are on Hugging Face. Together AI's Tev1-4B-experimental is in early access.
- Superagent "Security-One 27B" (2026-10-05) returns unsafe probabilities for prompts, tool calls and code. Pricing is not stated — [explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026)
- Supersonic Labs "Julia 1" takes 2 to 20 options. A $0.025 hosted API was planned but **not live** as of 2026-10-08 — [explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026)

**Gateways and resellers**
- **Vercel AI Gateway** offers `https://ai-gateway.vercel.sh/v1/decisions` in the OpenAI shape, text only. Image parts are rejected, so image workflows must go to OpenAI directly. Model ids:
  - `openai/gpt-6-luna-decisions`
  - Microsoft Decision-1
  - Jev
  - Laya
  - `liquid/d1`

  The AI SDK (7.0.128 or later) exposes this as `experimental_decide` with a `decisionModel` factory. Published 2026-10-07 and updated 2026-10-12 — [Vercel](https://vercel.com/i/what-is-openai-decisions-api)
- **LLM Gateway** (2026-10-12) added `/v1/decisions` (OpenAI shape) for:
  - `gpt-6-luna-decisions`
  - `microsoft-decision-1` (32K)
  - `jev-1.13.0` (images rejected with a 400)

  It translates requests to TypeSafe's shape and back. Its `/v1/systemone` endpoint is "will be deprecated soon" and serves TypeSafe models only. Luna and Decision-1 sent to systemone get a 400 pointing to `/v1/decisions`. The limit is 600 requests per minute per organization — [llmgateway changelog](https://llmgateway.io/changelog/openai-compatible-decisions-api)
- **OpenRouter** serves both `/api/v1/systemone` and `/api/alpha/decisions`. Its decision models include Jev, `liquid/d1`, Solar Decide, pplx-decider, Mercury Decide and Kev-4B ($0.042) — [OpenRouter Jev docs](https://openrouter.ai/docs/guides/community/jev), [systemonemodels.org](https://systemonemodels.org/models/)
- **Haimaker** serves Solar Decide at `api.haimaker.ai/v1/decisions` with predicate, choice and score — [search summary](https://haimaker.ai/models/upstage/solar-decide)
- Laya (Convai Innovations, Apache 2.0) has hosted `/v1/systemone` offerings on several unaffiliated domains. One claims up to 32 questions per request plus a batch endpoint of up to 64. **It is unclear which is official** — [laya.studio](https://laya.studio/docs/api), [eesel](https://www.eesel.ai/blog/laya-ai)

### Inferences
- TypeSafe's System One shape is the de facto industry wire format. Microsoft, Liquid (which uses TypeSafe's own SDKs), Cloudflare, Upstage and Nace adopted it. OpenAI's `/v1/decisions` is the outlier, but gateways (Vercel, LLM Gateway, OpenRouter alpha) are standardizing on it as the client-facing shape and translating to systemone behind it.
- For JevLint-LE this means two dialects to lint: TypeSafe naming (`noul`, `criteria`) and OpenAI naming (`predicate`, `choices`, `levels`). Per-vendor limits also differ:

  | Limit | Values seen |
  |---|---|
  | Choice options | 255 (Jev, Clef), 24 (Tev1), 20 (Julia 1), 10 (Quyet) |
  | Questions per request | 32 (Laya hosted), 64 (Clef), 128 (pplx) |
  | Context | 1K (Kai 1) to 1.05M (Luna) |

- Model-id aliasing is inconsistent across vendors:
  - Floating aliases: `jev-latest` and `~typesafe/jev-latest`.
  - Dated snapshots: `-20261006` and `-20261008` on OpenRouter.
  - Tier suffixes: `d1:free`.
  - Deployment-name indirection: Azure.
  - Gateway prefixes: `openai/gpt-6-luna-decisions` (Vercel) versus `gpt-6-luna-decisions` (LLM Gateway) versus `gpt-6-luna` (direct).

  A linter checking model ids needs per-endpoint tables.

### Gaps
- Primary TypeSafe docs (docs.typesafe.ai) were not fetched. The Score level range (2 to 10), Noul fields and the questions-per-request cap rest on the task brief and secondary sources.
- OpenAI's guide states no limits on choices, levels, questions or input. No source gave them.
- The primary Microsoft doc returned 404, so Decision-1's per-question limits and exact field names are unverified.
- Primary docs were not found for Cloudflare Clef (REST path), Perplexity (endpoint and shape), Upstage, or the small vendors in the table.
- The New Stack article on the AWS/Upstage/Ollama API agreement: only the headline was retrievable. The spec name, date and terms are unknown.

## Q2. Do the major labs and clouds ship one?

### Takeaway
Of the requested majors, only OpenAI (Decisions) and Microsoft (Decision-1, on the System One shape) ship a hosted decision endpoint. Amazon's entry is open-weight only and is not on Bedrock. Alibaba's Qwen appears only as a base model inside other vendors' products. No evidence was found of a decision endpoint from Anthropic, Google, Mistral, Cohere, xAI, Meta, DeepSeek, AI21 or Databricks.

### Cited Findings
- **OpenAI**: yes, `/v1/decisions`. See Q1 — [OpenAI guide](https://developers.openai.com/api/docs/guides/decisions)
- **Microsoft**: yes, Microsoft-Decision-1 at `/providers/microsoft/v1/systemone`. The New Stack's headline says Microsoft "skipped OpenAI's decision model and built its own on Alibaba's Qwen" — [The New Stack](https://thenewstack.io/microsoft-decision-model-foundry/). Azure lists `gpt-6-luna` in Foundry, but no Azure Decisions route was found — [Azure catalog](https://ai.azure.com/catalog/models/gpt-6-luna)
- **Amazon**: Strands Labs released Strands-Decider 2B on 2026-10-01. It is open-weight (Apache 2.0, `pip install strands-decider`), serves a local `/v1/systemone`, and is "not on Amazon Bedrock" — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html). AWS is party to the decision-API agreement per [The New Stack headline](https://thenewstack.io/decision-models-system-one/)
- **Alibaba Qwen**: appears only as a base model, under Decision-1, Clef-flash and pplx-decider — [systemonemodels.org](https://systemonemodels.org/models/), [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html)
- **Google**: Gemma 4 appears only as a base model for open-source entries (Quyet, Surogate Rune) — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html)
- **The rest**: the aggregator listing all decision models (as of 2026-10-12) has no entry for Google, Anthropic, Mistral, Cohere, Amazon Bedrock, Azure OpenAI, xAI, DeepSeek, Alibaba, AI21 or Databricks — [systemonemodels.org](https://systemonemodels.org/models/). A targeted search for Anthropic, Gemini, Bedrock, Mistral or Cohere decision endpoints returned nothing relevant.
- **Other commercial labs that do ship one**: Perplexity, Upstage, Liquid AI, Cloudflare, Together AI and Inception. See Q1.

### Inferences
- The absence of the other majors is based on aggregator listings and a few searches, not on checking each vendor's API reference. Treat it as "not found as of 2026-10-14", not as proven absence.

### Gaps
- The changelogs of Anthropic, Google (Gemini API and Vertex), Mistral, Cohere, xAI, DeepSeek, AI21 and Databricks were not checked directly.
- Whether Azure OpenAI or the OpenAI-on-AWS/Google channels will expose `/decisions` once OpenAI goes GA is unknown.

## Q3. Specialist startups (classification-as-a-service, judge and guardrail APIs) with the same typed shape

### Takeaway
The specialists that match the shape are new decision-model startups, not older classification or guardrail vendors. The ones found are Fastino (GLiDE), Celeris, Hanzo, Nace.AI, Respan, meraGPT, Inception, Superagent and Supersonic Labs. Two are narrow:
- Respan Span-01 is Noul-only, for agent traces.
- Superagent Security-One returns unsafe probabilities, which makes it a guardrail.

### Cited Findings
- See the Q1 table, all from [systemonemodels.org](https://systemonemodels.org/models/) and [explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026).
- Fastino GLiNER2.5-Decide (2026-09-24, 340M parameters) handles "typed questions under logical rules". The hosted API exists but its price is not stated. The hosted GLiDE model is $0.15 per 1M — [explainx](https://explainx.ai/blog/top-10-decision-models-jev-perplexity-openai-open-source-ranked-2026), [systemonemodels.org](https://systemonemodels.org/models/)

### Inferences
- Established guardrail and judge vendors had not, as far as found, adopted the Choice/Score/Noul shape by 2026-10-14. That category is being filled by new entrants.

### Gaps
- Established classification and judge vendors were not individually checked for new decision endpoints. Examples include Lakera, Guardrails AI, Patronus, Galileo, Arize, Cleanlab, OpenAI Moderation and Hive.

## Q4. Which emulate or accept the OpenAI /v1/decisions or TypeSafe /v1/systemone wire format?

### Takeaway
TypeSafe-compatible (`/v1/systemone`, `state`, `questions`, `noul/choice/score`):
- Microsoft Decision-1
- Liquid d1 (uses TypeSafe SDKs)
- Cloudflare Clef (reported)
- Upstage Solar Decide
- Nace Drex
- OpenRouter
- Laya and Kev hosts

OpenAI-compatible (`/v1/decisions`):
- OpenAI
- Perplexity (unverified)
- Vercel AI Gateway
- LLM Gateway
- Haimaker
- OpenRouter (`/api/alpha/decisions`)

Gateways translate between the two.

### Cited Findings
- Microsoft: path `.../v1/systemone`, "same request shape as Decision-1, differing mainly in URL" relative to Jev — [logeshwaran.org](https://www.logeshwaran.org/2026/10/microsoft-decision-1-model-foundry.html)
- Liquid: path `/decisions/v1/systemone`. Its official clients are TypeSafe's SDKs, and it uses TypeSafe field names (`state`, `criteria`, `noul`) — [Liquid docs](https://docs.liquid.ai/lfm/models/d1)
- Cloudflare: "compatible with the Jev API" — [xenospectrum](https://xenospectrum.com/en/cloudflare-clef-decision-models/)
- Upstage: System One schema at `/v1/systemone` — [llmreference](https://www.llmreference.com/provider/upstage/solar-decide)
- Vercel: an OpenAI-compatible `/v1/decisions` fronting Luna, Decision-1, Jev, Laya and d1 — [Vercel](https://vercel.com/i/what-is-openai-decisions-api)
- LLM Gateway: `/v1/decisions` translates to TypeSafe's format. `/v1/systemone` is being deprecated — [llmgateway](https://llmgateway.io/changelog/openai-compatible-decisions-api)
- OpenRouter: both `/api/v1/systemone` (TypeSafe SDK via base URL) and `/api/alpha/decisions` — [OpenRouter Jev docs](https://openrouter.ai/docs/guides/community/jev)
- OpenAI "hasn't signed on" to the AWS/Upstage/Ollama decision-model API — [The New Stack headline](https://thenewstack.io/decision-models-system-one/)

### Inferences
- The field mapping between the two shapes is close to one-to-one:

  | TypeSafe | OpenAI |
  |---|---|
  | `noul` | `predicate` |
  | `criteria` map | `choices[{value, description}]` |
  | `criteria` list | `levels[{label, description}]` |
  | `state` | `input` |
  | question map key | `name` |

  This is inferred from the OpenAI guide and Liquid docs. A translation layer at the gateways confirms the mapping is workable, but LLM Gateway's full mapping was not published.

### Gaps
- No vendor-published field-by-field mapping between the two shapes was found. LLM Gateway mentions a migration guide but did not include it.

## Q5. Boundary: near-miss products and why they are excluded

### Takeaway
The test for inclusion: the endpoint takes typed questions and returns typed answers with per-option probabilities, and it cannot emit free text. Products that constrain the format of generated text do not meet it.

### Cited Findings
- Decision models "never generate text". They run one prefill pass, and a scoring head assigns a probability to each allowed option, so out-of-set answers are impossible — [flaviocopes on Clef](https://flaviocopes.com/clef/). Output tokens are always 0 — [Liquid docs](https://docs.liquid.ai/lfm/models/d1)
- OpenAI positions Decisions as about 10x faster than the Responses API, which shows it is a separate product from structured outputs. The speed figure is OpenAI's own claim — [Unite.AI](https://www.unite.ai/openai-releases-decisions-api-in-public-beta-powered-by-gpt-6-luna/)

### Inferences
Excluded categories:
- **Structured outputs / JSON mode / function calling** (every chat vendor). These constrain generated text to a schema but still generate tokens. They give no calibrated per-option probabilities and are billed for output.
- **Moderation endpoints** (OpenAI moderation, etc.). These use a fixed taxonomy, and the caller cannot define the questions. Superagent Security-One sits at the edge: it is decision-model-shaped but scoped to safety.
- **Rerankers and embedding similarity** (Cohere Rerank, etc.). These score relevance against documents and do not answer typed questions.
- **Logprob tricks on chat models.** These are unofficial, and their calibration is not guaranteed.
- **Together AI Tev1** is borderline. It is choice-only and emits one letter, so it is not the full Choice/Score/Noul shape.

### Gaps
- Explicit vendor statements contrasting Decisions with Structured Outputs were not retrieved beyond the speed claim.
