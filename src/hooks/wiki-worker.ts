#!/usr/bin/env node

/**
 * Background wiki worker — reads session events from the sessions table,
 * runs claude -p to generate a wiki summary, and uploads it to the memory table.
 *
 * Invoked by session-end.ts as: node wiki-worker.js <config.json>
 */

import { readFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildClaudeInvocation } from "./wiki-worker-spawn.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { utcTimestamp, log as _log } from "../utils/debug.js";
import { deeplakeClientHeader } from "../utils/client-header.js";
import { sqlIdent } from "../utils/sql.js";

const dlog = (msg: string) => _log("wiki-worker", msg);
import { finalizeSummary, releaseLock } from "./summary-state.js";
import { uploadSummary } from "./upload-summary.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingsDisabled } from "../embeddings/disable.js";

interface WorkerConfig {
  apiUrl: string;
  token: string;
  orgId: string;
  workspaceId: string;
  memoryTable: string;
  sessionsTable: string;
  sessionId: string;
  userName: string;
  project: string;
  pluginVersion?: string;
  tmpDir: string;
  claudeBin: string;
  wikiLog: string;
  hooksDir: string;
  promptTemplate: string;
}

const cfg: WorkerConfig = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const tmpDir = cfg.tmpDir;

/** Hard cap on the model-emitted summary we will persist. The prompt targets
 * <4000 chars; this generous ceiling bounds a prompt-injected runaway output
 * before it reaches the memory table. */
const MAX_SUMMARY_CHARS = 100_000;

/** Sanitize the summary the agent emitted on stdout before we trust it:
 * strip NUL + non-printable control chars (keep tab/newline/CR) and cap the
 * length. The session content driving the summary is attacker-influenceable,
 * and the agent has no tools, so the only residual risk is malformed/oversized
 * text — this neutralizes it. */
function sanitizeSummary(raw: string): string {
  const cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  return cleaned.length > MAX_SUMMARY_CHARS ? cleaned.slice(0, MAX_SUMMARY_CHARS) : cleaned;
}

function wlog(msg: string): void {
  try {
    mkdirSync(cfg.hooksDir, { recursive: true });
    appendFileSync(cfg.wikiLog, `[${utcTimestamp()}] wiki-worker(${cfg.sessionId}): ${msg}\n`);
  } catch { /* ignore */ }
}

/** Escape a string for use inside a SQL single-quoted literal. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

// The capture hooks INSERT session events asynchronously, and Deeplake reads
// are eventually-consistent. Under concurrency (many SDK / `claude -p` sessions
// ending at once) those rows can lag behind SessionEnd, so the worker can read
// zero events for a session that does have them. Retry with linear backoff
// before giving up, instead of stranding the SessionStart placeholder.
/**
 * Parse a non-negative integer from an env var, falling back to `fallback`
 * for missing / non-numeric / negative values. Without this, a misconfigured
 * env var would make `Number(...)` return NaN, the retry loop condition
 * `attempt <= NaN` would be false, and retries would be silently disabled —
 * reintroducing the stranded-placeholder bug under load.
 */
