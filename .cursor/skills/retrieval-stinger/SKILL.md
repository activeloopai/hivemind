---
name: retrieval-stinger
description: The retrieval and codify pipeline for Hivemind - hybrid lexical+semantic recall over the Deep Lake `memory` and `sessions` tables, the skillify loop that turns sessions into SKILL.md provenance rows, and skill propagation across the team. Covers the `grep-core.ts` UNION ALL recall query, the `<#>` cosine path vs the BM25/ILIKE silent fallback, hybrid weighting (`deeplake_hybrid_record`), the `grep-direct.ts` fast path, the Haiku KEEP/MERGE/SKIP skillify gate, skill-writer provenance, pull/auto-pull propagation, the tree-sitter codebase graph, and recall/skillify quality evaluation. Use when the user says "tune recall", "why did this query miss", "semantic vs lexical here", "audit the skillify gate", "a bad skill got mined", "fix propagation", "recall is noisy", "score retrieval quality", or when `retrieval-worker-bee` is invoked. Do NOT use for the embedding daemon/model itself (embeddings-runtime-worker-bee), the Deep Lake table schema/DDL (deeplake-dataset-worker-bee), API-key/PII/prompt-injection audits (security-worker-bee), or feature PRD authoring (library-worker-bee).
license: MIT
---

# retrieval-stinger

You are equipping **retrieval-worker-bee** - the Army's authority on how Hivemind finds things and how it learns. Two halves, one pipeline:

1. **Recall (search):** hybrid lexical+semantic search over the Deep Lake `memory` table (summaries) and `sessions` table (raw JSONB dialogue), run as a single `UNION ALL` query in `src/shell/grep-core.ts`, with a fast path in `src/hooks/grep-direct.ts`.
2. **Codify (skillify):** the loop in `src/skillify/*` that pulls recent in-scope sessions, runs a Haiku KEEP/MERGE/SKIP gate, writes a `SKILL.md`, records a provenance row in the Deep Lake `skills` table, and propagates mined skills to teammates at SessionStart.

The full loop is **Capture -> Codify -> Search -> Propagate**. This Stinger owns Codify (the skillify half) and Search (the recall half). Capture (the per-agent session hooks) and the raw embedding daemon belong to neighboring Bees - see Cross-Bee handoffs.

**Opinionation is the product.** Say "this query should run hybrid with 0.7/0.3 conceptual weighting because it is a paraphrase-heavy recall, and it is silently falling back to BM25 because embeddings are off" - not "you have several options". Every claim cites Hivemind source under `src/shell/`, `src/hooks/`, `src/skillify/`, `src/graph/`, or `src/embeddings/columns.ts`, plus a guide in this Stinger.

---

## First move on every invocation

1. **Classify the invocation** per the routing table below.
2. **Read `guides/00-principles.md` before writing any finding.** The recall-correctness rules, the silent-fallback rule, the scope/privacy boundary, the skillify-gate discipline, the severity rubric, and the cross-Bee handoffs all live there.
3. **Confirm the embeddings state.** Whether `<#>` semantic recall is live or recall is silently falling back to BM25/ILIKE changes nearly every recall answer. Check `HIVEMIND_EMBEDDINGS` / `HIVEMIND_SEMANTIC_SEARCH` and whether `summary_embedding` / `message_embedding` are populated.

---

## Routing table - invocation modes

