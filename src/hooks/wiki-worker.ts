#!/usr/bin/env node

/**
 * Background wiki worker — reads session events from the sessions table,
 * runs claude -p to generate a wiki summary, and uploads it to the memory table.
 *
 * Invoked by session-end.ts as: node wiki-worker.js <config.json>
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildClaudeInvocation } from "./wiki-worker-spawn.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { utcTimestamp, log as _log } from "../utils/debug.js";
import { deeplakeClientHeader } from "../utils/client-header.js";

const dlog = (msg: string) => _log("wiki-worker", msg);
import { finalizeSummary, releaseLock, readState } from "./summary-state.js";
import { readSessionEventCache } from "./session-event-cache.js";
import { buildSessionPath } from "../utils/session-path.js";
import { capLinesByBytes, stampOffset, WIKI_JSONL_MAX_BYTES } from "./wiki-offset.js";
import { redactSecrets } from "./shared/redact.js";
import { uploadSummary } from "./upload-summary.js";
import { embedSummaryWithWarmup } from "../embeddings/embed-summary.js";
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
  orgName: string;
  project: string;
  agent?: string;
  pluginVersion?: string;
  tmpDir: string;
  claudeBin: string;
  wikiLog: string;
  hooksDir: string;
  promptTemplate: string;
}

const cfg: WorkerConfig = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const tmpDir = cfg.tmpDir;
const tmpJsonl = join(tmpDir, "session.jsonl");
const tmpSummary = join(tmpDir, "summary.md");

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
    // 1. Load session events and reconstruct JSONL.
    //
    // Prefer the local per-session event cache the capture hook appends to as
    // the session runs: it is row-for-row identical to the sessions-table
    // `message` column, but reading it avoids re-scanning the entire fat
    // `message` column on the backend for THIS session on every periodic /
    // session-end trigger — the dominant cold-start cost on long
    // "mega-sessions" (e.g. 15k rows / 72 MB re-materialized at ~2s each). The
    // DB is still the source of truth: fall back to it whenever the cache is
    // absent (session resumed on another machine), empty, or — checked once
    // the offset is known — shorter than the offset already summarized.
    const dbFetch = () => query(
      `SELECT message, creation_date FROM "${cfg.sessionsTable}" ` +
      `WHERE path LIKE '${esc(`/sessions/%${cfg.sessionId}%`)}' ORDER BY creation_date ASC`
    );
    // Retry on an empty result: the async capture writes (or Deeplake read
    // consistency) may simply be lagging behind SessionEnd under load.
    const dbFetchWithRetry = async (): Promise<Record<string, unknown>[]> => {
      let r = await dbFetch();
      for (let attempt = 1; r.length === 0 && attempt <= EVENT_FETCH_RETRIES; attempt++) {
        const delay = EVENT_FETCH_BACKOFF_MS * attempt;
        wlog(`no events yet — retry ${attempt}/${EVENT_FETCH_RETRIES} in ${delay}ms`);
        await sleep(delay);
        r = await dbFetch();
      }
      return r;
    };

    let usedLocalCache = false;
    let rows: Record<string, unknown>[];
    const cachedLines = readSessionEventCache(cfg.sessionId);
    if (cachedLines && cachedLines.length > 0) {
      rows = cachedLines.map(message => ({ message }));
      usedLocalCache = true;
      wlog(`loaded ${rows.length} events from local cache`);
    } else {
      wlog("fetching session events");
      rows = await dbFetchWithRetry();
    }

    if (rows.length === 0) {
      // Events never showed up. Do NOT leave the SessionStart placeholder
      // stranded at 'in progress' forever — remove it. The `description =
      // 'in progress'` guard means a concurrent worker that already wrote a
      // real summary for this session is never clobbered.
      wlog("no session events after retries — removing orphan placeholder");
      try {
        await query(
          `DELETE FROM "${cfg.memoryTable}" ` +
          `WHERE path = '${esc(`/summaries/${cfg.userName}/${cfg.sessionId}.md`)}' ` +
          `AND description = 'in progress'`
        );
      } catch (e: any) {
        wlog(`orphan placeholder cleanup failed: ${e.message}`);
      }
      return;
    }

    let jsonlLines = rows.length;

    // Derive the server path. When the events came from the local cache we've
    // already avoided the backend round-trip, so reproduce the canonical path
    // locally rather than paying a second `SELECT DISTINCT path` scan of the
    // same self-session (observed at ~1.1s on the 72 MB mega-session). The DB
    // branch keeps its lookup for sessions whose path predates this code.
    let jsonlServerPath: string;
    if (usedLocalCache) {
      jsonlServerPath = buildSessionPath(
        { userName: cfg.userName, orgName: cfg.orgName, workspaceId: cfg.workspaceId },
        cfg.sessionId,
      );
    } else {
      const pathRows = await query(
        `SELECT DISTINCT path FROM "${cfg.sessionsTable}" ` +
        `WHERE path LIKE '${esc(`/sessions/%${cfg.sessionId}%`)}' LIMIT 1`
      );
      jsonlServerPath = pathRows.length > 0
        ? pathRows[0].path as string
        : `/sessions/unknown/${cfg.sessionId}.jsonl`;
    }

    // 2. Determine how many rows were already summarized (resumed session).
    // The sidecar count is authoritative: finalizeSummary writes it after every
    // successful run and it never depends on the LLM echoing a bookkeeping line
    // back into the summary. The regex over the stored summary is only a
    // fallback for a session first summarized on another machine (the sidecar
    // lives under ~/.claude/hooks and does not travel).
    let prevOffset = 0;
    let hasExistingSummary = false;
    try {
      const sumRows = await query(
        `SELECT summary FROM "${cfg.memoryTable}" ` +
        `WHERE path = '${esc(`/summaries/${cfg.userName}/${cfg.sessionId}.md`)}' LIMIT 1`
      );
      if (sumRows.length > 0 && sumRows[0]["summary"]) {
        const existing = sumRows[0]["summary"] as string;
        const match = existing.match(/\*\*JSONL offset\*\*:\s*(\d+)/);
        if (match) prevOffset = parseInt(match[1], 10);
        writeFileSync(tmpSummary, existing);
        hasExistingSummary = true;
      }
    } catch (e: any) {
      // A genuine lookup failure (query() throws only after its own retries) is
      // NOT the same as "no summary". Treating it as absent would slice to the
      // newest rows and overwrite the canonical summary with a base-less one, so
      // bail and retry on the next run instead.
      wlog(`existing summary lookup failed: ${e.message}; skipping to avoid overwriting the base summary`);
      return;
    }
    // The offset only means something if we actually loaded the summary it
    // refers to. If the summary row is gone (or the read failed), slicing by a
    // stale sidecar count would drop old rows with no base summary to extend,
    // then overwrite the canonical summary with tail-only content. No base ⇒
    // regenerate from scratch.
    if (!hasExistingSummary) {
      prevOffset = 0;
    } else {
      const sidecarCount = readState(cfg.sessionId)?.lastSummaryCount ?? 0;
      if (sidecarCount > prevOffset) prevOffset = sidecarCount;
    }

    // Safety net for the local-cache path: if the cache holds fewer rows than
    // the offset already summarized, it is an incomplete copy (e.g. the
    // session was resumed on a different machine that captured the earlier
    // rows). Slicing by `prevOffset` would then drop every genuinely-new row
    // to nothing, so re-load the full session from the DB instead.
    if (usedLocalCache && rows.length < prevOffset) {
      wlog(`local cache (${rows.length}) < summarized offset (${prevOffset}) — refetching from DB`);
      rows = await dbFetchWithRetry();
      jsonlLines = rows.length;
    }

    // Feed claude only the rows added since the last summary. Reprocessing the
    // full session on every run is what drives ENOBUFS / 120s-timeout failures
    // on long (4000+ event) sessions — a stuck offset re-summarizes everything.
    // Reconstruct JSONL from individual rows (message is JSONB — may be object or string)
    const newRows = prevOffset > 0 ? rows.slice(prevOffset) : rows;
    if (prevOffset > 0 && newRows.length === 0) {
      wlog(`no new events since last summary (offset=${prevOffset}, total=${jsonlLines}) — skipping`);
      return;
    }
    const newLines = newRows.map(r => typeof r.message === "string" ? r.message : JSON.stringify(r.message));
    const { kept, dropped, truncated } = capLinesByBytes(newLines, WIKI_JSONL_MAX_BYTES);
    if (dropped > 0) {
      wlog(`new rows exceed ${WIKI_JSONL_MAX_BYTES}B — summarizing newest ${kept.length}, permanently skipping ${dropped} older rows`);
    }
    if (truncated) {
      wlog(`a single event exceeded ${WIKI_JSONL_MAX_BYTES}B — truncated it to stay within the buffer`);
    }

    writeFileSync(tmpJsonl, kept.join("\n"));
    wlog(`found ${jsonlLines} events (${kept.length} new since offset ${prevOffset}) at ${jsonlServerPath}`);

    // 3. Build prompt and run claude -p
    const prompt = cfg.promptTemplate
      .replace(/__JSONL__/g, tmpJsonl)
      .replace(/__SUMMARY__/g, tmpSummary)
      .replace(/__SESSION_ID__/g, cfg.sessionId)
      .replace(/__PROJECT__/g, cfg.project)
      .replace(/__PREV_OFFSET__/g, String(prevOffset))
      .replace(/__JSONL_LINES__/g, String(jsonlLines))
      .replace(/__JSONL_SERVER_PATH__/g, jsonlServerPath);

    wlog("running claude -p");
    let execSucceeded = false;
    const summaryBeforeExec = existsSync(tmpSummary) ? readFileSync(tmpSummary, "utf-8") : null;
    try {
      const inv = buildClaudeInvocation(cfg.claudeBin, prompt);
      execFileSync(inv.file, inv.args, {
        ...inv.options,
        timeout: 120_000,
        // claude -p streams to stdout, which execFileSync buffers. The Node
        // default (1 MB) overflows to ENOBUFS on a verbose run, killing the
        // summary. The summary is written to a file, not read from stdout, so
        // we only need headroom to drain it.
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      });
      execSucceeded = true;
      wlog("claude -p exited (code 0)");
    } catch (e: any) {
      wlog(`claude -p failed: ${e.status ?? e.message}`);
    }

    // 4. Upload summary to memory table. Only advance the offset (stamp +
    // finalize) when claude actually produced a summary — otherwise a failed
    // run on a resumed session would re-upload the pre-seeded old summary and
    // slice away the new rows forever.
    if (existsSync(tmpSummary)) {
      const raw = readFileSync(tmpSummary, "utf-8");
      const summaryChanged = summaryBeforeExec === null ? raw.trim().length > 0 : raw !== summaryBeforeExec;
      if (!execSucceeded) {
        wlog(summaryChanged
          ? "claude -p failed after a partial summary write; skipping upload to avoid advancing the offset"
          : "claude -p failed without producing a new summary; skipping upload");
        return;
      }
      if (raw.trim()) {
        // Stamp the offset ourselves so the persisted summary is authoritative
        // and never depends on the LLM echoing the bookkeeping line.
        const text = redactSecrets(stampOffset(raw, jsonlLines));
        const fname = `${cfg.sessionId}.md`;
        const vpath = `/summaries/${cfg.userName}/${fname}`;
        // Embed the summary so it ranks in the semantic retrieval branch.
        // Skipped when globally disabled. The wiki-worker is a detached
        // background process, so we warm the daemon and retry once (via
        // embedSummaryWithWarmup) instead of the hot-path fire-and-forget
        // embed() — that single cold-start race was stranding most ENABLED
        // users' summaries with a permanent NULL embedding (no later backfill
        // exists), the dominant fixable cause of low embedding coverage.
        let embedding: number[] | null = null;
        if (!embeddingsDisabled()) {
          const daemonEntry = join(dirname(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
          embedding = await embedSummaryWithWarmup(text, "document", { daemonEntry, log: wlog });
        }
        const result = await uploadSummary(query, {
          tableName: cfg.memoryTable,
          vpath, fname,
          userName: cfg.userName,
          project: cfg.project,
          agent: cfg.agent ?? "claude_code",
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
