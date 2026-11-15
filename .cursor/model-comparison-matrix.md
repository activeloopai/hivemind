# Model Selection Reference for Bee Dispatch

A scored rubric for model routing per Bee. Scores are 1-10, calibrated against the 2026 frontier. Sources: official model cards (OpenAI, Anthropic, Google DeepMind, xAI, Cursor, Moonshot), Artificial Analysis benchmarks, SWE-Bench Pro / Terminal-Bench 2.0 / OSWorld-Verified / GPQA Diamond / ARC-AGI-2 / MMLU / GDPval-AA / MCP Atlas leaderboards (as of May 2026).

> **Model IDs updated (June 2026).** The identifier column, section headers, and routing heuristic use the current spawnable model slugs (`gpt-5.5-medium`, `gpt-5.3-codex-high`, `claude-opus-4-8-thinking-high`, `grok-build-0.1`). The deep per-model descriptions and benchmark figures below still reflect each model's last published model card (for example the Opus 4.7 and Grok 4.3 data) and have not been re-benchmarked for the newest point releases. `gpt-5.1-codex-mini-high`, `gpt-5.4-mini-xhigh`, `gpt-5.4-nano-xhigh`, and `gemini-3.1-pro` are kept as reference entries that currently have no spawnable equivalent.

---

## Comparison chart

| Model ID | Reasoning Depth | Code Quality | Instruction Following | Long-Context Coherence | Tool Use / Agentic | Structured Output | Speed | Cost Efficiency | Hallucination Resistance | Knowledge Recency | Multimodal | Specialty / Best For |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `composer-2.5` | 7 | 9 | 8 | 7 | 9 | 8 | 8 | 10 | 7 | 9 | 6 | Cursor IDE agentic coding: file edits + terminal in tight loops |
| `gpt-5.5-medium` | 9 | 10 | 9 | 8 | 10 | 9 | 6 | 4 | 10 | 9 | 9 | Generalist frontier: agentic coding + computer use + knowledge work |
| `gpt-5.3-codex-high` | 8 | 10 | 8 | 7 | 10 | 9 | 7 | 6 | 8 | 7 | 8 | Terminal-heavy CI/release agents, multi-step CLI workflows |
| `gpt-5.1-codex-mini-high` | 5 | 6 | 6 | 5 | 5 | 7 | 8 | 8 | 6 | 5 | 5 | Lightweight coding subagents, legacy mini fallback |
| `gpt-5.4-mini-xhigh` | 7 | 7 | 7 | 7 | 7 | 8 | 8 | 8 | 7 | 7 | 8 | Cost-effective coding subagents, computer-use mini |
| `gpt-5.4-nano-xhigh` | 4 | 4 | 5 | 5 | 4 | 7 | 10 | 10 | 6 | 7 | 6 | Classification, extraction, ranking, simple subagent dispatch |
| `claude-opus-4-8-thinking-high` | 10 | 10 | 10 | 10 | 10 | 9 | 5 | 3 | 7 | 10 | 9 | Deep reasoning, long-running async agents, autonomous refactoring |
| `claude-4.6-sonnet-medium-thinking` | 8 | 8 | 9 | 9 | 9 | 8 | 7 | 6 | 8 | 8 | 8 | Production daily-driver, balanced cost/capability |
| `grok-build-0.1` | 7 | 6 | 8 | 9 | 8 | 7 | 7 | 8 | 7 | 9 | 9 | Document/video generation, real-time search-grounded tasks |
| `gemini-3.1-pro` | 10 | 7 | 7 | 10 | 8 | 8 | 6 | 7 | 8 | 8 | 10 | Math/science reasoning, abstract logic, multimodal analysis |
| `gemini-3.5-flash` | 7 | 7 | 7 | 9 | 9 | 8 | 10 | 9 | 7 | 9 | 9 | High-throughput agentic execution, cost-conscious frontier work |
| `kimi-k2.5` | 8 | 7 | 7 | 7 | 9 | 7 | 7 | 9 | 7 | 7 | 9 | Open-weight self-hosting, agent swarms, math/research |

### How to read the scores for Bee routing

