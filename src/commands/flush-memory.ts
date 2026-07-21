/**
 * `hivemind memory flush` — upload staged backfill summaries into the org's
 * `memory` table (the FLUSH phase; needs auth).
 *
 * The install-time EXTRACT phase (backfill-memory.ts) stages summaries +
 * local embeddings under ~/.claude/hivemind/pending-memory/ with manifest
 * rows marked `uploaded: false`. This command — run after `hivemind login`
 * /org-select — reads those rows and INSERTs each into the chosen org's
 * memory table via the same uploadSummary() path the live wiki-worker uses,
 * then flips the row to `uploaded: true`.
 *
 * Pure upload: the summary text and (usually) the embedding already exist
 * on disk, so there's no LLM call and no extraction work here. When a row
 * was staged without an embedding (embed daemon was disabled/unavailable at
 * extract time), flush makes a best-effort local embed; failing that it
 * uploads with a NULL vector — the row is still reachable via lexical
 * retrieval.
 */

import { existsSync, readFileSync } from "node:fs";

import { type Config } from "../config.js";
import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { uploadSummary, type QueryFn, type UploadParams, type UploadResult } from "../hooks/upload-summary.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import {
  readPendingMemoryManifest,
  markUploaded,
  PENDING_MEMORY_MANIFEST_PATH,
  type PendingMemoryEntry,
} from "../skillify/pending-memory-manifest.js";

export interface FlushSummary {
  pending: number;
  uploaded: number;
  failed: number;
  reason?: string;
}

/**
 * Injectable dependencies — defaults wire the real config/query/upload/embed.
 * Tests pass fakes so the per-row loop (skip-missing, mark-uploaded, count)
 * runs without auth or network.
 */
export interface FlushDeps {
  loadConfig: () => Config | null;
  makeQuery: (config: Config) => QueryFn;
  upload: (query: QueryFn, params: UploadParams) => Promise<UploadResult>;
  embed: (text: string) => Promise<number[] | null>;
  pluginVersion?: string;
  /** Staging manifest path; injectable so tests don't touch real $HOME. */
  manifestPath?: string;
}

function loadEmbedding(entry: PendingMemoryEntry): number[] | null {
  if (!entry.embedded || !entry.embedding_path) return null;
  try {
    const v = JSON.parse(readFileSync(entry.embedding_path, "utf-8"));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Default embed: best-effort local daemon, NULL when disabled/unavailable. */
async function defaultEmbed(text: string): Promise<number[] | null> {
  if (embeddingsDisabled()) return null;
  try {
    // No daemonEntry: EmbedClient falls back to the canonical shared daemon
    // (~/.hivemind/embed-deps/embed-daemon.js) + autospawn, which is correct
    // regardless of how this command is bundled.
    return await new EmbedClient({ autoSpawn: true }).embed(text, "document");
  } catch {
    return null;
  }
}

export function defaultDeps(pluginVersion?: string): FlushDeps {
  return {
    // Route by cwd so a flush targets the directory's `.hivemind` workspace,
    // consistent with capture (see src/dir-config.ts).
    loadConfig: loadRoutedConfig,
    makeQuery: (config) =>
      (sql: string) =>
        new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName).query(sql),
    upload: uploadSummary,
    embed: defaultEmbed,
    pluginVersion,
  };
}

/**
 * Upload every `uploaded: false` staged summary. Idempotent: a row already
 * marked uploaded is skipped, and uploadSummary itself upserts by path so a
 * re-run after a partial flush can't duplicate. `deps` is injectable for
 * tests; production callers pass nothing and get the real wiring.
 */
export async function runFlushMemory(deps: FlushDeps = defaultDeps()): Promise<FlushSummary> {
  const config = deps.loadConfig();
  if (!config) {
    return { pending: 0, uploaded: 0, failed: 0, reason: "not-logged-in" };
  }

  const manifestPath = deps.manifestPath ?? PENDING_MEMORY_MANIFEST_PATH;
  const manifest = readPendingMemoryManifest(manifestPath);
  const pending = (manifest?.entries ?? []).filter((e) => e && e.uploaded === false);
  if (pending.length === 0) {
    return { pending: 0, uploaded: 0, failed: 0 };
  }

  const query = deps.makeQuery(config);
  const result: FlushSummary = { pending: pending.length, uploaded: 0, failed: 0 };

  for (const entry of pending) {
    if (!existsSync(entry.summary_path)) {
      result.failed++;
      continue;
    }
    let text: string;
    try {
      text = readFileSync(entry.summary_path, "utf-8");
    } catch {
      result.failed++;
      continue;
    }
    if (!text.trim()) {
      result.failed++;
      continue;
    }

    try {
      const staged = loadEmbedding(entry);
      const embedding = staged ?? (await deps.embed(text));
      const fname = `${entry.session_id}.md`;
      const vpath = `/summaries/${config.userName}/${fname}`;
      await deps.upload(query, {
        tableName: config.tableName,
        vpath,
        fname,
        userName: config.userName,
        project: entry.project,
        agent: entry.source_agent,
        sessionId: entry.session_id,
        text,
        embedding,
        pluginVersion: deps.pluginVersion,
      });
      markUploaded(entry.session_id, config.orgName, new Date().toISOString(), manifestPath);
      result.uploaded++;
    } catch {
      result.failed++;
    }
  }

  return result;
}
