# Decision model hosting layers, open weights, and client libraries (as of 2026-10-14)

Scope: open-weight decision models and the servers that expose them, gateways and aggregators that proxy decision endpoints, and SDKs or frameworks with a decision primitive. Research was done 2026-10-14. Dates in brackets are the source's own publish or last-updated date where one was given.

Two wire formats run through everything below. They are referred to as:

- **SystemOne format** (TypeSafe): `POST /v1/systemone`, body `{model, state, questions: {<id>: {type, instructions, criteria}}}`, types `noul` / `choice` / `score`, answers returned as a map keyed by question id.
- **OpenAI Decisions format**: `POST /v1/decisions`, body `{model, input, questions: [{type, name, instructions, choices|levels}]}`, types `predicate` / `choice` / `score`, answers returned as an ordered array, plus a `refusal` answer type.

## Which platforms pass through or re-implement /v1/decisions or /v1/systemone, and under what path and model naming?

### Takeaway
Every gateway found that carries decision models exposes at least one of the two formats, and most expose both, translating between them so that any decision model answers on either path. Model naming follows each gateway's existing `vendor/model` convention, but the vendor slug differs per gateway (`typesafe/` on LiteLLM, OpenRouter and Eden AI, `typesafe-ai/` on Vercel), and Vercel adds a third, native shape (`/v1/evaluate`, `boolean` instead of `noul`). On the self-hosted side, `/v1/systemone` is the dominant endpoint, with `/v1/decide` as a minority variant. No evidence was found for Together, Fireworks, Groq, Portkey, Bedrock, Vertex Model Garden, Hugging Face Inference Providers, TGI, SGLang, LM Studio or stock Ollama.

### Cited Findings

**Vercel AI Gateway** (three surfaces)
- Native HTTP API: `POST https://ai-gateway.vercel.sh/v1/evaluate` with `model`, `state`, `questions` (the AI SDK shape, type `boolean` / `choice` / `score`). Example model id `typesafe-ai/jev`. [2026-10-07] — [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- Decision models were previously called "evaluation models". `experimental_evaluate` and `gateway.evaluationModel()` remain as deprecated aliases with the same shapes. [2026-10-07] — [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- OpenAI-compatible: base URL `https://ai-gateway.vercel.sh/v1`, `POST /decisions`, same request and response shape as OpenAI's Decisions API, and any decision model can answer (e.g. `openai/gpt-6-luna-decisions` or `typesafe-ai/jev`). [2026-10-08] — [Vercel: OpenAI-Compatible Decisions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md)
- TypeSafe-compatible: point a TypeSafe client at `https://ai-gateway.vercel.sh/typesafe`. It accepts TypeSafe's own request and response shapes, including `noul`. [2026-10-07] — [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- Vercel's OpenAI model id is `openai/gpt-6-luna-decisions`, not `openai/gpt-6-luna`. [2026-10-08] — [Vercel: OpenAI-Compatible Decisions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md)
- Limits on the OpenAI-compatible path: `choice` takes 1 to 255 `choices` (`value` plus optional `description`), `score` takes 2 to 10 `levels` (`label` plus optional `description`), `name` is optional (an unnamed question returns `name: null`), names must be unique per request, choice values may be strings or booleans but not `true` and `"true"` together, at most 128 images, and images must be base64 data URLs. [2026-10-08] — [Vercel: OpenAI-Compatible Decisions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md)
- Decisions are not supported through Chat Completions, Responses, or the Anthropic- or Cohere-compatible endpoints. [2026-10-07] — [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- Vercel-specific extras: `providerOptions.gateway.models` for decision fallbacks (one fallback stage, which may name a language model that answers through structured output), `zeroDataRetention`, `only`, and `safety_identifier`. With the OpenAI SDKs, `providerOptions` goes through `extra_body` (Python) or a `// @ts-expect-error` line (TypeScript). [2026-10-08] — [Vercel: OpenAI-Compatible Decisions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md)
- Vercel changelog titles show that Liquid AI d1, Microsoft Decision-1, the OpenAI Decisions API and TypeSafe Jev are available on AI Gateway. [2026-10-07] — [Vercel: Decision (related links)](https://vercel.com/docs/ai-gateway/modalities/decision.md)

**LiteLLM (proxy and SDK), v1.104.2**
- Serves `POST /v1/decisions` and `POST /decisions` in the OpenAI format (`input` plus a `questions` list, returning an `answers` list), and `POST /v1/systemone` and `POST /systemone` in the SystemOne format (`state` plus a `questions` map, returning an `answers` map). Both share one internal format, so any decision model works on either route. [page last_updated 2026-10-13] — [LiteLLM v1.104.2 release notes](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)
- An existing `pass_through_endpoints` entry at `/v1/decisions` keeps serving that path, and `/decisions` serves the native route. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)
- Provider-prefixed model ids: `openai/gpt-6-luna`, `perplexity/pplx-decider-v1-27b`, `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/@cf/cloudflare/clef`, `cloudflare/@cf/cloudflare/clef-flash`, and `strands_decider/strands-decider-2B-hobson-v19` (self-hosted, needs `api_base`). The `typesafe/` and `openrouter/` prefixes are listed as providers without model names. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)
- Validation returns 400 before any upstream call for a missing `state`, a malformed question, more than 128 questions, a single-option question, or a non-JSON body. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)
- `/health` probes `mode: evaluation` deployments with a one-question decisions call, and `health_check_params` can override `state` and `questions`. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)