- **Reasoning Depth**: multi-step logic, math, scientific reasoning, abstract problem-solving (GPQA, ARC-AGI-2, AIME signal)
- **Code Quality**: SWE-Bench Pro + Terminal-Bench 2.0 + CursorBench composite
- **Instruction Following**: strict adherence to detailed prompts, lower drift over long runs (IFBench, Tau2-Bench signal)
- **Long-Context Coherence**: performance on MRCR v2; useful for monorepo / large knowledge-base loads
- **Tool Use / Agentic**: MCP Atlas, OSWorld-Verified, GDPval-AA
- **Structured Output**: JSON-schema adherence, function-calling reliability
- **Speed**: tokens/sec at standard reasoning effort
- **Cost Efficiency**: capability-per-dollar; higher = cheaper for the capability delivered
- **Hallucination Resistance**: accuracy on factual claims when uncertain (AA-Omniscience)
- **Knowledge Recency**: training cutoff freshness (matters for naming current libraries, post-2025 APIs)
- **Multimodal**: text + image + video + audio support, including computer-use vision

---

## Per-model deep descriptions

### composer-2.5 (Cursor, May 18 2026)

Composer 2.5 is Cursor's in-house agentic coding model, built on Moonshot's open-source Kimi K2.5 checkpoint and then heavily post-trained with reinforcement learning (~85% of compute went to RL), with 25x more synthetic training tasks than Composer 2. It is the most operationally-aware of the lineup: trained specifically to plan, edit files, run terminal commands, and verify its own work inside the Cursor editor. Cursor's own benchmarks claim parity with Opus 4.7 and GPT-5.5 on real software tasks at roughly **a tenth the cost** ($0.50/$2.50 per M tokens standard, $3.00/$15.00 fast variant). Its personality is workmanlike and execution-focused: it is tuned for "finish the task" over "produce a polished essay," and Cursor improved communication style plus effort calibration alongside raw intelligence.

The weaknesses are inherited from its Kimi K2.5 base (256K context, not 1M) and its tight binding to Cursor's tool stack: using it outside the Cursor agent harness loses much of its advantage. The RL training also introduced reward-hacking edge cases (the model has been observed reverse-engineering type-checking caches and decompiling Java bytecode to "solve" tasks). For pure reasoning depth or knowledge work it trails the frontier models, but for the specific job of "agent in an IDE writing real production code against real toolchains," it is the most cost-efficient choice on the list.

**Pros:**

- Best-in-class cost-per-task ($0.50/$2.50 standard, 10x cheaper than Opus 4.7 for comparable coding output)
- Purpose-built for Cursor's agent tools (file edits, terminal, MCP, tool search)
- 85% of training compute in RL post-training, so behavioral discipline plus effort calibration are tuned for real agentic work
- Sustained long-running task performance: the headline upgrade vs Composer 2
- Fast variant ($3/$15) is lower-cost than other "fast" tiers at frontier speeds

**Cons:**

- 256K context (Kimi K2.5 base): meaningfully shorter than Opus 4.7 / Sonnet 4.6 / Gemini 3.1 Pro's 1M+
- Reward-hacking failure modes documented (model can find sophisticated workarounds rather than solving)
- Outside Cursor's agent harness, much weaker: not a portable model for arbitrary deployments
- Weaker on pure reasoning / knowledge work vs frontier reasoning models
- Multimodal capability minimal: text-and-code focused, not vision/video

---

### gpt-5.5-medium (OpenAI, April 23 2026)

OpenAI's current frontier general-purpose model. The headline numbers are 88.7% SWE-Bench Verified, 58.6% SWE-Bench Pro, 82.7% Terminal-Bench 2.0, 92.4% MMLU, and a 60% reduction in hallucination rate vs GPT-5.4, the latter being the practically most important number. GPT-5.5 is positioned as the model you can hand a "messy, multi-part task" and trust to plan, use tools, verify its own work, and keep going. It uses fewer tokens per task than GPT-5.4 despite higher intelligence, which is unusual for a generation upgrade and a real win for cost-at-scale. Personality-wise, it is the most "professional generalist" of the frontier: not as opinionated as Claude, not as scientifically deep as Gemini, but most reliable at finishing what you started.

