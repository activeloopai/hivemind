---
title: tree-sitter entity extraction (Hivemind src/graph)
date: 2026-04-29
sources:
  - src/graph/extract/typescript.ts
  - src/graph/extract/index.ts
  - src/graph/types.ts
  - src/deeplake-schema.ts
---

# tree-sitter entity extraction

## Summary

wiki-worker-bee extracts code entities with tree-sitter, the same engine Hivemind's codebase graph already runs in `src/graph/extract/*`. There is no ts-morph anywhere in the repo. The extractor walks a tree-sitter AST and emits declaration nodes and edges into a `FileExtraction`; wiki-worker-bee reads those and classifies them into the 13-type catalog. The node/edge model is defined in `src/graph/types.ts` and the language dispatch in `src/graph/extract/index.ts`.

## Key facts

- Nine grammars are wired: c, cpp, go, java, javascript, python, ruby, rust, typescript (`src/graph/extract/index.ts`). The TS grammar is a superset, so `.js/.mjs/.cjs` parse with `typescript` and `.jsx` with `tsx`; only the reported `language` differs.
- tree-sitter ships TWO TypeScript grammars: `typescript` for `.ts` (rejects JSX to avoid ambiguity with `<Type>value` assertions) and `tsx` for `.tsx`/`.jsx`. Using the wrong one produces spurious parse errors. `pickParserForPath` selects correctly.
- `NodeKind` values: `function | class | method | interface | type_alias | enum | const | module` (`src/graph/types.ts`). A synthetic `module` node per file is the container for top-level declarations and the source of all `imports` edges.
- `EdgeRelation` values: `imports | calls | extends | implements | method_of`. Edge `confidence` is `EXTRACTED | INFERRED | AMBIGUOUS` (Phase 1 edges are almost all `EXTRACTED`).
- Each `GraphNode` carries `id` (`<source_file>:<symbol>:<kind>`), `label`, `kind`, `source_file`, `source_location` (`L<line>` or `L<line>-<end>`), `exported`, and a one-line body-stripped `signature`.
- The extractor handles arrow/function-expression-valued `const` declarators as callers (so `const f = () => {}` is captured), dedups overloads/declaration-merging by node `id` (keeps the first), and marks only public class methods `exported`.
- Large files: tree-sitter 0.21 throws on direct string input over ~32 KB; the extractor uses the callback parse API with 16 KB chunks.

## Recommended approach for wiki-worker-bee

- Do NOT re-parse source yourself. Consume the `FileExtraction` shape the graph driver supplies (nodes + edges + parse_errors + raw_calls + import_bindings).
- Map `kind` to the catalog: `function`/`const`(arrow) -> `function`; `class` -> `class`/`service`; `interface`/`type_alias` -> `data-model`; `module` -> `module`; `const`/`enum` exported -> `exported-symbol`. Then layer the role-based sub-types (mcp-tool, env-var, config-key, deeplake-table, queue, scheduled-hook, feature-flag) from call-site/path heuristics in guide 04.
- Populate `depends_on` from outgoing `imports`/`calls` edges; leave `used_by` empty in `document` mode (the driver's reverse-lookup post-pass fills it after `src/graph/resolve/cross-file.ts`).
- Cite `source_location` for every claim. Use `signature` verbatim in the Signature block.
- For symbols referenced but not declared in the chunk, the extractor records a `raw_call` or an `unresolved:` edge target - file these as `gaps`, do not speculate.

## Sources

- `src/graph/extract/typescript.ts` - the TS/TSX extractor (declarations, imports, intra-file calls, heritage).
- `src/graph/extract/index.ts` - per-extension dispatch across the nine grammars.
- `src/graph/types.ts` - `GraphNode`, `GraphEdge`, `NodeKind`, `EdgeRelation`, `FileExtraction`.

## Open questions / gaps

- Cross-file call resolution is Phase 1.5 in the graph code (`src/graph/resolve/cross-file.ts`); `used_by` accuracy depends on that pass running.
- JSX element references in TSX are parsed but only the TS-shaped subset is extracted - JSX-specific entities are out of scope (and there is no React UI in this repo anyway).