**OpenRouter**
- The TypeSafe SDK works against OpenRouter with base URL `https://openrouter.ai/api`. The SDK appends `/v1/systemone`, giving `POST /api/v1/systemone`. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)
- Model ids: `jev-1.13` routes to `typesafe/jev-1.13`, `jev-latest` routes to `~typesafe/jev-latest` (a tilde alias), and author-prefixed ids are used unchanged. A sample response reports `typesafe/jev-1.13-20260917`. OpenRouter adds `id`, `provider` and `usage.cost` to the response. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)
- The SDK's `client.models.list()` fails against OpenRouter because `/api/v1/models` uses OpenRouter's shape. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)
- OpenRouter lists `openai/gpt-6-luna-decisions` and the snapshot `openai/gpt-6-luna-decisions-20261006`. Search-snippet summaries say the model runs on an "OpenRouter Decisions API" rather than the chat endpoint, with up to 200 questions per request. — [OpenRouter model page](https://openrouter.ai/openai/gpt-6-luna-decisions), [snapshot page](https://openrouter.ai/openai/gpt-6-luna-decisions-20261006)
- A secondary analysis says OpenRouter added the model on October 8. — [remio.ai](https://www.remio.ai/post/gpt-6-luna-decisions-hits-openrouter-but-fast-routing-still-needs-guardrails)

**LLM Gateway (llmgateway.io)**
- `POST https://api.llmgateway.io/v1/decisions` in the OpenAI format, used with OpenAI JS SDK 7.30.0+ or Python SDK 3.26.0+ through `client.decisions.create(...)`. Model ids are unprefixed: `gpt-6-luna-decisions`, `microsoft-decision-1`, `jev-1.13.0`. — [LLM Gateway: Decisions](https://docs.llmgateway.io/features/decisions)
- `POST https://api.llmgateway.io/v1/systemone` is marked "Deprecated soon" in favour of `/v1/decisions`. It accepts `jev-1.13.0`, `jev-latest` and an optional `typesafe/` prefix. `gpt-6-luna-decisions` works only on `/v1/decisions`. — [LLM Gateway: System One](https://docs.llmgateway.io/features/system-one)
- Decision models return 400 on `/v1/chat/completions`. — [LLM Gateway: Decisions](https://docs.llmgateway.io/features/decisions)

**Eden AI**
- `POST /v3/alpha/decisions` and `GET /v3/alpha/decisions/models`. Request and response bodies match TypeSafe's (SystemOne format), but the path does not, so clients must target the path directly rather than swap a base URL. Model ids are `typesafe/jev-latest` and `typesafe/jev-preview`, and responses report the concrete version (`jev-1.13.0`). A `choice` question accepts up to 255 options, an empty score rubric returns 422, and there is no streaming. The endpoint is alpha and may change without deprecation. [published 2026-09-22, modified 2026-09-24] — [Eden AI: Decisions](https://www.edenai.co/docs/v3/llms/decisions)

**Cloudflare Workers AI (hosted Clef)**
- Clef (27B) and Clef-flash (9B) were released 2026-10-01 as `@cf/cloudflare/clef` and `@cf/cloudflare/clef-flash` ($0.24 and $0.09 per 1M input tokens). The hosted API is described as Jev/SystemOne compatible, called at the account's `/ai/run/@cf/cloudflare/clef` path with a state and typed questions. Secondary sources only. — [Developers Digest](https://www.developersdigest.tech/blog/cloudflare-clef-decision-models-2026), [flaviocopes](https://flaviocopes.com/clef/), [eWeek](https://www.eweek.com/news/cloudflare-clef-ai-decision-models-agent-workflows/)
- Clef reportedly accepts up to 64 named questions per request and has a 65,536-token context. Secondary. — [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/19913/cloudflare-clef-challenges-jev), [search summary of Clef coverage](https://www.developersdigest.tech/blog/cloudflare-clef-decision-models-2026)

**Self-hosted runtimes**
- **Ollaya** (Apache-2.0, independent, not affiliated with Ollama or TypeSafe, v0.13.0, "Edition 2026.10") runs open decision models locally on port 11435. It serves `POST /v1/systemone`, `POST /v1/decisions` and `GET /v1/models` as "TypeSafe-compatible (wire-identical)", plus a native `/api/decide` with routing info and timings. Existing Jev clients work by setting `TYPESAFE_BASE_URL=http://localhost:11435`. Model names follow Ollama tag style: `laya`, `laya:en`, `winnow:e4b`, `decider:4b`, `decider:2b-vision`, `kev:9b`, `clef`, `d1`, `clm`, `jevk5` and others. It has an `ollaya mcp` server mode. — [Ollaya wiki](https://github.com/ollaya-dev/ollaya/wiki)
- **vLLM**: a survey says a generic `/v1/systemone` decision endpoint was merged on October 8, with the opt-in flag dropped the next day, and that vLLM PRs for d1-3B, Laya and OpenAI's Decisions schema were still open, leaving vLLM "caught between two standards". [2026-10-11] — [redreamality survey](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/). A direct search for the vLLM PR returned nothing, so this rests on the one secondary source.
- **llama.cpp** (`llama-server`) serves the Clef-flash GGUF on `/v1/systemone`, per the same survey. [2026-10-11] — [redreamality survey](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- Model-specific servers (Clef server, Laya server, Strands Decider, the H2O shim) expose `/v1/systemone`. AnyJev, which wraps any OpenAI-compatible backend including Ollama and vLLM, and the AutoTrust models (JEV-27B-VL, JEV-9B, GEV-26B-Decide) expose `/v1/decide`. Liquid d1-3B (a `system_one()` call), pplx-decider and CLM ship as library calls rather than HTTP endpoints. [2026-10-11] — [redreamality survey](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- A vLLM changelog aggregator describes a prompt-only approach that makes GLM-5.3-Flash a "Jev-like" decision model by reading the first output token. This is a technique, not an endpoint. — [aiindigo vLLM changelog](https://aiindigo.com/tool/vllm/changelog) (seen only as a search snippet)
- The "Decision Engine" in vLLM Semantic Router is a routing feature, not a decision-model API, so its name collides with the category. — [vLLM Semantic Router docs index](https://docsearch.algolia.com/mcp/docs/repo/vllm-project/semantic-router) (search snippet)

**Open-weight decision models** (all from one survey [2026-10-11], [redreamality](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/), unless noted)

| Model | Org | HF repo | License | Size |
|---|---|---|---|---|
| Clef | Cloudflare | `Cloudflare/clef` | Apache-2.0 | 27B |
| Clef-flash | Cloudflare | `Cloudflare/clef-flash` | Apache-2.0 | 9.4B |
| d1-3B | Liquid AI | `LiquidAI/d1-3B` | LFM Open License 1.0 | 3.1B |
| d1-omni-600M | Liquid AI | `LiquidAI/d1-omni-600M` | LFM Open License 1.0 | 587M |
| pplx-decider-v1 / v1.1 | Perplexity | `perplexity-ai/pplx-decider-v1-27b`, `perplexity-ai/pplx-decider-v1.1-27b` | Apache-2.0 | 27B |
| H2O-Lightning-4B | H2O.ai | `h2oai/h2o-lightning-4b` | Apache-2.0 | 4B |
| Decision-2.0-Vega-27B | vLLM Semantic Router | `vllm-sr/Decision-2.0-Vega-27B` | Apache-2.0 | 0.6B to 27B family |
| JEV-27B-VL, JEV-9B, GEV-26B-Decide | AutoTrust | `autotrust/...` | Apache-2.0 | 27B, 9B, 26B-A4B |
| Laya | Convai Innovations | `convaiinnovations/laya` | Apache-2.0 | 421M |
| CLM-v0.1-8B | Contrastive-LM | `Contrastive-LM/CLM-v0.1-8B` | Apache-2.0 | 8B |
| Strands Decider 2B | Strands Labs | `StrandsAgents/strands-decider-2B-hobson-v19` | Apache-2.0 | 2B |

- The survey treats Microsoft Decision-1, Jev and OpenAI Decisions as closed hosted models and says AnyJev is a wrapper, not a model. — [redreamality survey](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- LiteLLM's id for the Perplexity model is `perplexity/pplx-decider-v1-27b` ($0.04 per 1M input tokens), consistent with the HF repo name. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)

### Inferences
- A linter cannot rely on the model id to pick the wire format. `typesafe-ai/jev` appears on Vercel's OpenAI-shaped `/decisions` path, and `openai/gpt-6-luna` appears on LiteLLM's `/v1/systemone` path. The body shape is the reliable signal: `state` plus a `questions` object means SystemOne, while `input` plus a `questions` array means OpenAI Decisions.
- There are at least three type vocabularies for the yes/no type: `noul` (TypeSafe wire), `predicate` (OpenAI wire), and `boolean` (Vercel AI SDK and Vercel `/v1/evaluate`). LangChain uses class names (`Noul`, `Choice`, `Score`). A linter rule that keys on the type string needs all of them.
- Limits differ per surface. For questions per request: 128 on LiteLLM, reportedly 64 on Clef and 200 on OpenRouter for Luna. For choice options: up to 255 on Vercel's OpenAI path and on Eden AI. Score levels run 2 to 10 on Vercel's OpenAI path, and the survey cites 0 to 5 for Jev's Score (6 levels). A limit rule probably needs to be target-specific, or default to the strictest known value.
- Model id spellings a linter may see for the same models: `jev-1.13`, `jev-1.13.0`, `jev-latest`, `jev-preview`, `typesafe/jev-*`, `~typesafe/jev-latest`, `typesafe-ai/jev`, `gpt-6-luna`, `openai/gpt-6-luna`, `gpt-6-luna-decisions`, `openai/gpt-6-luna-decisions`, `openai/gpt-6-luna-decisions-20261006`, `@cf/cloudflare/clef`, `cloudflare/clef`.

### Gaps
- No evidence was found that Together AI, Fireworks, Groq, Portkey, Cloudflare AI Gateway (as distinct from Workers AI), Amazon Bedrock, Vertex AI Model Garden or Hugging Face Inference Providers proxy either format. One targeted search for Bedrock, Vertex, Together and Groq returned only Clef coverage. Absence from search is not proof of absence.
- No evidence was found for decision endpoints in TGI, SGLang, LM Studio or stock Ollama. Ollama appears only as a backend behind AnyJev.
- The vLLM `/v1/systemone` merge (Oct 8) comes from a single secondary survey. The PR could not be located.
- OpenRouter's path and body for `openai/gpt-6-luna-decisions` (OpenAI format or its own "Decisions API") were not confirmed. The model page was seen only as a search summary.
- No primary Cloudflare doc was fetched for Clef's Workers AI request shape or limits.
- No 2026-10 Hugging Face model cards were fetched, so HF repo ids and licenses rest on the survey.

## Which client libraries have their own call shapes the linter would need to recognize?

### Takeaway
There are four distinct source-level shapes. (1) The OpenAI SDK family uses `decisions.create` with `model`, `input` and a `questions` array (Go: `client.Decisions.New`, Java: `client.decisions().create(DecisionCreateParams.builder()...)`). (2) The TypeSafe SDK family uses `systemOne` / `system_one` with `model`, `state` and a `questions` map. (3) The Vercel AI SDK uses `experimental_decide` (usually aliased as `decide`), with the `boolean` type and provider factories `*.decisionModel(...)`. (4) LangChain's `TypeSafeClassifier().invoke({"state", "questions"})` wraps questions in `Noul(...)`, `Choice(...)` and `Score(...)` constructors. No decision primitive was found in DSPy, Instructor, Pydantic AI, Mastra, Spring AI or Semantic Kernel.

### Cited Findings

**OpenAI official SDKs**
- Minimum versions: Python 3.26.0, JavaScript 7.30.0, Go 3.73.0, Ruby 0.101.0, Java 4.78.0. — [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
- Call shapes: Python `client.decisions.create(model=, input=, questions=)`, JS `client.decisions.create({model, input, questions})`, Go `client.Decisions.New(context.Background(), openai.DecisionNewParams{...})`, Java `client.decisions().create(DecisionCreateParams.builder()...)`, Ruby `client.decisions.create(model:, input:, questions:)`. — [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
- The same `decisions.create` calls work against Vercel (`baseURL: 'https://ai-gateway.vercel.sh/v1'`) and LLM Gateway (`https://api.llmgateway.io/v1`) with only a base URL change. — [Vercel](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md), [LLM Gateway](https://docs.llmgateway.io/features/decisions)
- The OpenAI guide says the API is in public beta and expected to reach GA "in the coming weeks", and that `gpt-6-luna` is the only model. — [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions)

Verbatim Python example from Vercel (the question shape the linter must parse):
```python
decision = client.decisions.create(
    model="openai/gpt-6-luna-decisions",
    input="The package arrived with a broken screen. I want my money back.",
    questions=[
        {"type": "predicate", "name": "damaged", "instructions": "Does the customer report a damaged item?"},
        {"type": "choice", "name": "queue", "instructions": "Which team should handle this ticket?",
         "choices": [{"value": "billing", "description": "Refunds and payments"}, ...]},
        {"type": "score", "name": "urgency", "instructions": "How urgent is this ticket?",
         "levels": [{"label": "low"}, {"label": "medium"}, {"label": "high"}]},
    ],
)
```
— [Vercel: OpenAI-Compatible Decisions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md) (inner lists abbreviated here)

**TypeSafe official SDKs**
- TypeScript `@typesafe-ai/sdk`: `new TypeSafeClient({ apiKey, baseURL })`, then `client.systemOne({ model, state, questions })`, read as `result.answers.<id>`. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)
- Python `typesafe_sdk`: `TypeSafeClient(api_key=..., base_url=...)`, then `client.system_one(model=..., state=..., questions={...})`, read as `result.answers["<id>"]`. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)
- Both read `TYPESAFE_API_KEY` and `TYPESAFE_BASE_URL`. — [OpenRouter: TypeSafe SDK guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)

**Community TypeSafe clients** (all state they are unofficial)
- Go: `github.com/nibir1/typesafe-go` v1.0.0, Apache-2.0, `NewClient()` reads `TYPESAFE_API_KEY`. — [pkg.go.dev](https://pkg.go.dev/github.com/nibir1/typesafe-go)
- Rust: `typesafe-rs` mirrors the official SDKs' env vars, defaults, retries and error kinds. `kunobi-jev` has `Client::new()` and reads `TYPESAFE_API_KEY`. — [docs.rs typesafe-rs](https://docs.rs/typesafe-rs), [docs.rs kunobi-jev](https://docs.rs/kunobi-jev)
- PHP: `doekos/typesafe-laravel-sdk` on Packagist. — [Packagist](https://packagist.org/packages/doekos/typesafe-laravel-sdk)
- Method names inside the Go and Rust crates were not retrieved, only constructors.

**Vercel AI SDK**
- `import { experimental_decide as decide } from 'ai'`, then `await decide({ model, state, questions })`. `model` is a string slug (`'typesafe-ai/jev'`) or `gateway.decisionModel('typesafe-ai/jev')` from `@ai-sdk/gateway`. Requires `ai` 7.0.128 or later, with `experimental_evaluate` as the name on earlier AI SDK 7 releases. [2026-10-07] — [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- Question types are `boolean` (optional `criteria: { true, false }`), `choice` (`criteria` a nonempty map of option to description), and `score` (`criteria` an array of at least two ordered labels). Optional call args are `abortSignal`, `headers`, `providerOptions`, and `maxRetries` (default 2). Exported types are `Experimental_DecisionModel` and `Experimental_DecisionState`. — [AI SDK: Decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions)
- Provider factories: `typeSafeAi.decisionModel('jev-latest')` from `@ai-sdk/typesafe-ai`, `openai.decisionModel('gpt-6-luna')` from `@ai-sdk/openai`, `anthropic.decisionModel('claude-haiku-4-5-20251001')`, `google.decisionModel('gemini-3.5-flash-lite')`. The Anthropic and Google adapters back decisions with language models and request `reasoning: 'none'` by default. — [AI SDK: Decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions)
- Behaviour: an unsupported question type fails the whole call, a refusal on any question throws `Experimental_DecisionRefusalError`, distributions must sum to one within 0.000001, and `probabilityDecimals` / `scoreDecimals` take 0 to 15. — [AI SDK: Decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions)
- The ai-sdk.dev page shows only `experimental_decide` with no bare `decide` export. — [AI SDK: Decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions)

**LangChain (Python)**
- Package `langchain-typesafe`. Imports: `from langchain_typesafe import Choice, Noul, Score, TypeSafeClassifier, NoulCriteria, ChoiceAnswer`. — [LangChain: TypeSafe provider](https://docs.langchain.com/oss/python/integrations/providers/typesafe.md)
- Call shape: `TypeSafeClassifier().invoke({"state": ..., "questions": {"<id>": Noul(instructions=...) | Choice(instructions=..., criteria={...}) | Score(instructions=..., criteria=[...])}})`. Earlier versions set `questions` on the constructor and passed only the state to `invoke`. — [LangChain: TypeSafe provider](https://docs.langchain.com/oss/python/integrations/providers/typesafe.md)
- `NoulCriteria(true=..., false=...)`. Experimental middleware `ModelRouterMiddleware(choices={...: ModelChoice(model=..., criteria=...)}, instructions=...)` and `AutoModeMiddleware(tools=[...])`, from `langchain_typesafe.experimental.middleware`. — [LangChain: TypeSafe provider](https://docs.langchain.com/oss/python/integrations/providers/typesafe.md)
- Results are accessed as `response.nouls[id].noul`, `response.choices[id].choice` / `.confidence`, and `response.scores[id].score`. — [LangChain: TypeSafe provider](https://docs.langchain.com/oss/python/integrations/providers/typesafe.md)
- A news summary dates the integration announcement to mid-September 2026. — [runtimewire](https://runtimewire.com/article/langchain-adds-jev-decision-model-agent-workflows)

**LiteLLM Python SDK**
- The release notes document the proxy routes only. No `litellm.decide`, `decision()` or similar Python function name appears. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md)

**Other**
- Vercel docs link "eve" (`eve.dev/docs/guides/decide`, `eve.dev/docs/evals/judge`) for typed questions in agent code and eval judging, and TanStack AI via `@tanstack/ai-vercel-gateway`. Their call shapes were not retrieved. — [Vercel: Decision (related links)](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- An `ollaya-decisions` agent skill and an `ollaya mcp` server exist. — [Ollaya wiki](https://github.com/ollaya-dev/ollaya/wiki)

Verbatim AI SDK example (the shape the linter already reads, included here for the `boolean` / `criteria` variants):
```typescript
const result = await decide({
  model: 'typesafe-ai/jev',
  state: 'The build failed with exit code 1.',
  questions: {
    passed: {
      type: 'boolean',
      instructions: 'Did the build succeed?',
      criteria: { true: 'exit code 0', false: 'any non-zero exit code' },
    },
  },
});
```
— [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)

### Inferences
- Call sites the linter would need to add, by language. Each is verified to exist, but whether the linter already handles any beyond `decide()` was not checked here:
  - JS/TS: `*.decisions.create({...})` (OpenAI shape), `*.systemOne({...})` (TypeSafe shape), `experimental_decide(...)` and its legacy alias `experimental_evaluate(...)`. Because the import is usually aliased, alias tracking matters.
  - Python: `*.decisions.create(...)` (keyword args), `*.system_one(...)`, and LangChain `Noul(...)`, `Choice(...)`, `Score(...)` constructors inside `invoke({...})`.
  - Go: `client.Decisions.New(ctx, openai.DecisionNewParams{...})`. The question struct field names in the Go SDK were not retrieved.
  - Java and Ruby: OpenAI builder and keyword forms (outside the linter's current language set).
- For LangChain, `criteria` is a dict for `Choice` and a list for `Score`, matching TypeSafe's wire format. That means the existing SystemOne rule logic should apply once the constructor arguments are mapped.
- AI SDK decisions can run against language models (Anthropic, Google) and gateway fallbacks can name language models. A question linted as "for Jev" may therefore actually be answered by a general LLM through structured output.

### Gaps
- No decision primitive was found in DSPy, Instructor, Pydantic AI, Mastra, Spring AI, Semantic Kernel or LlamaIndex. One combined search returned only generic comparison pages. These were not checked individually.
- No LangChain JS equivalent was found on the Python provider page.
- An official TypeSafe Go or Rust SDK was not found, and method names in the community Go and Rust crates were not retrieved.
- The exact Go SDK struct and field names for OpenAI question params (beyond `DecisionNewParams`) were not retrieved.
- Whether LiteLLM's Python SDK exposes a decision function (as distinct from the proxy) is unknown.

## Is there a de facto open spec or standardization effort for decision APIs?

### Takeaway
No formal spec or standards body was found. In practice, TypeSafe's `/v1/systemone` shape is the de facto standard among self-hosted runtimes and open models. OpenAI's `/v1/decisions` shape is the second standard among gateways, which increasingly serve both and translate between them. One open-source client repo has an issue asking to add OpenAI's API as a provider alongside SystemOne.

### Cited Findings
- A survey calls `/v1/systemone` the most common interface and a "de facto standard", says OpenAI's schema (`predicate`, `choices`, `levels`, refusal) is not a drop-in replacement, and mentions no formal spec or standards body. [2026-10-11] — [redreamality survey](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- Ollaya describes its `/v1/systemone` and `/v1/decisions` as "wire-identical" to TypeSafe. — [Ollaya wiki](https://github.com/ollaya-dev/ollaya/wiki)
- Cloudflare's Clef model card reportedly says the API is "fully compatible with Jev and SystemOne". Secondary. — [orcarouter / pasqualepillitteri coverage](https://pasqualepillitteri.it/en/news/19913/cloudflare-clef-challenges-jev)
- LiteLLM and Vercel each normalise both formats onto one internal representation. — [LiteLLM v1.104.2](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2.md), [Vercel: Decision](https://vercel.com/docs/ai-gateway/modalities/decision.md)
- LLM Gateway plans to deprecate `/v1/systemone` in favour of the OpenAI-compatible `/v1/decisions`. — [LLM Gateway: System One](https://docs.llmgateway.io/features/system-one)
- Eden AI names its endpoint after the capability (`/v3/alpha/decisions`) rather than the vendor, while keeping TypeSafe bodies. — [Eden AI: Decisions](https://www.edenai.co/docs/v3/llms/decisions)
- GitHub issue "Support OpenAI's Decisions API (POST /v1/decisions, gpt-6-luna) as a provider" is open on `schainks/system_one_client` (#1). — [GitHub issue](https://github.com/schainks/system_one_client/issues/1) (title seen in search only)
- Vercel links an "OpenResponses API" spec page, which concerns the Responses API rather than decisions. — [Vercel: OpenAI-Compatible Decisions API (related)](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions.md)
- A web search for an open decision API spec returned only unrelated results (government "Open Decisions API" from 2014, SAS and IBM ODM business-rules APIs). — [OKFestival 2014](https://2014.okfestival.org/tag/open-government/), [API Evangelist: SAS Decisions API](https://apis.apievangelist.com/store/sas-decisions-api/)

### Inferences
- The path name `/v1/decisions` is ambiguous across implementations. On OpenAI, Vercel and LLM Gateway it carries the OpenAI body. On Ollaya it is described as TypeSafe wire-identical. On LiteLLM it is the OpenAI body. A linter that infers format from a URL string should prefer body shape over path.
- Several unrelated "Decision" products (SAS, IBM ODM, Flowable, vLLM Semantic Router's Decision Engine) could cause false positives if the linter discovers files by keywords such as "decisions".

### Gaps
- No OpenAPI document published by TypeSafe or by a neutral body for the SystemOne format was located.
- The "Jev Decision Index" benchmark exists, but its governance and whether it implies a shared schema were not established.
