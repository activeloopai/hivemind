# 03 - BM25 / Lexical Fallback

When semantic recall is unavailable, Hivemind degrades to BM25/`ILIKE` lexical search. This is a designed, silent fallback - not an error. This guide is about keeping it silent when it should be, and loud when it should not.

---

## When the fallback fires

Recall runs lexical instead of semantic whenever any of these hold:

1. **`HIVEMIND_EMBEDDINGS` is off** - no embeddings are generated, so stored rows have NULL embedding columns.
2. **`HIVEMIND_SEMANTIC_SEARCH` is off** - `grep-direct.ts` / `grep-interceptor.ts` set `SEMANTIC_ENABLED` / `SEMANTIC_SEARCH_ENABLED` to false and never compute a query vector.
3. **The embed daemon is unreachable** - the `EmbedClient` returns `null`, so `SearchOptions.queryEmbedding` is `null` and the core sticks with lexical (`grep-core.ts` comment is explicit on this).
4. **The column is NULL for a row** - a record captured while embeddings were off has no `summary_embedding` / `message_embedding`; the `<#>` arm cannot score it, so it only surfaces via the lexical arm.

---

## Why it is silent

The fallback is the reliability guarantee. Recall must never hard-fail because an optional dependency (the ~600MB transformers stack, the daemon) is absent. A user who never turned embeddings on still gets working recall - it just covers less semantic ground. Off is a shipped, legitimate configuration; never frame it as broken.

A null query vector takes the lexical path without throwing. A `<#>` query run anyway against a NULL column returns garbage, not a clean fallback - that is a must-fix (`00-principles.md` §5).

---

## When silence becomes a finding

Silent-when-expected is correct. Silent-when-surprising is a should-refactor. The case to surface:

- The user clearly expected semantic recall (a conceptual, paraphrase-heavy query), and
- recall silently ran lexical (daemon down, toggle off, or NULL columns), and
- nothing told them.

The fix is not to break the fallback - it is to surface a signal: log that the query degraded, or expose the embeddings posture so the user knows recall ran with one arm tied. The fallback stays; the silence is what gets fixed.

---

## What lexical recall is good at (and not)

| Strong | Weak |
|---|---|
| exact identifiers (`retryCount`, `useAuthStore`) | paraphrases ("the retry logic") |
| error strings, stack frames | synonyms ("login" vs "sign-in") |
| file paths, flags, env var names | conceptual recall across vocabulary |
| rare tokens | "the gist of that conversation" |

If a corpus and query mix lean toward the left column, BM25/ILIKE may already be enough and turning embeddings on buys little. See `05-semantic-vs-lexical.md`.

---

## Diagnosing a fallback-investigation

1. **Check the toggles** - `HIVEMIND_EMBEDDINGS`, `HIVEMIND_SEMANTIC_SEARCH`.
2. **Ping the daemon** - did `EmbedClient` return a vector or `null`?
3. **Check the columns** - are `summary_embedding` / `message_embedding` populated for the rows in scope, or NULL?
4. **Confirm no broken `<#>`** - a query that errored or returned garbage instead of degrading cleanly is the must-fix.
5. **Decide if the silence is a finding** - did the user expect semantic? If so, recommend a degradation signal, not a fallback removal.
