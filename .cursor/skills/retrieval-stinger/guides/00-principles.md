# 00 - Principles

The non-negotiables. Read on every invocation before any specialized guide.

> **Ground truth:** Hivemind source under `src/shell/` (recall), `src/hooks/` (capture + fast path), `src/skillify/` (codify + propagation), `src/graph/` (codebase graph), and `src/embeddings/columns.ts` (the column/dim contract recall depends on). Cite source plus the guide. If a finding contradicts the source, read the source again - it wins.

---

## The twelve principles

### 1. Confirm the embeddings posture before answering any recall question

Whether `<#>` semantic recall is live or recall is silently falling back to BM25/ILIKE drives nearly every recall answer. Two toggles gate it:

- `HIVEMIND_EMBEDDINGS` - generate embeddings for stored records.
- `HIVEMIND_SEMANTIC_SEARCH` - use vector recall at query time (`src/hooks/grep-direct.ts` and `src/shell/grep-interceptor.ts` read `process.env.HIVEMIND_SEMANTIC_SEARCH !== "false" && !embeddingsDisabled()`).

With both on and columns populated, recall runs hybrid. With either off, the daemon down, or the column NULL, recall runs lexical. State which posture you observed in the finding.

### 2. Recall is hybrid by design - one query, two tables

`src/shell/grep-core.ts` runs a single `UNION ALL` across:

- the `memory` table (column `summary` - the session summaries), and
- the `sessions` table (column `message` - the raw JSONB dialogue).

Both arms run on every recall. A change that searches only one table silently halves coverage and is a recall regression.

### 3. Semantic mode is the `<#>` cosine operator against `FLOAT4[]` columns

Semantic recall uses Deep Lake's `<#>` cosine operator against `summary_embedding` (on `memory`) and `message_embedding` (on `sessions`), both `FLOAT4[]` sized to `EMBEDDING_DIMS=768` (`src/embeddings/columns.ts`). The query vector is computed via the `EmbedClient`.

### 4. BM25/ILIKE is a silent fallback, never a silent failure

When embeddings are off, the daemon is unreachable, or a column is NULL, recall degrades to BM25/`ILIKE` lexical without erroring. That silence is correct - the system still recalls, it just covers less semantic ground (synonyms, paraphrases, conceptual matches). The finding is only when the user expected semantic and silently got lexical. Surface the degradation; do not break it.

### 5. A null query vector means lexical, full stop

In `SearchOptions`, `queryEmbedding?: number[] | null`. The comment in `grep-core.ts` is explicit: `null` means the daemon was unreachable and recall should stick with lexical. A null vector MUST NOT throw and MUST NOT run a broken `<#>` query against an empty operand. This is the correctness guarantee, not an error case.

### 6. Dimension locks to the schema (768)

The `<#>` operator runs against `FLOAT4[]` columns sized to `EMBEDDING_DIMS=768`. A query vector of any other length is a must-fix. The dimension itself is a schema constant - changing it is a schema event owned by deeplake-dataset-worker-bee, not a recall tuning knob.

### 7. Pick the hybrid weighting on purpose

`deeplake_hybrid_record($vec::float4[], $text, w1, w2)` blends the semantic and lexical arms. Three presets:

- **0.7/0.3 conceptual** - paraphrase-heavy recall, "what was that thing about X".
- **0.5/0.5 balanced** - mixed intent.
- **0.3/0.7 keyword-precise** - the user knows the exact term, identifier, or error string.

One fixed weighting for every query is a should-refactor.

### 8. The fast path must match the slow path's correctness

`src/hooks/grep-direct.ts` is the pre-tool-use fast path; `src/shell/grep-core.ts` is the shared core. The fast path is an optimization, not a different algorithm. Any divergence in what it would return vs the core is a must-fix.

### 9. The skillify gate is the quality bar

The codify loop runs a Haiku gate (`src/skillify/gate-runner.ts`, parsed by `gate-parser.ts`) returning `KEEP` | `MERGE` | `SKIP` per candidate session. An unparseable verdict is treated conservatively - do not mine. Lowering the gate to mine more skills is how the catalog rots.

### 10. Every mined skill writes provenance

`src/skillify/skill-writer.ts` emits the `SKILL.md` and `src/skillify/skills-table.ts` inserts one row per skill version into the Deep Lake `skills` table. A skill that lands without a provenance row is untraceable and is a must-fix.

### 11. Scope is `me` or `team` - and it is a boundary

`src/skillify/scope-config.ts` resolves `scope: "me" | "team"` (the retired `"org"` value is silently coerced to `"team"`). Propagation (`pull.ts` / `auto-pull.ts`) MUST respect the resolved scope. Fanning a `me`-scoped skill to teammates is a privacy finding handed to security-worker-bee.

### 12. Recall quality is measured, not vibed

Precision/recall over a fixed query set, run before and after any weighting or pipeline change. "Feels better" is not evidence. See `guides/10-recall-quality-eval.md`.

---

## Severity rubric

- **Must-fix** - null-vector throw; non-768 query vector; a dropped `UNION ALL` arm; fast-path/slow-path divergence; a `<#>` query run against a NULL column (garbage instead of fallback); a mined skill with no provenance row; a `me`-scoped skill propagated to teammates. Blocks merge.
- **Should-refactor** - one fixed hybrid weighting for every query; silent lexical fallback when the user expected semantic, with no signal; gate prompt drifted from KEEP/MERGE/SKIP; no recall-quality snapshot before a pipeline change; propagation re-fanning the same version repeatedly. Opens a ticket.
- **Style** - naming, helper placement, comment density. Never blocks a PR.

The severity of a finding is its credibility.

---

## Cross-Bee handoffs

- Embedding daemon/model/quantization -> **embeddings-runtime-worker-bee**.
- Deep Lake table schema / `FLOAT4[]` DDL / dimension change -> **deeplake-dataset-worker-bee**.
- API keys, PII in chunks or mined skills, prompt-injection via session text, scope as a security control -> **security-worker-bee**.
- Feature PRDs -> **library-worker-bee**.
- Quality evidence (precision/recall, gate-verdict distributions) -> **quality-worker-bee**.

Close-out order: security-worker-bee then quality-worker-bee.