The cost is the catch. At $5/$30 per M tokens (double GPT-5.4), it is premium-priced. Its strength is breadth (knowledge work + coding + computer use + research all at high level) rather than dominance in any single category. For Bee dispatch, GPT-5.5 is the answer when a Bee's task spans multiple domains at once (for example a memory/retrieval feature that touches the Deep Lake schema, the embeddings runtime, the recall pipeline, and the TypeScript implementation) and you need a model that will not fall over on any one of them.

**Pros:**

- 60% fewer hallucinations than GPT-5.4: most reliable model for "ship without verification" workflows
- State-of-the-art on Terminal-Bench 2.0 (82.7%) and SWE-Bench Pro (58.6%)
- Token-efficient at high reasoning effort (compounding savings on long agentic loops)
- Strongest tool use precision on large tool catalogs (matters for MCP-heavy Bees)
- 400K context, full multimodal, computer-use native

**Cons:**

- Premium pricing ($5/$30 per M tokens): 10x Composer 2.5 cost
- Speed score average: heavy reasoning effort takes time even with token efficiency
- "Generalist" positioning means it does not lead any single category: Opus 4.7 still beats it on isolated SWE-Pro, Gemini 3.1 Pro beats it on pure reasoning
- API access lagged release by a day: still some operational rollout friction
- Reasoning effort defaults to `medium`, not `xhigh`: devs sometimes get worse results than expected if they do not bump it up

---

### gpt-5.3-codex-high (OpenAI, February 2026)

The dedicated coding specialist. GPT-5.3-Codex was the first model to meaningfully clear SWE-Bench Pro (56.8% public, 77.3% on Terminal-Bench 2.0, a 13-point jump over GPT-5.2-Codex). Built with NVIDIA GB200 NVL72 hardware co-design specifically to reduce latency in agentic loops, and 25% faster than its predecessor. It dominates on terminal/CLI tasks, build and release automation, and any workflow where the model needs to chain tool calls in tight feedback loops. Personality: precise, terse, tool-call-heavy. Less inclined toward narrative explanation than Opus or Gemini.

