# 01 - Recall Pipeline

How Hivemind answers a recall query. The whole pipeline lives in `src/shell/grep-core.ts` (the shared core) with a pre-tool-use fast path in `src/hooks/grep-direct.ts`.

---

## The shape: one UNION ALL across two tables

`searchDeeplakeTables` runs a single `UNION ALL` query against:

| Table | Column searched | What it holds |
|---|---|---|
| `memory` | `summary` (+ `summary_embedding` for semantic) | model-written session summaries |
| `sessions` | `message` JSONB (+ `message_embedding` for semantic) | raw captured dialogue |

Both arms always run. The result is a flat list of `{ path, content }` rows from either source. Searching only one table is a recall regression (`00-principles.md` §2).

Why both: summaries are dense and high-signal but lossy; raw sessions are verbose but complete. The summary arm catches "the gist of that session", the raw arm catches "the exact thing someone typed". Dropping either loses a class of recall.

---

## Three responsibilities of the core

From the file header, `grep-core.ts` owns:

1. **`searchDeeplakeTables`** - the `UNION ALL` across `memory` and `sessions`, returning `{ path, content }`.
2. **`normalizeSessionContent`** - when a row comes from a session path, the single-line JSON blob is turned into multi-line `Speaker: text` so the standard line-wise regex refinement surfaces only matching turns, not the whole ~5 KB blob. Falls back to the raw content if parsing fails or the path is not a session.
3. **`refineGrepMatches`** - line-by-line regex match with the usual grep flags (`ignoreCase`, `wordMatch`, `filesOnly`, `countOnly`, `lineNumber`, `invertMatch`, `fixedString`).

The flow: fetch candidate rows (semantic or lexical) -> normalize session blobs to lines -> refine with the regex -> return matches.

---

## Semantic vs lexical, chosen inside SearchOptions

`SearchOptions.queryEmbedding?: number[] | null` is the switch:

- **A vector present** -> semantic (cosine) search via the `<#>` operator against `summary_embedding` / `message_embedding`.
- **`null`** -> the daemon was unreachable; stick with the BM25/`LIKE` path. Never throw, never run a broken `<#>` (`00-principles.md` §5).
- **Absent** -> lexical.

Other `SearchOptions` knobs that shape the SQL:

- `pathFilter` - a SQL fragment applied to BOTH arms (e.g. ` AND (path = '/x' OR path LIKE '/x/%')`).
- `contentScanOnly` - true fetches all rows under the path filter for in-memory regex; false filters server-side with `LIKE`/`ILIKE`.
- `likeOp` - `"LIKE"` (case-sensitive) vs `"ILIKE"` (case-insensitive); case matters.
- `escapedPattern` - LIKE-escaped pattern via `sqlLike`.
- `prefilterPattern` / `prefilterPatterns` - safe literal anchors for regex queries (e.g. `foo.*bar` -> `foo`) so the server can pre-narrow before the in-memory regex.
- `multiWordPatterns` - per-word patterns for non-regex multi-word queries, OR-joined.
- `limit` - per-table row cap (applied per arm, not across the union).

---

## Slow path vs fast path

| Path | Caller | File |
|---|---|---|
| Slow path | `grep-interceptor.ts` inside `deeplake-shell` | `src/shell/grep-interceptor.ts` |
| Fast path | pre-tool-use hook | `src/hooks/grep-direct.ts` |

Both call into the shared core. The fast path exists to answer common recall before a tool call without the full shell round-trip. It must produce the same matches the slow path would - see `06-fast-path-grep-direct.md`.

---

## What to check on a recall-audit

1. **Did both UNION ALL arms run?** A query that returns only summaries or only raw turns is suspect.
2. **Semantic or lexical?** Inspect `queryEmbedding` - was it a 768-length vector or `null`?
3. **Did normalization fire?** Session-path matches should be `Speaker: text` lines, not a 5 KB JSON blob.
4. **Was the limit hit?** A per-table cap can truncate the better arm.
5. **Is the path filter too tight?** A `pathFilter` that over-narrows starves recall.
