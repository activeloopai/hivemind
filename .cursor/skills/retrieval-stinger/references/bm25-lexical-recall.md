# BM25 / Lexical Recall - the fallback and keyword arm

Reference for the lexical side of recall. It plays two roles: the silent fallback when semantic is unavailable, and the keyword-precise arm inside hybrid.

## The mechanisms

- **BM25** - term-frequency ranking. Scores a row by how well its tokens match the query terms, normalized for document length and term rarity. Good at surfacing rows that contain the rare, exact tokens the user remembers.
- **`ILIKE` / `LIKE`** - substring match. `ILIKE` is case-insensitive, `LIKE` case-sensitive; `SearchOptions.likeOp` selects which, and case matters. Patterns are LIKE-escaped via `sqlLike` (`SearchOptions.escapedPattern`).

Both run inside `src/shell/grep-core.ts` against the `memory.summary` and `sessions.message` text.

## Role 1: the silent fallback

When embeddings are off, the daemon is down, or a column is NULL, recall runs lexical with no error (`guides/03-bm25-fallback.md`). This is the reliability guarantee - recall never hard-fails for lack of an optional dependency. Off is a shipped configuration.

## Role 2: the keyword-precise arm

Inside `deeplake_hybrid_record`, the lexical arm is what the 0.3/0.7 keyword-precise weighting leans on. When the user knows the exact identifier, error string, or path, the lexical arm nails it where the embedding would blur `retryCount` and `retryDelay` together.

## Strengths and limits

| Strong | Weak |
|---|---|
| exact identifiers, error strings, paths, flags | paraphrases and synonyms |
| rare tokens | conceptual recall across vocabulary |
| zero dependency, always available | "the gist of that conversation" |

## Query-shaping knobs

- `prefilterPattern` / `prefilterPatterns` - safe literal anchors extracted from a regex (e.g. `foo.*bar` -> `foo`) so the server pre-narrows before in-memory regex refinement.
- `multiWordPatterns` - per-word patterns for non-regex multi-word queries, OR-joined.
- `contentScanOnly` - fetch-all-then-regex vs server-side LIKE filtering.

These let lexical recall stay fast on large tables without giving up regex expressiveness in `refineGrepMatches`.
