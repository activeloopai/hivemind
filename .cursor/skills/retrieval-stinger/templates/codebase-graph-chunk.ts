/**
 * Template: `codebase` table chunk (tree-sitter graph node)
 *
 * The codebase graph is a third recall surface alongside `memory` and `sessions`.
 * Tree-sitter (src/graph/extract) splits each file into node-level chunks
 * (functions, classes, exported symbols) with metadata, embedded at 768-dim so
 * semantic recall can point at an exact symbol, not just a summary that mentions it.
 *
 * Source of truth: src/graph/ (extract, node-metadata.ts, deeplake-push.ts, deeplake-pull.ts),
 *                  src/embeddings/columns.ts (EMBEDDING_DIMS = 768).
 */

import { EMBEDDING_DIMS } from "../../../../src/embeddings/columns.js"; // = 768

export type SymbolKind = "function" | "class" | "method" | "interface" | "type" | "const" | "export";

export interface CodebaseChunk {
  /** Source file path, e.g. "src/shell/grep-core.ts". */
  path: string;

  /** Symbol name, e.g. "searchDeeplakeTables". */
  symbol: string;

  /** Tree-sitter node kind. */
  kind: SymbolKind;

  /** Language id from the tree-sitter grammar. */
  lang: string;

  /** Byte range of the node in the source file [start, end). */
  bytes: [number, number];

  /**
   * 768-dim FLOAT4[] embedding of the chunk. NULL = chunk is in the graph but
   * invisible to semantic recall; re-push with embeddings on (deeplake-push.ts).
   */
  chunk_embedding: number[] | null;

  /** Build commit the chunk was extracted at - stale if behind HEAD. */
  buildCommit: string;
}

export function assertEmbeddingDims(vec: number[] | null): void {
  if (vec && vec.length !== EMBEDDING_DIMS) {
    throw new Error(`chunk_embedding must be ${EMBEDDING_DIMS}-dim, got ${vec.length}`);
  }
}

export const exampleChunk: CodebaseChunk = {
  path: "src/shell/grep-core.ts",
  symbol: "searchDeeplakeTables",
  kind: "function",
  lang: "typescript",
  bytes: [1240, 3980],
  chunk_embedding: null, // filled by the graph embed step
  buildCommit: "HEAD",
};
