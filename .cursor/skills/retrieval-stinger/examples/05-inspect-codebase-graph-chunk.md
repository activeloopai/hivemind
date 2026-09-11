# Example 05 - Inspect a Codebase-Graph Chunk

Hivemind builds a tree-sitter codebase graph and stores it in the `codebase` Deep Lake table.
Recall can hit graph chunks alongside memory summaries and session dialogue. This walkthrough
inspects a single chunk to confirm what got indexed and how it surfaces.

> **Reference:** `src/graph/` (`extract`, `build-lock.ts`, `deeplake-push.ts`, `deeplake-pull.ts`, `vfs-handler.ts`, `node-metadata.ts`). Tooling: `scripts/graph-chunk-inspect.ts`.

---

## Invocation

> "Show me what the graph indexed for `src/shell/grep-core.ts` and whether it's embedded."

---

## Step 1 - Confirm the graph is built

The graph build is git-hook driven (`git-hook-install.ts`) and lock-guarded (`build-lock.ts`).
Check the last build and that the file is covered (not in `ignore-config.ts`).

```bash
node scripts/graph-chunk-inspect.ts --build-status
# prints last build commit, node count, ignored globs
```

---

## Step 2 - Pull the chunk

Tree-sitter extraction (`src/graph/extract`) splits the file into node-level chunks
(functions, classes, exported symbols) with metadata from `node-metadata.ts`: symbol name,
kind, byte range, file path, language.

```bash
node scripts/graph-chunk-inspect.ts --path src/shell/grep-core.ts --symbol searchDeeplakeTables
```

Expected:

```
path:    src/shell/grep-core.ts
symbol:  searchDeeplakeTables
kind:    function
bytes:   1240..3980
lang:    typescript
embedded: true   (chunk_embedding populated, 768-dim)
```

---

## Step 3 - Verify it's embedded

Graph chunks live in the `codebase` table. For semantic recall to reach a chunk its embedding
column must be populated (same 768-dim nomic vectors as memory/sessions).

```sql
SELECT path, symbol, chunk_embedding IS NOT NULL AS embedded
  FROM codebase
 WHERE path = 'src/shell/grep-core.ts';
```

`embedded = false` means the chunk is in the graph but invisible to semantic recall - re-run
the graph push (`deeplake-push.ts`) with embeddings on.

---

## Step 4 - Confirm it surfaces in recall

```bash
node scripts/recall-trace.ts "where do we run the union across memory and sessions"
```

A healthy result includes the `searchDeeplakeTables` chunk near the top - that function is the
literal answer, and the graph chunk lets recall point at the exact symbol, not just a summary
that talks about it.

---

## Why this matters

The graph turns the codebase into a third recall surface alongside `memory` and `sessions`.
A query like "which function normalizes session JSON" should land on `normalizeSessionContent`
directly. If graph chunks aren't embedded, recall can only find code via summaries that happen
to mention it - much weaker. Keeping the graph built and embedded is part of recall quality,
not a separate feature.

---

## Common findings

| Finding | Fix |
|---|---|
| file missing from graph | check `ignore-config.ts`; rebuild |
| chunk present, `embedded=false` | re-push with embeddings on |
| stale chunk (old byte range) | graph build didn't run on last commit; verify git hook installed |
| symbol over-split / under-split | tree-sitter grammar mismatch for the language; check `extract` |