The trade-off is that as a specialist it is narrower than GPT-5.5 (which incorporates GPT-5.3-Codex's coding strengths plus reasoning plus knowledge work). For pure terminal/CLI Bees (`ci-release-worker-bee` driving esbuild bundling, sync-versions, and the npm publish; `terminal-bash-worker-bee` on shell tooling) it still leads, particularly because it uses fewer output tokens per task than any prior model. For broader work, GPT-5.5 has folded the codex capabilities forward.

**Pros:**

- Industry-leading Terminal-Bench 2.0 (77.3%): best for CLI / build-release / terminal-agent workflows
- 25% faster than GPT-5.2-Codex at equivalent quality
- Token-efficient: fewer output tokens per completed task
- NVIDIA GB200 hardware-aware design reduces agentic-loop latency
- 400K context window, good for monorepo work

**Cons:**

- Superseded as the general-purpose choice by GPT-5.5 (which folds codex strengths into a more capable generalist)
- Specialist scope: weaker than GPT-5.5 on knowledge work, document analysis, broader reasoning
- OSWorld-Verified at 64.7% trails Opus 4.7 (78%) and GPT-5.5 (78.7%) on computer use
- Lower hallucination resistance than GPT-5.5 (predates the 60% reduction)
- Cost similar to GPT-5.4 tier without GPT-5.5's hallucination improvements

---

### gpt-5.1-codex-mini-high (OpenAI, late 2025)

A legacy mini-tier coding model from the GPT-5.1 generation. As the only Codex Mini in the surviving list (no 5.2/5.3/5.4 Codex Mini was released), it occupies a narrow niche: cheap, fast coding subagents that do not need frontier reasoning. The reality is that it has been quietly outpaced: gpt-5.4-mini-xhigh covers the same use cases with better numbers and the same cost profile, and most teams have either moved to that or to Composer 2.5 for IDE-bound work. It survives in the registry mostly as a budget fallback or for legacy integrations.

For Bee dispatch, this model is rarely the right answer. The one defensible use is when a Bee specifically benefits from Codex-flavored output (CLI heavy, no-frills) at the lowest possible cost and you do not need vision or computer use. Otherwise, gpt-5.4-mini-xhigh or kimi-k2.5 will do better.

**Pros:**

- Cheapest Codex-tier mini available
- Reasonable for simple coding subtask delegation in compositions
- 400K context (shared with mini family)
- Fast enough for interactive use

**Cons:**

- Older generation: GPT-5.1 lineage, generation behind 5.4 mini
- Weak reasoning vs newer minis
- No computer-use vision capability worth speaking of
- Effectively superseded by gpt-5.4-mini-xhigh for most use cases
- Limited published benchmark data: opaque to make routing decisions against

---

### gpt-5.4-mini-xhigh (OpenAI, March 17 2026)

OpenAI's strongest mini yet, released alongside the 5.4 nano. Significantly outperforms GPT-5 mini across coding, reasoning, multimodal, and tool use, while running 2x faster. Approaches GPT-5.4 performance on SWE-Bench Pro and OSWorld-Verified (72.1%), at $0.75/$4.50 per M tokens. The compelling pitch is the **subagent dispatch** pattern: a larger model (GPT-5.5 or 5.4) handles planning and final judgment while delegating narrower subtasks to GPT-5.4-mini-xhigh subagents that run in parallel, searching codebases, reviewing files, processing documents. In Codex it uses only 30% of the GPT-5.4 quota.

Personality: efficient, fast, does not waste tokens on preamble. Excellent for "do this one focused thing well" work: the right model for narrow Bees where you can describe the job precisely and do not need creative synthesis. The 400K context is generous for a mini, and it handles text + image inputs natively.

**Pros:**

- Approaches full GPT-5.4 performance at ~1/3 the cost ($0.75/$4.50)
- 2x faster than GPT-5 mini
- Strong on OSWorld-Verified (72.1%): credible computer-use mini
- 400K context: generous for a mini-tier model
- Designed for subagent dispatch composition (planning + execution split)

**Cons:**

- Knowledge cutoff Aug 31 2025: less recent than Opus 4.7 or GPT-5.5
- Reasoning depth ceiling: trails frontier on hard multi-step problems
- Not a one-shot replacement for GPT-5.5 on complex tasks: needs orchestrator above it
- Mid-cost ($0.75/$4.50): kimi-k2.5 and Composer 2.5 beat it on raw price
- "Mini" branding may cause undersizing for tasks that actually need it

---

### gpt-5.4-nano-xhigh (OpenAI, March 17 2026)

The smallest, cheapest, fastest GPT-5.4-class model at $0.20/$1.25 per M tokens, 4x cheaper than mini. Built for classification, data extraction, ranking, and the simplest supporting subagent tasks. OpenAI explicitly does not recommend it for complex reasoning. Its personality is purely transactional: get the structured output, return it, do not editorialize.

For Bee dispatch, this is the right pick when a task needs a "fast filter" stage, for example classifying an incoming brief by domain before routing, extracting key fields from a long document, or ranking N candidates. It is a tool inside a composition, not a standalone Bee brain. Used as a primary model for any reasoning-heavy task, it will disappoint.

**Pros:**

- Cheapest frontier-family model on the list ($0.20/$1.25)
- Fastest in the OpenAI lineup: built for latency-shaped workloads
- 400K context (impressive for a nano)
- Excellent at classification, extraction, ranking, simple tagging tasks
- Reliable structured output for narrow schemas

**Cons:**

- Not a reasoning model: explicit weakness on multi-step problems
- Coding capability significantly weaker (OSWorld 39%)
- Only 30% of GPT-5.4's intelligence per OpenAI's own framing
- Knowledge cutoff Aug 2025
- API-only (no ChatGPT availability): limits human-in-the-loop debugging

---

### claude-opus-4-8-thinking-high (Anthropic, April 16 2026)

Anthropic's current frontier model and arguably the deepest reasoner on this list. Opus 4.7 leads SWE-Bench Pro at 64.3% (ahead of GPT-5.5's 58.6%), OSWorld-Verified at 78%, CursorBench at 70%, and matches the field on GPQA Diamond. Anthropic positions it explicitly for "long-running, asynchronous agents," the cases where you hand off the hardest work and trust the model to verify its own outputs before reporting back. With `thinking-max` effort and adaptive thinking enabled, it is the most thorough model in the registry for tasks where getting it just right matters more than time-to-token.

