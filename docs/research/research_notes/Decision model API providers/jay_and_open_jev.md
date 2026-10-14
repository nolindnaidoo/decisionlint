# JAY and Open Jev (typed decision-model APIs), as of 2026-10-14

Research window: searches and fetches run 2026-10-14. Every finding below comes from a page fetched or a search result returned that day. Dates are the page's own dates where it gave one.

## Who makes JAY and Open Jev, and where are their docs/repos?

### Takeaway
"Open Jev" is not one product. It is a generic name used by at least nine unrelated community projects (GitHub repos and Hugging Face models) that reproduce the interface of TypeSafe's Jev. None of them is official, and TypeSafe's docs do not mention any of them. No decision-model system named "JAY" (or Jay, J.A.Y.) could be found in any source. The closest name matches are "Jebadiah" (an open decision-model family), AutoTrust's "JEV-9B/JEV-27B-VL", and Jev itself.

### Cited Findings

TypeSafe's own docs
- docs.typesafe.ai lists Jev, System One, the Choice/Score/Noul primitives, `/confidence`, `/patterns`, and quickstart pages. The strings "JAY", "Jay", "Open Jev" and "OpenJev" do not appear on the docs landing page (fetched 2026-10-14) — [docs.typesafe.ai](https://docs.typesafe.ai)
- TypeSafe announced Jev on 2026-09-15 as the first "System One" model — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- Jev is closed-weight and hosted only. TypeSafe "hasn't released Jev's weights or its RLCD training method" (page updated 2026-10-14) — [llmconfigurator](https://llmconfigurator.com/en/guides/decision-models/open-models-beyond-ollama). Another page says the same: Jev is "a hosted closed-weight API and there is nothing to download or self-host" (updated September 2026) — [opentweet.io](https://opentweet.io/jev/alternatives)

Open Jev candidates (each one is separate and independent)
- **O1. GPT-AGI/OpenJev** ("Opensource Jev"). MIT code. Status badge reads "Phase 0". 9 commits, 21 stars, no releases, no weights published, and weights are planned for Phase 4. It "reproduces the interface pattern of TypeSafe's Jev with open-weight models" and is "not affiliated with or endorsed by TypeSafe." — [github.com/GPT-AGI/OpenJev](https://github.com/GPT-AGI/OpenJev)
- **O2. Zefan-Cai/Open-Jev**. "Open-Jev is an independent implementation inspired by TypeSafe's Jev." It does "not reproduce proprietary RLCD, private weights or training data." Checkpoints are `ZefanCai/Open-Jev-2B` (Qwen/Qwen3.5-2B base), `ZefanCai/Open-Jev-9B` and `ZefanCai/Open-Jev-27B-v1.1`, packaged as LoRA adapters plus a scalar decision head and a calibration temperature, without base weights. The original code is MIT. File and folder names carry the dates 20260921, 20260923 and 20261002 — [Open-Jev wiki](https://github.com/Zefan-Cai/Open-Jev/wiki)
- **O3. alanhuangya/OpenJev-8B** (Jun Huang and Xin Ren, UESTC). Apache-2.0, built on Qwen/Qwen3-8B-Base with a merged LoRA r=16. It is pitched as "an open-source, local alternative to Jev's System One decision API" and an "Independent project; not affiliated with TypeSafe AI." The page names a 4B sibling. The pip packages are `wev-ai` and `openjev-ai`. No release date is shown — [HF alanhuangya/OpenJev-8B](https://huggingface.co/alanhuangya/OpenJev-8B)
- **O4. shenjunhao/OpenJev-4B**. MIT, built on Qwen/Qwen3.5-4B-Base. Datasets are `shenjunhao/OpenJevData-140k` and `shenjunhao/mmdm`. It evaluates Jev "as Jev 1.13.0" through the official API but does not claim to derive from Jev. A search snippet tied it to a paper titled "Learning Open-Vocabulary Probabilistic Decision Models from Pretrained Language Models", but the model card fetched showed no paper link — [HF shenjunhao/OpenJev-4B](https://huggingface.co/shenjunhao/OpenJev-4B)
- **O5. ggml-org/OpenJev-GGUF**. A 27B model based on "Qwen3.8-27B" that supports images and en/de/fr/hi/zh/ja, licensed **CC BY-NC 4.0**. It is listed in the llama.cpp decision-model announcement of 2026-10-02 and runs with `llama serve -hf ggml-org/OpenJev-GGUF`. The blog does not name the upstream author — [HF blog, llama.cpp decision models](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp)
- **O6. razorback16/openjev**. "Independent Jev-compatible server over DiffusionGemma/vLLM; the documented setup requires custom vLLM patches." — [awesome-jev](https://github.com/cobanov/awesome-jev), [repo](https://github.com/razorback16/openjev)
- **O7. daseinlabs/open-jev**. "Gemma 3 option scorer for Apple MLX that shares one prefill across candidate continuations", with a System One-compatible endpoint — [awesome-jev](https://github.com/cobanov/awesome-jev), [repo](https://github.com/daseinlabs/open-jev)
- **O8. zhihz/openjev**. "Local bilingual probability decisions from context, questions, and candidate answers." — [awesome-jev](https://github.com/cobanov/awesome-jev)
- **O9. Algorythm-Canada/OpenJevSwift**. "Native Swift port of OpenJev: a Jev-compatible /v1/systemone server for Apple silicon Macs", with Core ML and MLX backends — [awesome-jev](https://github.com/cobanov/awesome-jev)
- The awesome-jev list also notes that a project now called "SemIf" was formerly named OpenJev. The list's review was completed 2026-09-20 — [awesome-jev](https://github.com/cobanov/awesome-jev)
- One overview counts "about 70 open reproductions of Jev", most of them exposing `POST /v1/systemone`. This came from a search-result summary of the llmconfigurator page, and the figure was not seen on the fetched page — [llmconfigurator](https://llmconfigurator.com/en/guides/decision-models/open-models-beyond-ollama)

JAY: searches and candidates
- Seven searches returned no decision model, company or API named JAY, Jay or J.A.Y.: "JAY decision model typed questions API", "Jay System One decision model open weights", "huggingface Jay /v1/systemone", "JAY AI model decisions API October 2026", "jay-1 decision model choice score noul", and "Jay open-source Jev reproduction github systemone". Search engines kept redirecting the query to Jev.
- The word JAY did not appear on any of these pages: docs.typesafe.ai, the Open-Jev wiki, both OpenJev HF cards, the redreamality survey (2026-10-11), the llmconfigurator list (2026-10-14), opentweet alternatives, the llama.cpp blog, GPT-AGI/OpenJev, or awesome-jev.
- **Jebadiah** (getainode/jebadiah) offers "Apache-2.0 decision models (27B, 9B, 4B on Qwen bases; bf16, GGUF and MLX) that answer Choice, Noul and Score questions". It runs as a standalone server on Jev's wire format, through a llama.cpp script, or via AINode — [awesome-jev](https://github.com/cobanov/awesome-jev)
- **AutoTrust JEV-9B / JEV-27B-VL** (`autotrust/JEV-9B`, `autotrust/JEV-27B-VL`) are Apache-2.0 distillations that "use Jev 1.13's output distributions as targets". They serve on `/v1/decide`, not `/v1/systemone` — [redreamality survey, 2026-10-11](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- **Julia-1** (`ggml-org/Julia-1-GGUF`) is a 144M model covering 50+ languages under Apache 2.0, served on llama.cpp `/v1/systemone` — [HF blog](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp)

### Inferences
- "Open Jev" in the user's sense most likely means one of three things. The first is the general class of open `/v1/systemone` reimplementations. The second is GPT-AGI/OpenJev, the repo that literally calls itself "Opensource Jev" and that search ranks first. The third is the 27B `ggml-org/OpenJev-GGUF`, the only "OpenJev" shipped by a major runtime. For a linter, "Open Jev" is best treated as a family of Jev-wire-compatible servers rather than one vendor.
- "JAY" may be a mishearing or misspelling of "Jev" itself (the letters J-E-V), of AutoTrust's "JEV" models, or of Jebadiah or Julia-1. This is speculation. No source supports a "JAY" decision model.

### Gaps
- The existence of JAY could not be verified. The user should supply a URL, vendor name or model id. It may also be too new or too niche for the search index as of 2026-10-14.
- The original author of the 27B CC BY-NC OpenJev behind `ggml-org/OpenJev-GGUF` was not identified.
- Most OpenJev pages give no release dates.

## Is either wire-compatible with TypeSafe's /v1/systemone or OpenAI's /v1/decisions? What differs?

### Takeaway
Every Open Jev project that documents an HTTP interface targets TypeSafe's `POST /v1/systemone` shape (`state` plus a `questions` map, types choice/score/noul). Compatibility is partial and differs in field names and casing. None claims compatibility with OpenAI's `/v1/decisions` (`predicate`/`choices`/`levels`). No JAY schema exists to compare.

### Cited Findings
- **GPT-AGI/OpenJev** claims the "Same request/response shape as `POST /v1/systemone`". Its types are `Choice` ("pick one of up to 255 options"), `Score` (ordered legend) and `Noul` (P(true)). Each question uses the fields `instructions`, `options` and `legend`, which differ from Jev's `criteria`. The response has `model`, `answers` (`type`, `choice`/`score`/`noul`, `probabilities`, `confidence`, `legend`) and `usage` (`input_tokens`, `output_tokens`), and the Python library adds `latency_ms`. The server (`openjev serve`, FastAPI, port 8000) is still Phase 1 and not shipped. It does not mention `/v1/decisions` — [GPT-AGI/OpenJev](https://github.com/GPT-AGI/OpenJev)
- **Zefan-Cai/Open-Jev** describes its API as "Official `/v1/systemone` request/answer shape; partial API compatibility, not the full hosted service." Types are lowercase `"noul"`, `"choice"` and `"score"`. `criteria` is a key-to-description object for choice and **a list of strings for score**. The server is `python -m jev.server`, on port 8791 bound to loopback, with `GET /health`, `--max-length 4096` and "bounded candidate batches" for large choices. It states no maximum option or level count — [Open-Jev wiki](https://github.com/Zefan-Cai/Open-Jev/wiki)
- **alanhuangya/OpenJev-8B** offers a "drop-in POST /v1/systemone". Its examples show `choice` (criteria map) and `noul` (criteria keys `"true"`/`"false"`, matching Jev). State can be up to 4096 tokens and each question up to 8192 tokens (trained at 2048). It serves with `wev serve --model alanhuangya/OpenJev-8B --port 8009`. The authors did not test it against real Jev because they had no API access — [HF OpenJev-8B](https://huggingface.co/alanhuangya/OpenJev-8B)
- **shenjunhao/OpenJev-4B** uses `state` and `questions` with `type`, `instructions` and `criteria`, and its outputs are `answers[name].choice` and `probabilities`. The model card states no wire compatibility or HTTP path — [HF OpenJev-4B](https://huggingface.co/shenjunhao/OpenJev-4B)
- **llama.cpp `/v1/systemone`** (which serves `ggml-org/OpenJev-GGUF`) "follows the System One format introduced with TypeSafe's Jev model, so existing clients only need a new base URL." For `score`, `criteria` is an array of 2 to 10 levels, "lowest first". It adds an optional `images` field (data URLs) and an optional `model` field for router mode, and `state` "can also be a list of chat messages". The response is `model`, `answers` (choice: `choice`/`probabilities`/`confidence`; score: `score`/`legend`/`probabilities`/`confidence`; noul: `noul`) and `usage`. Published 2026-10-02 — [HF blog](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp)
- OpenAI's Decisions API "has its own schema (`predicate`, `choices`, `levels`, plus a refusal answer type)" and is "not a drop-in replacement" for `/v1/systemone` (2026-10-11) — [redreamality](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- Jev's own documented limits, as reported by a third party, are Choice up to 255 options, Score 2 to 10 levels, and Noul a 0–1 float — [opentweet.io](https://opentweet.io/jev/alternatives)

### Inferences
- A linter accepting "Open Jev" targets should expect these deviations from Jev:
  - lowercase type names (`choice`) against Jev's `Choice`
  - score `criteria` given as an ordered list rather than a map (Open-Jev, llama.cpp)
  - the alternative field names `options` and `legend` (GPT-AGI)
  - extra fields such as `images` and `model`
  - smaller state and token limits (4096)
  - no stated cap on options or levels in most projects

  Jev's limits of 255 options and 2–10 levels are a safe common floor.
- None of the projects targets `/v1/decisions`, so OpenAI-shaped questions would not lint as Open Jev.

### Gaps
- No project publishes a formal JSON schema or OpenAPI document. Field-level claims come from READMEs and examples.
- Option-count and level-count limits for most OpenJev variants are not stated.
- Error and refusal shapes for OpenJev servers are not documented.

## What model ids, versioning and alias conventions do they use?

### Takeaway
Open Jev projects use Hugging Face repo ids (`owner/Name-Size`), not Jev-style ids like `jev-1.13.0` or `jev-latest`. None documents a `-latest` or `-preview` alias scheme.

### Cited Findings
- Zefan-Cai: `ZefanCai/Open-Jev-2B`, `ZefanCai/Open-Jev-9B`, and `ZefanCai/Open-Jev-27B-v1.1`, the last carrying a version suffix. Benchmarks compare against "Jev-1.13.0" — [Open-Jev wiki](https://github.com/Zefan-Cai/Open-Jev/wiki)
- alanhuangya: `alanhuangya/OpenJev-8B` and the `alanhuangya/wev` Space. The card mentions use as a drop-in "e.g. for jev-ultrafast" — [HF OpenJev-8B](https://huggingface.co/alanhuangya/OpenJev-8B)
- shenjunhao: `shenjunhao/OpenJev-4B` — [HF OpenJev-4B](https://huggingface.co/shenjunhao/OpenJev-4B)
- GPT-AGI: the response `model` label echoes the backend, as in `openjev-hf/Qwen2.5-0.5B-Instruct` — [GPT-AGI/OpenJev](https://github.com/GPT-AGI/OpenJev)
- llama.cpp: `ggml-org/OpenJev-GGUF`. The `model` field is ignored when a single model is loaded — [HF blog](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp)
- Jev on OpenRouter is `typesafe/jev-1.13` — [OpenRouter](https://openrouter.ai/typesafe/jev-1.13)

### Inferences
- A linter's model-id check should accept arbitrary `owner/name` strings for self-hosted Open Jev endpoints rather than enforce the `jev-*` pattern.

### Gaps
- "jev-ultrafast" appears only in the OpenJev-8B card. Whether it is a real TypeSafe model id was not verified.

## Are there self-hosting servers (vLLM/Ollama integrations etc.) that expose them?

### Takeaway
Yes. llama.cpp has shipped a native `/v1/systemone` endpoint since about 2026-10-02 and serves `ggml-org/OpenJev-GGUF`. vLLM merged a generic `/v1/systemone` endpoint on 2026-10-08. Most OpenJev projects also ship their own small server. No Ollama-specific OpenJev integration was found.

### Cited Findings
- llama.cpp decision models went live on 2026-10-02, with the command `llama serve -hf ggml-org/OpenJev-GGUF`. Other supported models are Julia-1, Laya, Kev-4B, lev and Clef — [HF blog](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp)
- "vLLM merged a generic `/v1/systemone` endpoint on October 8, dropping the opt-in flag a day later." PRs for OpenAI's Decisions schema were still open as of 2026-10-11 — [redreamality](https://redreamality.com/blog/open-decision-models-2026-survey-benchmarks/)
- Project-specific servers:
  - Open-Jev: `python -m jev.server`, port 8791, Python client `from jev.client import Client` — [wiki](https://github.com/Zefan-Cai/Open-Jev/wiki)
  - OpenJev-8B: `wev serve`, port 8009 — [HF](https://huggingface.co/alanhuangya/OpenJev-8B)
  - OpenJev-4B: the Python `DecisionEngine(...)`, which needs CUDA — [HF](https://huggingface.co/shenjunhao/OpenJev-4B)
  - GPT-AGI: Transformers and a mock backend today, with vLLM (`prompt_logprobs`) and MLX on the roadmap — [GPT-AGI](https://github.com/GPT-AGI/OpenJev)
  - razorback16: vLLM with custom patches — [awesome-jev](https://github.com/cobanov/awesome-jev)
- Auth: none of the OpenJev servers documents authentication. OpenJev-8B advertises "no API key". GPT-AGI uses `TYPESAFE_API_KEY` only to call the official Jev for comparison experiments — [HF OpenJev-8B](https://huggingface.co/alanhuangya/OpenJev-8B), [GPT-AGI](https://github.com/GPT-AGI/OpenJev)
- SDK reuse: GPT-AGI plans to let users "Point `typesafe-sdk` or `@typesafe-ai/sdk` at `http://localhost:8000`" in Phase 1, which has not shipped — [GPT-AGI](https://github.com/GPT-AGI/OpenJev)
- Licensing varies by project:
  - MIT: GPT-AGI code, Zefan-Cai code, shenjunhao
  - Apache-2.0: alanhuangya
  - CC BY-NC 4.0 (non-commercial): ggml-org/OpenJev-GGUF

  Sources: the pages cited above.

### Inferences
- In practice "Open Jev" can mean any `/v1/systemone` base URL on localhost: llama.cpp, vLLM or a project server. A linter that lints the request body shape will cover them, but it cannot assume an auth header or a hosted endpoint.

### Gaps
- No Ollama integration for any OpenJev was found. The redreamality survey lists Ollama only for Nokia's AnyJev, which serves on `/v1/decide`.
- The exact vLLM PR or commit for `/v1/systemone` was not fetched. It is cited only from the survey.