function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const EVENT_FETCH_RETRIES = parseNonNegativeInt(process.env.HIVEMIND_WIKI_EVENT_RETRIES, 5);
const EVENT_FETCH_BACKOFF_MS = parseNonNegativeInt(process.env.HIVEMIND_WIKI_EVENT_BACKOFF_MS, 1500);
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function query(sql: string, retries = 4): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(`${cfg.apiUrl}/workspaces/${cfg.workspaceId}/tables/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        "X-Activeloop-Org-Id": cfg.orgId,
        ...deeplakeClientHeader(),
      },
      body: JSON.stringify({ query: sql }),
    });
    if (r.ok) {
      const j = await r.json() as { columns?: string[]; rows?: unknown[][] };
      if (!j.columns || !j.rows) return [];
      return j.rows.map(row =>
        Object.fromEntries(j.columns!.map((col, i) => [col, row[i]]))
      );
    }
    // 403 can arrive as a CloudFlare/nginx HTML page when the shared IP
    // hits a transient rate limit (claude -p or codex exec bursts while
    // the worker is running), and 401 shows up when the upstream auth
    // cache expires. Treat both as retryable with exponential backoff.
    const retryable = r.status === 401 || r.status === 403 ||
      r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503;
    if (attempt < retries && retryable) {
      // Exponential backoff with jitter — Cloudflare/nginx 403s from IP
      // rate limiting (claude -p or codex exec bursts) can take 30-60 s
      // to clear.
      const base = Math.min(30_000, 2000 * Math.pow(2, attempt));
      const delay = base + Math.floor(Math.random() * 1000);
      wlog(`API ${r.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return [];
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch (cleanupErr: any) {
    dlog(`cleanup failed to remove ${tmpDir}: ${cleanupErr.message}`);
  }
}

async function main(): Promise<void> {
  try {
    // 1. Fetch session events from sessions table, reconstruct JSONL.
    // Retry on an empty result: the async capture writes (or Deeplake read
    // consistency) may simply be lagging behind SessionEnd under load.
    wlog("fetching session events");
    // Config-driven identifiers are interpolated raw into the Deeplake SQL
    // API (no parameterized queries) — validate them as SQL identifiers.
    const sessionsTable = sqlIdent(cfg.sessionsTable);
    const memoryTable = sqlIdent(cfg.memoryTable);
    const fetchEvents = () => query(
      `SELECT message, creation_date FROM "${sessionsTable}" ` +
      `WHERE path LIKE '${esc(`/sessions/%${cfg.sessionId}%`)}' ORDER BY creation_date ASC`
    );
    let rows = await fetchEvents();
    for (let attempt = 1; rows.length === 0 && attempt <= EVENT_FETCH_RETRIES; attempt++) {
      const delay = EVENT_FETCH_BACKOFF_MS * attempt;
      wlog(`no events yet — retry ${attempt}/${EVENT_FETCH_RETRIES} in ${delay}ms`);
      await sleep(delay);
      rows = await fetchEvents();
    }

    if (rows.length === 0) {
      // Events never showed up. Do NOT leave the SessionStart placeholder
      // stranded at 'in progress' forever — remove it. The `description =
      // 'in progress'` guard means a concurrent worker that already wrote a
      // real summary for this session is never clobbered.
      wlog("no session events after retries — removing orphan placeholder");
      try {
        await query(
          `DELETE FROM "${memoryTable}" ` +
          `WHERE path = '${esc(`/summaries/${cfg.userName}/${cfg.sessionId}.md`)}' ` +
          `AND description = 'in progress'`
        );
      } catch (e: any) {
        wlog(`orphan placeholder cleanup failed: ${e.message}`);
      }
      return;
    }

    // Reconstruct JSONL from individual rows (message is JSONB — may be object or string)
    const jsonlContent = rows
      .map(r => typeof r.message === "string" ? r.message : JSON.stringify(r.message))
      .join("\n");
    const jsonlLines = rows.length;

    // Derive the server path
    const pathRows = await query(
      `SELECT DISTINCT path FROM "${sessionsTable}" ` +
      `WHERE path LIKE '${esc(`/sessions/%${cfg.sessionId}%`)}' LIMIT 1`
    );
    const jsonlServerPath = pathRows.length > 0
      ? pathRows[0].path as string
      : `/sessions/unknown/${cfg.sessionId}.jsonl`;

    wlog(`found ${jsonlLines} events at ${jsonlServerPath}`);

    // 2. Check for existing summary in memory table (resumed session)
    let prevOffset = 0;
    let existingSummary = "";
    try {
      const sumRows = await query(
        `SELECT summary FROM "${memoryTable}" ` +
        `WHERE path = '${esc(`/summaries/${cfg.userName}/${cfg.sessionId}.md`)}' LIMIT 1`
      );
      if (sumRows.length > 0 && sumRows[0]["summary"]) {
        const existing = sumRows[0]["summary"] as string;
        const match = existing.match(/\*\*JSONL offset\*\*:\s*(\d+)/);
        if (match) prevOffset = parseInt(match[1], 10);
        // Held in memory as the baseline for the skip-on-no-change guard and
        // inlined into the prompt for the agent to merge onto.
        existingSummary = existing;
        wlog(`existing summary found, offset=${prevOffset}`);
      }
    } catch { /* no existing summary */ }

    // 3. Build prompt and run claude -p. Scalars are substituted first; the
    // large, attacker-influenceable blobs (transcript, existing summary) are
    // injected LAST via function replacements so their literal `$`/placeholder
    // bytes can't be reinterpreted by a later replace pass.
    const prompt = cfg.promptTemplate
      .replace(/__SESSION_ID__/g, cfg.sessionId)
      .replace(/__PROJECT__/g, cfg.project)
      .replace(/__PREV_OFFSET__/g, String(prevOffset))
      .replace(/__JSONL_LINES__/g, String(jsonlLines))
      .replace(/__JSONL_SERVER_PATH__/g, jsonlServerPath)
      .replace(/__EXISTING_SUMMARY__/g, () => existingSummary || "(none — generate from scratch)")
      .replace(/__JSONL_CONTENT__/g, () => jsonlContent);

    wlog("running claude -p");
    let execSucceeded = false;
    // The summary lives entirely in memory: the agent emits it on stdout (it
    // has no Write tool), we sanitize it, and we own the upload. No tmp file is
    // written or read back, which also removes any check-then-use race.
    let producedSummary: string | null = null;
    try {
      const inv = buildClaudeInvocation(cfg.claudeBin, prompt);
      const stdout = execFileSync(inv.file, inv.args, {
        ...inv.options,
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      });
      const summaryText = sanitizeSummary((stdout ?? "").toString());
      if (summaryText.trim()) producedSummary = summaryText;
      execSucceeded = true;
      wlog("claude -p exited (code 0)");
    } catch (e: any) {
      wlog(`claude -p failed: ${e.status ?? e.message}`);
    }

    // 4. Upload summary to memory table. Prefer the freshly produced summary;
    // fall back to the existing one (resumed session) only to drive the
    // skip-on-no-change guard below.
    const baseline = existingSummary || null;
    const text = producedSummary ?? baseline;
    if (text) {
      // If claude -p failed without producing a new summary on a resumed
      // session, re-uploading the unchanged existing summary and calling
      // finalizeSummary would advance the JSONL offset, marking new events as
      // summarized when they never were. Skip the upload in that case;
      // SessionEnd's later run reconstructs the delta from the offset embedded
      // in the summary body. Matches the guard in src/hooks/codex/wiki-worker.ts.
      const summaryChanged = baseline === null
        ? text.trim().length > 0
        : text !== baseline;
      if (!execSucceeded && !summaryChanged) {
        wlog("claude -p failed without producing a new summary; skipping upload");
        return;
      }
      if (text.trim()) {
        const fname = `${cfg.sessionId}.md`;
        const vpath = `/summaries/${cfg.userName}/${fname}`;
        // Embed the summary so it ranks in the semantic retrieval branch.
        // Skipped when globally disabled or the daemon is unreachable —
        // uploadSummary() writes SQL NULL in that case.
        let embedding: number[] | null = null;
        if (!embeddingsDisabled()) {
          try {
            const daemonEntry = join(dirname(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
            embedding = await new EmbedClient({ daemonEntry }).embed(text, "document");
          } catch (e: any) {
            wlog(`summary embedding failed, writing NULL: ${e.message}`);
          }
        }
        const result = await uploadSummary(query, {
          tableName: cfg.memoryTable,
          vpath, fname,
          userName: cfg.userName,
          project: cfg.project,
          agent: "claude_code",
          sessionId: cfg.sessionId,
          text,
          embedding,
          pluginVersion: cfg.pluginVersion ?? "",
        });
        wlog(`uploaded ${vpath} (summary=${result.summaryLength}, desc=${result.descLength})`);

        try {
          finalizeSummary(cfg.sessionId, jsonlLines);
          wlog(`sidecar updated: lastSummaryCount=${jsonlLines}`);
        } catch (e: any) {
          wlog(`sidecar update failed: ${e.message}`);
        }
      }
    } else {
      wlog("no summary file generated");
    }

    wlog("done");
  } catch (e: any) {
    wlog(`fatal: ${e.message}`);
  } finally {
    cleanup();
    try {
      releaseLock(cfg.sessionId);
    } catch (releaseErr: any) {
      // Gated on HIVEMIND_DEBUG — we don't want a release failure at
      // worker shutdown to pollute the wiki log every run.
      dlog(`releaseLock failed in finally for ${cfg.sessionId}: ${releaseErr.message}`);
    }
  }
}

main();