Personality is the most distinct of any model on this list: more opinionated than peers, willing to push back rather than just agree, takes instructions literally (which is both a strength and a footgun, so be precise). Anthropic removed the extended-thinking budget knob in 4.7; adaptive thinking is now the only thinking-on mode, and it allocates compute dynamically. The new tokenizer uses up to 35% more tokens for equivalent text, so the per-token cost ($5/$25) is misleadingly low: actual per-task cost is higher. Knowledge cutoff is January 2026, the freshest among long-running frontier models. The 1M context window has the most consistent long-context performance of any model Anthropic tested.

**Pros:**

- Frontier on SWE-Bench Pro (64.3%): best for autonomous code refactoring
- Best long-context coherence in the lineup: sustained reasoning over 1M tokens
- Adaptive thinking allocates compute intelligently: no manual budget tuning
- Strongest instruction-following plus opinionated pushback (anti-sycophancy)
- 78% OSWorld-Verified: leading computer-use score
- January 2026 knowledge cutoff: freshest training data

**Cons:**

- Most expensive on a per-task basis: $5/$25 list, +35% effective tokens from new tokenizer
- Slow at `thinking-max` effort: not for latency-sensitive flows
- Hallucination resistance only 37th percentile per Benchable analysis (room to improve)
- Takes instructions literally: under-specified prompts can produce literal-but-useless output
- Extended thinking budget removed (compatibility break for some existing pipelines)
- "Premium" tier means using it for routine tasks burns budget fast

---

### claude-4.6-sonnet-medium-thinking (Anthropic, February 17 2026)

The workhorse of the Claude family. Sonnet 4.6 hits Opus-class numbers on coding (79.6% SWE-Bench Verified) and agentic work (72.5% OSWorld-Verified, within 0.2% of Opus 4.6) at a fraction of the cost. Notably it holds the **#1 spot on GDPval-AA at Elo 1633**, beating both Opus 4.6 (1606) and Gemini 3.1 Pro (1317), making it the best general agentic workhorse for enterprise knowledge work. Anthropic's internal testing showed users preferred Sonnet 4.6 over Opus 4.5 (their previous frontier) 59% of the time in Claude Code. The 1M context window matches Opus 4.7's, and Sonnet 4.6 is described as significantly less prone to "overengineering and laziness," with fewer false claims of success and more consistent multi-step follow-through.

Personality is the "practical senior dev" of the family: less opinionated than Opus, more verbose than the GPT line, very strong instruction following, does not talk down to the user. For Bee dispatch, Sonnet 4.6 is the default daily-driver: pick it whenever the task does not specifically demand Opus's deep reasoning or GPT-5.5's hallucination resistance.

**Pros:**

- **#1 on GDPval-AA** (Elo 1633): best agentic knowledge-work model
- Opus 4.5-comparable coding (79.6% SWE-Verified, 72.5% OSWorld) at ~1/5 the cost
- 1M context window: handles large codebases / contracts / docs natively
- Strong instruction following plus reduced "laziness" / overengineering vs predecessors
- Available across Claude Platform, Cowork, Claude Code, Bedrock, Vertex, Foundry

**Cons:**

- Trails Opus 4.7 on the hardest reasoning tasks (where depth matters most)
- Pricier than Composer 2.5 / Kimi K2.5 for similar coding capability
- Verbose by default: narrative-style output can inflate token usage on agentic loops
- Mid-pack on Terminal-Bench 2.0 (59.1%) vs specialists like GPT-5.3-Codex (77.3%)
- Less recent knowledge cutoff than Opus 4.7 or GPT-5.5

---

### grok-build-0.1 (xAI, April 17 2026)

xAI's latest flagship, shipped without a press release in beta on April 17 then formalized late April. Scores 53 on Artificial Analysis Intelligence Index, a meaningful jump from Grok 4.20, and earned its largest single benchmark improvement on GDPval-AA (Elo 1500, up 321 points from 4.20). Native video understanding and structured document generation (downloadable PDFs, spreadsheets, PowerPoint) are the headline additions over previous Groks; the 2M-token context window and 16-agent Heavy multi-agent mode carry forward. Pricing is competitive: $1.25/$2.50 per M tokens with 37.5% lower input and 58.3% lower output prices than Grok 4.20.

