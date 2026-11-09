-- Template: Hybrid Recall Query (memory + sessions)
--
-- The canonical Hivemind recall shape. One UNION ALL across the `memory` table
-- (codified summaries, column `summary`) and the `sessions` table (raw dialogue,
-- column `message` JSONB). Semantic ranking via Deep Lake `<#>` cosine on the
-- 768-dim FLOAT4[] embedding columns. BM25/ILIKE is the fallback when embeddings
-- are off or the daemon is unreachable.
--
-- Source of truth: src/shell/grep-core.ts (searchDeeplakeTables),
--                  src/embeddings/columns.ts (EMBEDDING_DIMS = 768).
--
-- Bind params:
--   $vec  -> 768-dim FLOAT4[] query vector from the EmbedClient (nomic-embed-text-v1.5)
--   $text -> raw query string (lexical branch / hybrid lexical weight)
--   $pat  -> sqlLike-escaped pattern for the pure-lexical fallback


-- ============================================================================
-- 1. SEMANTIC PATH (embeddings on, daemon reachable)
--    `<#>` is negative inner product: smaller = closer. Order ascending.
-- ============================================================================
SELECT path, summary AS content, (summary_embedding <#> $vec::float4[]) AS dist
  FROM memory
 WHERE summary_embedding IS NOT NULL
UNION ALL
SELECT path, message::text AS content, (message_embedding <#> $vec::float4[]) AS dist
  FROM sessions
 WHERE message_embedding IS NOT NULL
 ORDER BY dist ASC
 LIMIT 40;


-- ============================================================================
-- 2. HYBRID PATH (blend semantic + lexical with explicit weights)
--    deeplake_hybrid_record(vec, text, w1_semantic, w2_lexical)
--    Presets: 0.7/0.3 conceptual | 0.5/0.5 balanced | 0.3/0.7 keyword-precise
--    See templates/hybrid-weight-worksheet.md.
-- ============================================================================
SELECT path, content, score
  FROM deeplake_hybrid_record($vec::float4[], $text, 0.7, 0.3)
 ORDER BY score DESC
 LIMIT 40;


-- ============================================================================
-- 3. LEXICAL FALLBACK (embeddings off OR daemon timed out -> queryEmbedding null)
--    Pure BM25/ILIKE. This is the silent default, not an error path.
-- ============================================================================
SELECT path, summary AS content
  FROM memory
 WHERE summary ILIKE $pat
UNION ALL
SELECT path, message::text AS content
  FROM sessions
 WHERE message::text ILIKE $pat
 LIMIT 40;


-- ============================================================================
-- 4. OPTIONAL: include the codebase graph as a third recall surface
--    Graph chunks live in the `codebase` table (tree-sitter, 768-dim).
-- ============================================================================
SELECT path, summary AS content, (summary_embedding  <#> $vec::float4[]) AS dist FROM memory   WHERE summary_embedding  IS NOT NULL
UNION ALL
SELECT path, message::text     AS content, (message_embedding  <#> $vec::float4[]) AS dist FROM sessions WHERE message_embedding  IS NOT NULL
UNION ALL
SELECT path, symbol            AS content, (chunk_embedding    <#> $vec::float4[]) AS dist FROM codebase WHERE chunk_embedding    IS NOT NULL
 ORDER BY dist ASC
 LIMIT 40;


-- ----------------------------------------------------------------------------
-- Notes
--  * No reranker. Ranking is `<#>` cosine (semantic) or BM25 (lexical), then the
--    line-wise regex refinement in refineGrepMatches. There is no second-stage model.
--  * sessions.message is JSONB; normalizeSessionContent() serializes it to multi-line
--    "Speaker: text" BEFORE regex refinement so only matching turns surface.
--  * A NULL embedding column drops the row from the semantic branch entirely. Backfill,
--    don't tune weights, to fix a missing-embedding miss.