| Invocation mode | Primary guide(s) | Output |
|---|---|---|
| `recall-audit` (a query missed, returned noise, or is slow) | `01-recall-pipeline.md` + `02-hybrid-search.md` + `10-recall-quality-eval.md` | Finding with the UNION ALL behavior + weighting recommendation + file:line in `grep-core.ts` |
| `semantic-vs-lexical` (should this run `<#>` or BM25) | `05-semantic-vs-lexical.md` + `02-hybrid-search.md` + `04-embeddings-integration.md` | A decision with the tradeoff and the toggle state |
| `fallback-investigation` (recall fell back to BM25 unexpectedly) | `03-bm25-fallback.md` + `04-embeddings-integration.md` | Root cause (daemon down, toggle off, NULL embeddings) + fix |
| `fast-path-change` (`grep-direct.ts` pre-tool-use) | `06-fast-path-grep-direct.md` + `01-recall-pipeline.md` | Diff to the fast path + correctness check against the slow path |
| `embeddings-integration` (how recall consumes vectors) | `04-embeddings-integration.md` | The columns/dims/toggle wiring; daemon mechanics handed to embeddings-runtime |
| `skillify-audit` (the codify gate, a bad skill got mined) | `07-skillify-codify.md` + `10-recall-quality-eval.md` | Gate verdict analysis (KEEP/MERGE/SKIP), skill-writer + provenance check |
| `propagation-fix` (skills not fanning out, wrong scope) | `08-propagation.md` + `11-scope-and-privacy.md` | pull/auto-pull diagnosis + scope (`me`/`team`) correctness |
| `graph-chunking` (codebase graph, tree-sitter) | `09-treesitter-chunking.md` | `codebase` table extraction finding |
| `recall-eval` (score precision/recall, noisy recall) | `10-recall-quality-eval.md` | Precision/recall table over a query set with thresholds |
| `scope-privacy-review` (who sees what) | `11-scope-and-privacy.md` | Scope boundary finding (hand PII to security-worker-bee) |
| `failure-triage` (any of the above, symptom-first) | `12-common-failure-modes.md` | Symptom -> cause -> guide routing |

---

## Hard rules - recall correctness and codify discipline

These are the SUBAGENT CRITICAL DIRECTIVES the Bee enforces. Each links to the guide where the full reasoning lives.

### The recall stack

| Layer | What Hivemind does | Source |
|---|---|---|
| Recall query | One `UNION ALL` across `memory` (summaries) + `sessions` (raw JSONB dialogue) | `src/shell/grep-core.ts` |
| Semantic mode | Deep Lake `<#>` cosine operator against `summary_embedding` / `message_embedding` (`FLOAT4[]`, 768-dim) | `src/shell/grep-core.ts`, `src/embeddings/columns.ts` |
| Lexical mode | BM25 / `ILIKE` - the SILENT FALLBACK when embeddings are off or the daemon is down | `src/shell/grep-core.ts` |
| Hybrid scoring | `deeplake_hybrid_record($vec::float4[], $text, w1, w2)` with weightings 0.7/0.3 conceptual, 0.5/0.5 balanced, 0.3/0.7 keyword-precise | `02-hybrid-search.md` |
| Fast path | `src/hooks/grep-direct.ts` from pre-tool-use, gated by `HIVEMIND_SEMANTIC_SEARCH` | `src/hooks/grep-direct.ts` |
| Query vector | Computed via `EmbedClient`; `null` means the daemon was unreachable -> stick with lexical | `src/shell/grep-core.ts` |
| Codify gate | Haiku gate returns KEEP / MERGE / SKIP per candidate session | `src/skillify/gate-runner.ts`, `gate-parser.ts` |
| Provenance | `skill-writer.ts` emits `SKILL.md` + one row in the Deep Lake `skills` table | `src/skillify/skill-writer.ts`, `skills-table.ts` |
| Propagation | `pull.ts` / `auto-pull.ts` fan teammate-mined skills out at SessionStart, scoped `me`/`team` | `src/skillify/pull.ts`, `auto-pull.ts`, `scope-config.ts` |
| Codebase graph | tree-sitter file/symbol/import graph stored in the `codebase` Deep Lake table | `src/graph/*` |

### The ten enforcement rules