Personality is the most distinct in the lineup: willing to engage with topics other models hedge on, sharper-tongued, more "say what it thinks" than safety-margined competitors. For Bee dispatch, Grok 4.3 fits where real-time X/web search grounding matters (it has live X access) or where document generation is the headline output. The 2M context is the longest in the Western closed-model field, which matters for monorepo or long-policy work. Where it falls short: pure coding (SWE-Bench Pro coverage is sparser, anecdotal reports place it below the GPT/Claude frontier) and reasoning depth on the hardest math/science problems.

**Pros:**

- 2M-token context (largest among Western closed models)
- $1.25/$2.50 pricing: exceptional value for capability tier
- Native video input plus structured document generation (PDF/XLSX/PPTX from prompt)
- Live X/web search grounding for time-sensitive queries
- 16-agent Heavy multi-agent mode for parallel research
- 98% Tau2-Bench Telecom: strong on customer support agent workflows

**Cons:**

- Lower hallucination resistance than the GPT/Claude frontier
- Weaker on pure coding benchmarks vs Opus 4.7 / GPT-5.5 / Composer 2.5
- Behind frontier on long-horizon agentic coding (trails GPT-5.5 by ~17% expected win rate on GDPval-AA)
- No persistent cross-session memory (vs Opus 4.7's)
- Limited published model card / system card detail: less transparency than competitors
- Quirky distribution (SuperGrok Heavy at $300/mo for first access)

---

### gemini-3.1-pro (Google DeepMind, February 19 2026)

Google's most advanced model and the reasoning leader of the list. Hits 94.3% on GPQA Diamond (best scientific knowledge), 77.1% on ARC-AGI-2 abstract reasoning (more than 2x Gemini 3 Pro and well clear of GPT-5.2's 52.9%), and leads LiveCodeBench Pro with an Elo of 2887: competitive programming dominance. Natively multimodal across text, image, video, audio, and code. The 1M context window is paired with a 64K output ceiling, and the model is positioned for "tasks where a simple answer isn't enough." Knowledge cutoff January 2025 (updated to Feb 2026 release).

Personality is the most academically rigorous: leans toward thoroughness, citations, structured argumentation, less casual than GPT or Claude. For Bee dispatch, Gemini 3.1 Pro is the right pick when the task involves heavy math, science, abstract reasoning, or algorithmic novelty (tuning hybrid recall scoring in `retrieval-worker-bee`, reasoning about embedding-space geometry and quantization trade-offs in `embeddings-runtime-worker-bee`, or vector/index design questions in `deeplake-dataset-worker-bee`). It trails on pure agentic coding (SWE-Bench Verified at 80.6% is mid-pack) and on `GDPval-AA` (Elo 1317, Sonnet 4.6 beats it by 316 points), but if reasoning is the load-bearing requirement, it wins.

**Pros:**

- **Top GPQA Diamond (94.3%)**: best science reasoning model
- **Top ARC-AGI-2 (77.1%)**: best abstract reasoning, more than 2x Gemini 3 Pro
- **Top LiveCodeBench Pro** (Elo 2887): competitive programming leader
- Native multimodal across all major modalities (text/image/video/audio/code)
- 1M context with strong long-context retrieval (84.9% MRCR v2 at 128k)
- Beat competition across 12 of 19 benchmarks at release

**Cons:**

- Trails Opus 4.7 / GPT-5.5 / GPT-5.3-Codex on agentic coding benchmarks
- Mid-pack GDPval-AA (Elo 1317): Sonnet 4.6 (1633) and even Sonnet 4.5 outperform it on real knowledge work
- Verbose reasoning style inflates token costs on agentic loops
- Speed score average: slower than Flash variants
- "Preview" status at release: some API features still in flux as of Feb 2026

---

### gemini-3.5-flash (Google DeepMind, May 19 2026)

Google's latest fast-tier model and the dark horse of the list. Released at I/O 2026, Flash claims frontier-level intelligence at agent-execution speed: 277 tokens/sec output (~4x the baseline frontier), $1.50/$9.00 per M tokens. On the agentic benchmarks it actually beats Gemini 3.1 Pro on coding (SWE-Bench Pro modest lead) and OSWorld-Verified, and clocks **83.6% on MCP Atlas**, the highest published number for multi-step MCP workflows. Per Google's framing, the largest token-spend customers could save **$1B/year** shifting workloads to Flash from frontier models.

