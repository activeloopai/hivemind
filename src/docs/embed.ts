/**
 * Doc-content embedder — the search vector for `content_embedding`.
 *
 * Mirrors the capture-hook pattern (src/hooks/capture.ts): one nomic embedding
 * per doc via the shared daemon, `document` kind (applies DOC_PREFIX). Reuses a
 * single `EmbedClient` across a bulk generate run. Best-effort and null-safe —
 * disabled embeddings or any daemon failure yield `null`, which lands as a NULL
 * `content_embedding` (lexical `docs/find/` still works; semantic is guarded by
 * `ARRAY_LENGTH(content_embedding,1) > 0`). NEVER blocks or fails a doc write.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingsDisabled } from "../embeddings/disable.js";

/** A best-effort text → vector function; returns null when unavailable. */
export type DocEmbedder = (text: string) => Promise<number[] | null>;

function resolveEmbedDaemonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
}

/**
 * Build a reusable doc embedder. When embeddings are globally disabled, returns
 * a no-op that always yields null (no daemon round-trip). Otherwise reuses one
 * `EmbedClient` and swallows failures to null.
 */
export function makeDocEmbedder(): DocEmbedder {
  if (embeddingsDisabled()) return async () => null;
  const client = new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() });
  return async (text: string) => {
    try {
      return await client.embed(text, "document");
    } catch {
      return null;
    }
  };
}

/**
 * Query-side embedder for `docs/find/` (kind='query' → QUERY_PREFIX, the nomic
 * asymmetric search convention). Null when embeddings are disabled/unreachable
 * → `docs/find/` degrades to lexical search.
 */
export function makeQueryEmbedder(): DocEmbedder {
  if (embeddingsDisabled()) return async () => null;
  const client = new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() });
  return async (text: string) => {
    try {
      return await client.embed(text, "query");
    } catch {
      return null;
    }
  };
}
