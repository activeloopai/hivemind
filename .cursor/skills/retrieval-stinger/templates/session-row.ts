/**
 * Template: `sessions` table row (raw dialogue)
 *
 * The `sessions` table holds raw dialogue as JSONB (`message`). It is the second
 * arm of the recall UNION ALL - the dialogue that produced the codified summaries.
 * `message_embedding` is the 768-dim FLOAT4[] vector for the semantic branch.
 *
 * IMPORTANT: `message` is a JSONB turn array, NOT plain text. Before line-wise
 * regex refinement, src/shell/grep-core.ts (normalizeSessionContent) serializes
 * it to multi-line "Speaker: text" so only matching turns surface, not the whole blob.
 *
 * Source of truth: src/embeddings/columns.ts (MESSAGE_EMBEDDING_COL, EMBEDDING_DIMS = 768),
 *                  src/hooks/*/capture.ts (INSERT), src/shell/grep-core.ts (SELECT + normalize).
 */

import { EMBEDDING_DIMS } from "../../../../src/embeddings/columns.js"; // = 768

export interface DialogueTurn {
  speaker: "user" | "assistant";
  text: string;
}

export interface SessionRow {
  /** VFS session path, e.g. "/sessions/2026-06-16-<id>". */
  path: string;

  /**
   * JSONB dialogue blob (turn array). This is the lexical column AFTER
   * normalizeSessionContent flattens it to "Speaker: text" lines.
   */
  message: DialogueTurn[];

  /**
   * 768-dim FLOAT4[] embedding of the session content. NULL when embeddings were
   * off at capture - drops the row from the semantic `<#>` branch.
   */
  message_embedding: number[] | null;

  createdAt: Date;
}

export function assertEmbeddingDims(vec: number[] | null): void {
  if (vec && vec.length !== EMBEDDING_DIMS) {
    throw new Error(`message_embedding must be ${EMBEDDING_DIMS}-dim, got ${vec.length}`);
  }
}

/** Mirror of normalizeSessionContent: JSONB turns -> grep-able multi-line text. */
export function normalizeForGrep(turns: DialogueTurn[]): string {
  return turns.map(t => `${t.speaker}: ${t.text}`).join("\n");
}

export const exampleSessionRow: SessionRow = {
  path: "/sessions/2026-06-16-abc123",
  message: [
    { speaker: "user", text: "where does the embeddings socket live" },
    { speaker: "assistant", text: "under ~/.deeplake, NDJSON over a unix socket" },
  ],
  message_embedding: null, // filled by the embed worker
  createdAt: new Date(),
};
