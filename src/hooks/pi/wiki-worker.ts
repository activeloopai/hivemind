#!/usr/bin/env node

/**
 * Pi wiki worker — reads session events from the sessions table,
 * runs `pi --print` to generate a wiki summary, and uploads it to the
 * memory table.
 *
 * Invoked by harnesses/pi/extension-source/hivemind.ts (periodic + session_shutdown
 * triggers) as: node wiki-worker.js <config.json>. The extension itself
 * is shipped as raw .ts and can't import this file directly — that's why
 * this lives as a standalone bundle deposited next to the extension at
 * install time.
 *
 * Forked from src/hooks/codex/wiki-worker.ts. Only the LLM-spawn step
 * differs: codex shells `codex exec --dangerously-bypass-approvals-and-sandbox`,
 * we shell `pi --print --provider <p> --model <m>`. Same query/upload paths.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildTrailingPromptInvocation } from "../wiki-worker-spawn.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeSummary, releaseLock, readState } from "../summary-state.js";
import { capLinesByBytes, stampOffset, WIKI_JSONL_MAX_BYTES } from "../wiki-offset.js";
import { redactSecrets } from "../shared/redact.js";
import { uploadSummary } from "../upload-summary.js";
import { log as _log } from "../../utils/debug.js";
import { EmbedClient } from "../../embeddings/client.js";
import { embeddingsDisabled } from "../../embeddings/disable.js";
import { deeplakeClientHeader } from "../../utils/client-header.js";

const dlog = (msg: string) => _log("pi-wiki-worker", msg);

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
  piBin: string;
  piProvider: string;
  piModel: string;
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
    appendFileSync(cfg.wikiLog, `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] wiki-worker(${cfg.sessionId}): ${msg}\n`);
  } catch { /* ignore */ }
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

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
    // 403 on Deeplake arrives as a CloudFlare/nginx HTML page when the shared
    // IP hits a rate limit (codex exec bursts while the worker is running),
    // and 401 shows up transiently when the upstream auth cache expires.
    // Treat both as retryable with exponential backoff.
    const retryable = r.status === 401 || r.status === 403 ||
      r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503;
    if (attempt < retries && retryable) {
      // Exponential backoff with jitter — Cloudflare/nginx 403s from IP
      // rate limiting (codex exec bursts) can take 30-60 s to clear.
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
    // 1. Fetch session events from sessions table
    wlog("fetching session events");
    const rows = await query(
      `SELECT message, creation_date FROM "${cfg.sessionsTable}" ` +
      `WHERE path LIKE E'${esc(`/sessions/%${cfg.sessionId}%`)}' ORDER BY creation_date ASC`
    );

    if (rows.length === 0) {
      wlog("no session events found — exiting");
      return;
    }

    const jsonlLines = rows.length;

    const pathRows = await query(
      `SELECT DISTINCT path FROM "${cfg.sessionsTable}" ` +
      `WHERE path LIKE '${esc(`/sessions/%${cfg.sessionId}%`)}' LIMIT 1`
    );
    const jsonlServerPath = pathRows.length > 0
      ? pathRows[0].path as string
      : `/sessions/unknown/${cfg.sessionId}.jsonl`;

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

    // Feed the agent only the rows added since the last summary. Reprocessing
    // the full session on every run is what drives ENOBUFS / 120s-timeout
    // failures on long (4000+ event) sessions — a stuck offset re-summarizes
    // everything from scratch.
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

    // 3. Build prompt and run codex exec
    const prompt = cfg.promptTemplate
      .replace(/__JSONL__/g, tmpJsonl)
      .replace(/__SUMMARY__/g, tmpSummary)
      .replace(/__SESSION_ID__/g, cfg.sessionId)
      .replace(/__PROJECT__/g, cfg.project)
      .replace(/__PREV_OFFSET__/g, String(prevOffset))
      .replace(/__JSONL_LINES__/g, String(jsonlLines))
      .replace(/__JSONL_SERVER_PATH__/g, jsonlServerPath);

    wlog(`running pi --print (provider=${cfg.piProvider}, model=${cfg.piModel})`);
    let execSucceeded = false;
    const summaryBeforeExec = existsSync(tmpSummary) ? readFileSync(tmpSummary, "utf-8") : null;
    try {
      // pi --print is the non-interactive mode; it bypasses extension
      // discovery (modes/print-mode.js doesn't import ExtensionRunner),
      // so spawning pi here can't recurse back into our hivemind.ts and
      // capture its own summary prompt.
      const inv = buildTrailingPromptInvocation(cfg.piBin, [
        "--print",
        "--provider", cfg.piProvider,
        "--model", cfg.piModel,
      ], prompt);
      execFileSync(inv.file, inv.args, {
        ...inv.options,
        timeout: 120_000,
        // pi streams to stdout, which execFileSync buffers. The Node default
        // (1 MB) overflows to ENOBUFS on a verbose run, killing the summary.
        // The summary is written to a file, not read from stdout, so we only
        // need headroom to drain it.
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, HIVEMIND_WIKI_WORKER: "1", HIVEMIND_CAPTURE: "false" },
      });
      execSucceeded = true;
      wlog("pi --print exited (code 0)");
    } catch (e: any) {
      wlog(`pi --print failed: ${e.status ?? e.message}`);
    }

    // 4. Upload summary to memory table. Only advance the offset (stamp +
    // finalize) when the agent actually produced a summary — otherwise a failed
    // run on a resumed session would re-upload the pre-seeded old summary and
    // slice away the new rows forever.
    if (existsSync(tmpSummary)) {
      const raw = readFileSync(tmpSummary, "utf-8");
      const summaryChanged = summaryBeforeExec === null ? raw.trim().length > 0 : raw !== summaryBeforeExec;
      if (!execSucceeded) {
        wlog(summaryChanged
          ? "pi --print failed after a partial summary write; skipping upload to avoid advancing the offset"
          : "pi --print failed without producing a new summary; skipping upload");
        return;
      }
      if (raw.trim()) {
        // Stamp the offset ourselves so the persisted summary is authoritative
        // and never depends on the LLM echoing the bookkeeping line.
        const text = redactSecrets(stampOffset(raw, jsonlLines));
        const fname = `${cfg.sessionId}.md`;
        const vpath = `/summaries/${cfg.userName}/${fname}`;
        // Embed the summary so it ranks in the semantic retrieval branch.
        // Skipped when globally disabled or the daemon is unreachable —
        // uploadSummary() writes SQL NULL in that case.
        let embedding: number[] | null = null;
        if (!embeddingsDisabled()) {
          try {
            // Pi's wiki-worker lives at ~/.pi/agent/hivemind/wiki-worker.js —
            // there's no sibling embeddings/embed-daemon.js to resolve relative
            // to. Pass no daemonEntry so EmbedClient falls back to the canonical
            // shared daemon at ~/.hivemind/embed-deps/embed-daemon.js (set up
            // by `hivemind embeddings install`).
            embedding = await new EmbedClient({}).embed(text, "document");
          } catch (e: any) {
            wlog(`summary embedding failed, writing NULL: ${e.message}`);
          }
        }
        const result = await uploadSummary(query, {
          tableName: cfg.memoryTable,
          vpath, fname,
          userName: cfg.userName,
          project: cfg.project,
          agent: "pi",
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
      dlog(`releaseLock failed in finally for ${cfg.sessionId}: ${releaseErr.message}`);
    }
  }
}

main();