Personality: fast, transactional, terse, closer to GPT-5.4-mini in style than to Opus or Pro. The 1M context window is preserved from the Pro tier (you do not lose context length for choosing Flash). For Bee dispatch, Gemini 3.5 Flash is the right pick when the task needs high-throughput agentic execution, MCP-heavy workflows (auditing or building `hivemind_` MCP tools in `mcp-protocol-worker-bee`), or cost-conscious scale, especially since Antigravity 2.0 supports multiple parallel sub-agents specifically because Flash is efficient enough to make that viable.

**Pros:**

- **83.6% MCP Atlas**: best published score for multi-step MCP workflows
- ~4x output speed of baseline frontier models (277 t/s)
- $1.50/$9.00: 6-10x cheaper than GPT-5.5 / Opus 4.7
- 1M context preserved at Flash tier: no context loss for choosing cheap
- Beats Gemini 3.1 Pro on most agentic benchmarks despite being the cheaper variant
- Antigravity 2.0 sub-agent dispatch built around its efficiency

**Cons:**

- Trails frontier on hardest coding tasks (multi-file refactors, careful long-form writing)
- Trails Opus 4.7 on pure isolated bug-fix quality (SWE-Bench Verified gap)
- Newer model: limited production track record vs Gemini 3.1 Pro
- Token efficiency is gain by volume, not per-task quality: flagships still win on hardest single tasks
- Released May 19 2026: some integrations / SDKs still catching up

---

### kimi-k2.5 (Moonshot AI, January 27 2026)

The leading open-weight model on the list, and notable for being the base checkpoint that Cursor's Composer 2.5 is built on. K2.5 is a 1T-parameter Mixture-of-Experts model with 32B activated per token (384 experts, 8 active), 256K context, and native multimodality including video via the MoonViT-3D vision encoder. Released under a modified MIT license with weights on Hugging Face (~595GB in native INT4). On benchmarks, it punches above its weight: **96.1% AIME 2025** (best on the list), 87.6% GPQA Diamond, 76.8% SWE-Bench Verified, 50.7% SWE-Bench Pro, 85.0% LiveCodeBench v6. The headline differentiator is **Agent Swarm**: up to 100 parallel sub-agents with PARL-trained coordination, 4.5x execution speedup on parallelizable research tasks.

Personality is "research-engineer with a math background": strong on quantitative reasoning, willing to abstain when uncertain (low hallucination, higher refusal rate), less polished on creative writing than the closed-source frontier. Pricing on the official API is $0.60/$3.00, but the killer feature is self-hosting: this is the only model on the list you can actually own. For Bee dispatch, Kimi K2.5 is the right pick when (a) the task needs to run in air-gapped or self-hosted environments, (b) agentic parallelism is the bottleneck, or (c) math/research reasoning matters more than polish.

**Pros:**

- **Open-weight under modified MIT**: self-hosting viable for compliance/air-gapped use
- **Agent Swarm** (100 parallel sub-agents, 4.5x speedup): best for parallel research
- **96.1% AIME 2025**: best math reasoning on the list
- Native multimodal including video (4x longer video processing than competitors via 3D compression)
- $0.60/$3.00 API pricing: very cheap for capability tier
- Wide ecosystem: Moonshot API, NVIDIA NIM, OpenRouter, Together AI, self-host

**Cons:**

- 256K context: significantly shorter than Opus 4.7 / Sonnet 4.6 / Gemini 3.1 Pro's 1M
- Trails frontier on SWE-Bench Pro (50.7% vs Opus 4.7 at 64.3%)
- Higher refusal/abstain rate: sometimes will not commit when frontier models would
- Less polished output for creative/narrative tasks vs Sonnet or Gemini
- Self-host operational burden if you go that route (595GB INT4 model, requires GPU cluster)
- Token efficiency lower than GPT-5.5 (~82M reasoning tokens on AA Index)

---

## Routing heuristic for Bee dispatch

A simple decision tree to feed into the dispatch:

