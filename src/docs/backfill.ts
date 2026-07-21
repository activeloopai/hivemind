/**
 * Backfill `content_embedding` for docs that lack it — the migration path for
 * docs generated before semantic search existed (or while embeddings were off).
 * Cheap: NO LLM calls, only the embed daemon over existing `content`. Idempotent
 * — skips docs that already carry a non-empty vector.
 */

import { embeddingSqlLiteral } from "../embeddings/sql.js";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { runPool } from "./pool.js";
import type { QueryFn } from "./read.js";
import type { DocEmbedder } from "./embed.js";

export interface BackfillReport {
  scanned: number;
  embedded: number;
  /** Already had a vector (or generation failed / embedder off). */
  skipped: number;
}

export async function backfillDocEmbeddings(
  query: QueryFn,
  tableName: string,
  embed: DocEmbedder,
  concurrency = 4,
): Promise<BackfillReport> {
  const safe = sqlIdent(tableName);
  const rows = await query(
    `SELECT id, content, ARRAY_LENGTH(content_embedding, 1) AS dims ` +
    `FROM "${safe}" WHERE status = 'active'`,
  );
  const missing = rows.filter((r) => r["dims"] == null || Number(r["dims"]) === 0);
  let embedded = 0;
  await runPool(missing, concurrency, async (r) => {
    const vec = await embed(String(r["content"] ?? ""));
    if (!vec || vec.length === 0) return; // embedder off / failed → leave NULL
    await query(
      `UPDATE "${safe}" SET content_embedding = ${embeddingSqlLiteral(vec)} ` +
      `WHERE id = '${sqlStr(String(r["id"]))}'`,
    );
    embedded++;
  });
  return { scanned: rows.length, embedded, skipped: rows.length - embedded };
}
