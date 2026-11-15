# Codebase Graph - tree-sitter, the `codebase` recall surface

**Source:** `src/graph/` (`extract`, `node-metadata.ts`, `deeplake-push.ts`, `deeplake-pull.ts`, `vfs-handler.ts`, `build-lock.ts`, `git-hook-install.ts`, `ignore-config.ts`).
**Retrieved:** 2026-06-16
**Status:** INFORMATIONAL. A third recall surface alongside memory + sessions.

---

## TL;DR

Hivemind builds a tree-sitter codebase graph and stores node-level chunks in the `codebase`
Deep Lake table. Chunks are embedded at 768-dim, so semantic recall can point at an exact symbol
(function/class) instead of just a summary that mentions it.

---

## Key facts

- `src/graph/extract` runs tree-sitter to split files into node-level chunks (functions, classes,
  exported symbols) with metadata from `node-metadata.ts` (symbol, kind, byte range, path, lang).
- The build is git-hook driven (`git-hook-install.ts`) and lock-guarded (`build-lock.ts`).
  `ignore-config.ts` controls what's excluded.
- `deeplake-push.ts` / `deeplake-pull.ts` sync the graph to/from Deep Lake.
- Chunk embeddings (`chunk_embedding`, 768-dim FLOAT4[]) make chunks reachable by the same `<#>`
  semantic branch as memory/sessions. NULL embedding -> chunk is in the graph but not semantically
  reachable.

---

## How it ties to recall

- Adds a UNION arm: a query like "which function normalizes session JSON" can land directly on
  `normalizeSessionContent` rather than a summary about it. Strong code recall.

---

## Implications for the guides

- Graph health (built, current, embedded) is part of recall quality, not a separate feature.
- A stale graph (hook didn't run on the last commit) gives chunks with old byte ranges -> recall
  points at the wrong span.

---

## Caveats

- Chunk granularity is node-level; whether file- or class-level would recall better is untested
  (`open-questions.md` item 6).
- No automated stale-chunk sweep; staleness is a manual spot-check (`gaps.md` item 6).