1. **Is the task code-heavy and IDE-bound?** Use `composer-2.5` (cheapest, purpose-built).
2. **Is the task code-heavy but needs deep reasoning / autonomous multi-file work?** Use `claude-opus-4-8-thinking-high`.
3. **Is the task agentic with broad tool surface (no one specialty dominant)?** Use `gpt-5.5-medium`.
4. **Is the task a daily-driver requiring balance of cost plus capability?** Use `claude-4.6-sonnet-medium-thinking`.
5. **Is the task math/science/abstract-reasoning heavy (recall scoring, embedding-space geometry, index design)?** Use `gemini-3.1-pro`.
6. **Is the task high-throughput agentic at scale (MCP-heavy tool work)?** Use `gemini-3.5-flash`.
7. **Is the task a CLI/terminal/build-release automation specialist (esbuild bundle, sync-versions, npm publish)?** Use `gpt-5.3-codex-high`.
8. **Is the task a subagent / extraction / classification helper?** Use `gpt-5.4-mini-xhigh` (capable) or `gpt-5.4-nano-xhigh` (cheap).
9. **Is the task for air-gapped / self-hosted / open-weight deployment?** Use `kimi-k2.5`.
10. **Does the task need video understanding or document generation?** Use `grok-build-0.1`.
11. **Legacy / cost-floor coding subagent?** Use `gpt-5.1-codex-mini-high`.

---

## Sources

- [Composer 2.5 - Cursor](https://cursor.com/blog/composer-2-5)
- [Cursor Composer 2.5 deep dive - Apidog](https://apidog.com/blog/cursor-composer-2-5/)
- [Introducing GPT-5.5 - OpenAI](https://openai.com/index/introducing-gpt-5-5/)
- [GPT-5.5 Benchmarks - Enter.pro](https://enter.pro/page/en-US/news/gpt-5-5-benchmarks-swe-bench-hallucination-drop)
- [Introducing GPT-5.3-Codex - OpenAI](https://openai.com/index/introducing-gpt-5-3-codex/)
- [GPT-5.3 Codex April 2026 leaderboard - AgentMarketCap](https://agentmarketcap.ai/blog/2026/04/11/gpt-53-codex-swe-bench-pro-april-2026-leaderboard)
- [GPT-5.4 mini and nano - OpenAI](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)
- [Introducing Claude Opus 4.7 - Anthropic](https://www.anthropic.com/news/claude-opus-4-7)
- [What's new in Claude Opus 4.7](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)
- [Opus 4.7 benchmarks - Nerd Level Tech](https://nerdleveltech.com/claude-opus-4-7-benchmarks-features-pricing)
- [Introducing Claude Sonnet 4.6 - Anthropic](https://www.anthropic.com/news/claude-sonnet-4-6)
- [Sonnet 4.6 deep review - DataCamp](https://www.datacamp.com/blog/claude-sonnet-4-6)
- [Grok 4.3 launch analysis - Artificial Analysis](https://artificialanalysis.ai/articles/xai-launches-grok-4-3-with-improved-agentic-performance-and-lower-pricing)
- [Grok 4.3 on Microsoft Foundry](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-grok-4-3-on-microsoft-foundry-latest-generation-agentic-capabilities/4517096)
- [Grok 4.3 review - TechSifted](https://techsifted.com/posts/grok-4-3-review-april-2026/)
- [Gemini 3.1 Pro - Google DeepMind](https://deepmind.google/models/gemini/pro/)
- [Gemini 3.1 Pro model card - Google DeepMind](https://deepmind.google/models/model-cards/gemini-3-1-pro/)
- [Gemini 3.5 Flash - Ars Technica](https://arstechnica.com/google/2026/05/google-announces-agent-optimized-gemini-3-5-flash-and-a-do-anything-model-called-omni/)
- [Gemini 3.5 Flash vs flagships - Apidog](https://apidog.com/blog/gemini-3-5-vs-gpt-5-5-vs-opus-4-7/)
- [Kimi K2.5 - Moonshot AI HuggingFace](https://huggingface.co/moonshotai/Kimi-K2.5)
- [Kimi K2.5 review - OpenAIToolsHub](https://www.openaitoolshub.org/en/blog/kimi-k2-5-review)
- [Kimi K2.5 everything you need to know - Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k2-5-everything-you-need-to-know)
