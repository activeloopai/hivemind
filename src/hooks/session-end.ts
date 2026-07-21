#!/usr/bin/env node

/**
 * SessionEnd hook — spawns a background worker that builds the session summary.
 *
 * The hook writes a config file and spawns the bundled wiki-worker.js process.
 * It exits immediately — no API calls, no timeout risk.
 * All heavy work (fetching events, running claude -p, uploading) happens in the worker.
 */

import { readStdin } from "../utils/stdin.js";
import { loadConfig, type Config } from "../config.js";
import { resolveDirConfig } from "../dir-config.js";
import { log as _log } from "../utils/debug.js";
import { bundleDirFromImportMeta, spawnWikiWorker, wikiLog } from "./spawn-wiki-worker.js";
import { tryAcquireLock, releaseLock, markSessionEnded } from "./summary-state.js";
import { pruneStaleSessionEventCaches } from "./session-event-cache.js";
import { forceSessionEndTrigger } from "../skillify/triggers.js";
import { parseTranscript } from "../notifications/transcript-parser.js";
import { appendUsageRecord } from "../notifications/usage-tracker.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";

const log = (msg: string) => _log("session-end", msg);

interface StopInput {
  session_id: string;
  cwd?: string;
  hook_event_name?: string;
  transcript_path?: string;
}

/**
 * Parse the session transcript for memory-search activity and append one
 * record to `~/.deeplake/usage-stats.jsonl`. Fail-soft on every step.
 *
 * Runs independent of the wiki-worker lock — even sessions where the
 * wiki worker can't run still contribute to the savings recap (the recap
 * only needs memory-grep activity, not summaries).
 */
function recordSessionUsage(transcriptPath: string | undefined, sessionId: string): void {
  if (!transcriptPath) return;
  try {
    const record = parseTranscript(transcriptPath, sessionId);
    if (record.memorySearchCount === 0 && record.memorySearchBytes === 0) {
      log(`no memory searches in session ${sessionId} — skipping usage record`);
      return;
    }
    appendUsageRecord(record);
  } catch (e: any) {
    log(`recordSessionUsage failed: ${e?.message ?? String(e)}`);
  }
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  if (process.env.HIVEMIND_CAPTURE === "false") return;
  if (!isHivemindPluginEnabled()) { log("plugin disabled, skipping session-end"); return; }
  if (!entrypointPassesOnlyCliGate()) return;

  const input = await readStdin<StopInput>();
  const sessionId = input.session_id;
  const cwd = input.cwd ?? "";
  if (!sessionId) return;

  // Mark this session cleanly ended so another session's resume brief stops
  // treating it as live and may surface it immediately (without waiting for
  // the activity window to lapse). Independent of the wiki-worker lock below.
  markSessionEnded(sessionId);

  // Housekeeping: drop long-dead per-session event caches (14-day TTL). This
  // session's own cache has a fresh mtime and is left intact for the worker.
  try { pruneStaleSessionEventCaches(); } catch { /* best-effort */ }

  const base = loadConfig();
  if (!base) { log("no config"); return; }

  // Per-directory `.hivemind`: honor opt-out and trusted org/workspace routing,
  // matching the capture hook so the end-of-session summary lands (or doesn't)
  // in the same place its events did.
  const resolved = resolveDirConfig(base, cwd || process.cwd());
  if (!resolved.collect) {
    log(`session-end capture disabled for cwd=${cwd || "?"} via ${resolved.found?.path}`);
    return;
  }
  const config = resolved.config;

  // Record memory-search activity for the savings recap. Independent of the
  // wiki-worker lock below: even sessions where the wiki worker can't run
  // should still contribute to the recap (only need memory-grep counts,
  // not summaries).
  recordSessionUsage(input.transcript_path, sessionId);

  // (SkillOpt is NOT fired from SessionEnd — it fires immediately on the user's reaction
  // via UserPromptSubmit, so there's nothing to do at session end.)

  // Skillify has its own per-project lock and must fire regardless of whether
  // the wiki-worker lock below is already held. Fire it here, before the
  // wiki-worker lock check, so a Periodic trigger that acquired the lock first
  // doesn't silently suppress skill mining.
  forceSessionEndTrigger({
    config,
    cwd: cwd || process.cwd(),
    bundleDir: bundleDirFromImportMeta(import.meta.url),
    agent: "claude_code",
    sessionId,
  });

  // Coordinate with the periodic worker: if one is already running for this
  // session, skip. Two workers writing the same summary row trip the
  // Deeplake UPDATE-coalescing quirk (see CLAUDE.md) and drop one write.
  if (!tryAcquireLock(sessionId)) {
    wikiLog(`SessionEnd: periodic worker already running for ${sessionId}, skipping`);
    return;
  }

  wikiLog(`SessionEnd: triggering summary for ${sessionId}`);
  try {
    spawnWikiWorker({
      config,
      sessionId,
      cwd,
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      reason: "SessionEnd",
    });
  } catch (e: any) {
    // Spawn threw before the worker took ownership of the lock: release
    // it here so a --resume can retrigger periodic summaries without
    // waiting for the 10-minute stale reclaim.
    log(`spawn failed: ${e.message}`);
    try {
      releaseLock(sessionId);
    } catch (releaseErr: any) {
      log(`releaseLock after spawn failure also failed: ${releaseErr.message}`);
    }
    throw e;
  }

  // (forceSessionEndTrigger already called above, before the wiki-worker lock check)
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
