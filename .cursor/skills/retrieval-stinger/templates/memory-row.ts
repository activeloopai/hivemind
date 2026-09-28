/**
 * Template: `memory` table row (codified summary)
 *
 * The `memory` table holds codified summaries - the lexical+semantic recall
 * surface for "what did we learn." `summary` is plain text; `summary_embedding`
 * is the 768-dim FLOAT4[] nomic vector used by the `<#>` cosine branch.
 *
 * Source of truth: src/embeddings/columns.ts (SUMMARY_EMBEDDING_COL, EMBEDDING_DIMS = 768),
 *                  src/hooks/*/capture.ts (INSERT), src/shell/grep-core.ts (SELECT).
 */

import { EMBEDDING_DIMS } from "../../../../src/embeddings/columns.js"; // = 768

export interface MemoryRow {
  /** VFS path under ~/.deeplake/memory, e.g. "/memory/embeddings/daemon-socket". */
  path: string;

  /** Plain-text codified summary. This is the lexical (BM25/ILIKE) search column. */
  summary: string;

  /**
   * 768-dim FLOAT4[] embedding of `summary`, produced by the daemon
   * (nomic-embed-text-v1.5, q8). NULL when embeddings were off at capture time -
   * a NULL here makes the row invisible to the semantic `<#>` branch.
   */
  summary_embedding: number[] | null;

  /** Scope tag - "me" (local) or "team" (eligible for propagation). */
  scope: "me" | "team";

  createdAt: Date;
}

/** Guard: an embedding, if present, must be exactly EMBEDDING_DIMS long. */
export function assertEmbeddingDims(vec: number[] | null): void {
  if (vec && vec.length !== EMBEDDING_DIMS) {
    throw new Error(`summary_embedding must be ${EMBEDDING_DIMS}-dim, got ${vec.length}`);
  }
}

/** Example INSERT payload (embeddings on). */
export const exampleMemoryRow: MemoryRow = {
  path: "/memory/embeddings/daemon-socket",
  summary:
    "The embeddings daemon listens on a unix socket and speaks NDJSON (one JSON object per line). " +
    "If the socket path moves with the home dir, recall silently falls back to BM25.",
  summary_embedding: null, // filled by the embed worker; null here = not yet embedded
  scope: "team",
  createdAt: new Date(),
};