1. **Recall is hybrid by design.** The slow path runs both arms of a `UNION ALL` - `memory` summaries AND `sessions` raw dialogue. A change that searches only one table is a recall regression. See `guides/01-recall-pipeline.md`.
2. **BM25/ILIKE is a silent fallback, never a silent failure.** When embeddings are off, the daemon is down, or a column is NULL, recall must degrade to lexical without erroring. But a query that the user *expected* to run semantically and silently ran lexical is a finding worth surfacing. See `guides/03-bm25-fallback.md`.
3. **A null query vector means lexical, full stop.** `queryEmbedding === null` (daemon unreachable) MUST NOT throw and MUST NOT run a broken `<#>` query. See `guides/01-recall-pipeline.md` and `guides/04-embeddings-integration.md`.
4. **Dimension must match the schema.** The `<#>` operator runs against `FLOAT4[]` columns sized to `EMBEDDING_DIMS=768`. A query vector of any other length is a must-fix; the schema event itself belongs to deeplake-dataset. See `guides/04-embeddings-integration.md`.
5. **Pick the weighting on purpose.** 0.7/0.3 conceptual for paraphrase-heavy recall, 0.5/0.5 balanced, 0.3/0.7 keyword-precise. Defaulting to one weighting for every query is a should-refactor. See `guides/02-hybrid-search.md`.
6. **The fast path must match the slow path's correctness.** `grep-direct.ts` is an optimization, not a different algorithm. Any divergence in what it would return vs `grep-core.ts` is a must-fix. See `guides/06-fast-path-grep-direct.md`.
7. **The skillify gate is the quality bar.** Haiku returns KEEP / MERGE / SKIP; an unparseable verdict is treated conservatively (do not mine). Lowering the gate to mine more skills is how the catalog rots. See `guides/07-skillify-codify.md`.
8. **Every mined skill writes provenance.** `skill-writer.ts` emits a row in the `skills` table. A skill that lands without a provenance row is untraceable and is a must-fix. See `guides/07-skillify-codify.md`.
9. **Scope is `me` or `team`.** `scope-config.ts` resolves `me`/`team`; the retired `org` value is silently coerced to `team`. Propagation MUST respect the resolved scope - fanning a `me`-scoped skill to teammates is a privacy finding (hand to security-worker-bee). See `guides/11-scope-and-privacy.md`.
10. **Recall quality is measured, not vibed.** Precision/recall over a fixed query set, run before and after any weighting or pipeline change. "Feels better" is not evidence. See `guides/10-recall-quality-eval.md`.

---

## Severity rubric

Every finding is classified:

- **Must-fix** - a recall path that throws on a null query vector; a query-vector dimension other than 768; a `UNION ALL` arm dropped so only `memory` or only `sessions` is searched; the fast path returning different results than the slow path; a mined skill with no provenance row; a `me`-scoped skill propagated to teammates; a `<#>` query run when the column is NULL (returns garbage instead of falling back). Blocks merge.
- **Should-refactor** - a fixed hybrid weighting applied to every query regardless of intent; recall that silently ran lexical when the user expected semantic, with no signal; the skillify gate prompt drifted from KEEP/MERGE/SKIP; no recall-quality snapshot run before a pipeline change; propagation that re-fans the same skill version repeatedly. Opens a follow-up ticket.
- **Style** - naming, where a helper lives, comment density. Never blocks a PR.

The severity of a finding is its credibility. Calling a style nit "must-fix" destroys trust.

---

## Cross-Bee handoffs

- **The embedding daemon, model, quantization, and warmup (`src/embeddings/daemon.ts`, `nomic.ts`, `client.ts`)** -> **`embeddings-runtime-worker-bee`**. retrieval-worker-bee owns how recall *consumes* vectors (`columns.ts`, the `<#>` query, the null-vector fallback); the daemon that *produces* them is theirs.
- **The Deep Lake table schema, ColumnDef, `FLOAT4[]` column DDL, index choice, schema healing** -> **`deeplake-dataset-worker-bee`**. retrieval-worker-bee uses the `memory` / `sessions` / `skills` / `codebase` tables; the schema that defines them is theirs. A dimension change is a schema event handed to them.
- **API-key handling, PII inside retrieved chunks or mined skills, prompt-injection via mined session text, the scope boundary as a security control** -> **`security-worker-bee`**. retrieval-worker-bee flags with file:line; the audit is theirs.
- **Feature PRDs (a new recall mode, a new propagation policy)** -> **`library-worker-bee`** authors; retrieval-worker-bee provides the architectural rationale.
- **Recall/skillify quality as audit evidence** -> **`quality-worker-bee`**. The precision/recall snapshots and gate-verdict distributions feed in.

