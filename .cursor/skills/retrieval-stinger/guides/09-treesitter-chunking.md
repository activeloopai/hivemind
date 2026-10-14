# 09 - Tree-sitter Chunking (Codebase Graph)

The codebase graph builds a file/symbol/import graph from traces using tree-sitter and stores it in the `codebase` Deep Lake table. It lives in `src/graph/*`. This is Hivemind's structural index of the repo, complementing the dialogue-based recall over `memory` / `sessions`.

---

## What it builds

`src/graph/*` parses source files with tree-sitter and extracts a graph of:

- **Files** - the nodes at the coarsest level.
- **Symbols** - functions, classes, methods, declarations (tree-sitter named nodes).
- **Imports** - the edges between files, so the graph captures what depends on what.

The result is stored in the `codebase` Deep Lake table (the graph feature is Phase 1.5 per `src/graph/types.ts`). Recall over this table answers structural questions ("what calls this", "where is this symbol defined") that token or vector recall over dialogue cannot.

---

## Tree-sitter as the chunker

Tree-sitter parses source into a concrete syntax tree, so chunking follows real syntactic boundaries (a whole function, a whole class) rather than fixed-size character windows. This matters: a symbol-aligned chunk is a meaningful retrieval unit, whereas a character-window chunk can split a function in half and retrieve a fragment.

Parse robustness is tracked: `types.ts` notes the error-node array is empty on a clean parse and populated when tree-sitter reports `ERROR` nodes. A file that parses with errors yields a degraded graph for that file - flag it rather than silently index a broken tree.

---

## How the graph is kept current

The `src/graph/*` machinery includes:

- **`build-lock.ts`** - serialize graph builds so two don't race.
- **`diff.ts` / `history.ts` / `last-build.ts` / `snapshot.ts`** - incremental rebuild from what changed rather than full re-parse.
- **`git-hook-install.ts` / `graph-on-stop.ts` / `spawn-pull-worker.ts`** - build/pull triggers wired into git hooks and session stop.
- **`deeplake-push.ts` / `deeplake-pull.ts`** - write the graph to / read it from the `codebase` table.
- **`vfs-handler.ts`** - serve the graph through the VFS.
- **`extract` / `render` / `resolve`** - extraction, rendering, and symbol resolution submodules.

---

## What to check on a graph-chunking finding

1. **Symbol-aligned chunks?** Extraction should follow tree-sitter named nodes, not fixed windows.
2. **Parse errors surfaced?** Files with populated `ERROR` node arrays index a degraded graph - flag, do not hide.
3. **Incremental, not full re-parse?** A change to one file should diff-rebuild, not re-parse the repo.
4. **Build lock held?** Concurrent builds corrupt the graph.
5. **Pushed to the `codebase` table?** A graph built locally but never pushed is invisible to teammates.
6. **Language coverage** - tree-sitter needs a grammar per language; an unsupported language yields no symbols, only file-level nodes. State the gap.

---

## Boundary

The graph's *recall* (querying the `codebase` table for structural matches) is this Bee's. The Deep Lake `codebase` table *schema* is deeplake-dataset-worker-bee's. A column or DDL change to `codebase` is handed to them.
