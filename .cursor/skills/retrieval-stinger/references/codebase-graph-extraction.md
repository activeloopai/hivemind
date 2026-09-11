# Codebase Graph Extraction - tree-sitter into the `codebase` table

Reference for the structural index that complements dialogue recall. Built by `src/graph/*`, stored in the `codebase` Deep Lake table. Phase 1.5 per `src/graph/types.ts`.

## What gets extracted

Tree-sitter parses source files into concrete syntax trees, from which the builder extracts:

- **File nodes** - the coarse units.
- **Symbol nodes** - functions, classes, methods, declarations (tree-sitter named nodes).
- **Import edges** - file-to-file dependencies.

The graph answers structural recall ("what calls this", "where is this defined", "what imports that") that vector or token recall over dialogue cannot.

## Why tree-sitter chunks better than fixed windows

Tree-sitter follows real syntactic boundaries. A chunk is a whole function or class, not an arbitrary N-character window that can split a function mid-body. Symbol-aligned chunks are meaningful retrieval units; character-window chunks retrieve fragments.

## Parse robustness

`src/graph/types.ts` tracks an error-node array per file: empty on a clean parse, populated when tree-sitter reports `ERROR` nodes. A file that parses with errors yields a degraded graph for that file - it should be flagged, not silently indexed as if clean.

## Currency and storage

- Incremental rebuild via `diff.ts` / `history.ts` / `snapshot.ts` / `last-build.ts` - change one file, diff-rebuild, do not re-parse the repo.
- `build-lock.ts` serializes builds so two do not race.
- Triggers wired through `git-hook-install.ts`, `graph-on-stop.ts`, `spawn-pull-worker.ts`.
- `deeplake-push.ts` / `deeplake-pull.ts` write/read the `codebase` table; `vfs-handler.ts` serves it over the VFS.

## Boundary

Querying the `codebase` table for structural matches is retrieval-worker-bee's. The table schema/DDL is deeplake-dataset-worker-bee's. Language coverage is bounded by available tree-sitter grammars; an unsupported language yields file-level nodes only, and that gap should be stated.