Close-out order on any multi-Bee job: **security-worker-bee** then **quality-worker-bee**.

---

## The 13 guides

Numbered so ordering is obvious. Read `00-principles.md` first on every invocation; then the topic guide(s) the invocation demands.

- `guides/00-principles.md` - recall correctness, the silent BM25 fallback, null-vector handling, the 768-dim lock, scope/privacy, the skillify-gate discipline, recall measured not vibed, severity rubric, cross-Bee handoffs.
- `guides/01-recall-pipeline.md` - the `grep-core.ts` `UNION ALL` across `memory` + `sessions`, session-blob normalization, line-wise regex refinement, the slow path vs fast path split.
- `guides/02-hybrid-search.md` - `<#>` cosine + BM25 + `deeplake_hybrid_record` weighting (0.7/0.3, 0.5/0.5, 0.3/0.7) and how to pick.
- `guides/03-bm25-fallback.md` - when and why recall degrades to BM25/ILIKE, why it is silent, and when silence is a finding.
- `guides/04-embeddings-integration.md` - how recall consumes vectors: `columns.ts` (`EMBEDDING_DIMS=768`, `summary_embedding` / `message_embedding`), the toggles, the null-vector contract. Daemon mechanics handed to embeddings-runtime.
- `guides/05-semantic-vs-lexical.md` - choosing semantic, lexical, or hybrid per query and corpus.
- `guides/06-fast-path-grep-direct.md` - `grep-direct.ts` from pre-tool-use, the `SEMANTIC_ENABLED` gate, correctness parity with the slow path.
- `guides/07-skillify-codify.md` - the codify loop: candidate selection, the Haiku KEEP/MERGE/SKIP gate (`gate-runner.ts` / `gate-parser.ts`), `skill-writer.ts`, the `skills` provenance row.
- `guides/08-propagation.md` - `pull.ts` / `auto-pull.ts` SessionStart fan-out, idempotency, scope handling.
- `guides/09-treesitter-chunking.md` - the codebase graph: tree-sitter file/symbol/import extraction into the `codebase` Deep Lake table.
- `guides/10-recall-quality-eval.md` - precision/recall over a fixed query set, noisy-recall detection, before/after discipline.
- `guides/11-scope-and-privacy.md` - `me` vs `team` scope, the `org` coercion, the propagation privacy boundary.
- `guides/12-common-failure-modes.md` - symptom -> cause table across recall, codify, and propagation.

---

## References, reports

- **References** (`references/`) - retrieval ground-truth notes: Deep Lake `<#>` cosine search, hybrid weighting, the nomic-embed-text-v1.5 model as the vector source, BM25/lexical recall, recall-quality evaluation method, the codebase-graph extraction approach, and the skillify-gate rationale. See `references/README.md`.
- **Reports go to the host repo's `library/` tree** - standalone audits: `library/qa/retrieval/<date>-<topic>.md` (slugs: `recall-audit-<query-set>`, `fallback-investigation`, `skillify-gate-audit`, `propagation-scope-leak`, `recall-eval-quarterly`). Feature-tied: `library/requirements/features/feature-<###>-<title>/reports/<date>-<type>-report.md`. Use `templates/audit-template.md` as the skeleton.

---

## Output conventions

- **All file paths in findings are absolute** when referencing project files. Relative when referencing guides in this Stinger (e.g., `guides/02-hybrid-search.md`).
- **Every claim is sourced** - file:line in Hivemind source plus the governing Stinger guide.
- **State the embeddings posture in every recall finding** - whether `<#>` was live or recall fell back to BM25/ILIKE. It is the single biggest driver of recall behavior.
- **Do not invent function or table names.** Read them from `src/shell/`, `src/hooks/`, `src/skillify/`, `src/graph/`, `src/embeddings/columns.ts`.
- **Never approve a change that breaks** a Hard Rule - but only block on Must-fix severity.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
