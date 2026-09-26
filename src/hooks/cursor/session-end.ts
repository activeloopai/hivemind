#!/usr/bin/env node

/**
 * Cursor sessionEnd hook (fire-and-forget).
 *
 * Cursor input: { session_id, reason, duration_ms, is_background_agent,
 *                 final_status, error_message? } + common payload.
 *
 * Spawns a final wiki-worker run via cursor-agent --print so the session
 * gets an AI summary in the memory table. Mirrors the harnesses/codex/CC flow.
 */

import { readStdin } from "../../utils/stdin.js";
import { isHivemindActive } from "../../activation.js";
import { resolveCursorCwd } from "./cwd.js";
import { log as _log } from "../../utils/debug.js";
import { loadConfig } from "../../config.js";
import { resolveDirConfig } from "../../dir-config.js";
import { tryAcquireLock } from "../summary-state.js";
import { bundleDirFromImportMeta, spawnCursorWikiWorker, wikiLog } from "./spawn-wiki-worker.js";
import { forceSessionEndTrigger } from "../../skillify/triggers.js";

const log = (msg: string) => _log("cursor-session-end", msg);

interface CursorSessionEndInput {
  conversation_id?: string;
  cwd?: string;
  workspace_roots?: string[];
  session_id?: string;
  reason?: string;
  duration_ms?: number;
  final_status?: string;
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  const input = await readStdin<CursorSessionEndInput>();
  // Activation gate: Hivemind stays fully silent (no context, recall, network
  // or capture) where it isn't active — see src/activation.ts.
  if (!isHivemindActive(resolveCursorCwd(input), log)) return;
  const sessionId = input.conversation_id ?? input.session_id ?? "";
  log(`session=${sessionId || "?"} reason=${input.reason ?? "?"} status=${input.final_status ?? "?"}`);
  if (!sessionId) return;
  const base = loadConfig();
  if (!base) { wikiLog(`SessionEnd: no config, skipping summary`); return; }
  // The project dir comes from the payload: Cursor runs user hooks with a
  // process cwd that is not the open project, so resolving `.hivemind` from
  // process.cwd() would miss a `collect: false` and summarize anyway.
  const cwd = resolveCursorCwd(input);
  const dirRes = resolveDirConfig(base, cwd);
  if (!dirRes.collect) { wikiLog(`SessionEnd: capture disabled for this directory (${dirRes.found?.path})`); return; }
  const config = dirRes.config;

  // Skillify has its own per-project lock — fire before the wiki-worker lock
  // check so a Periodic trigger that already holds the lock doesn't suppress
  // skill mining.
  try {
    forceSessionEndTrigger({
      config,
      cwd,
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      agent: "cursor",
      sessionId,
    });
  } catch (e: any) {
    wikiLog(`SessionEnd: skillify trigger failed: ${e?.message ?? e}`);
  }

  // Coordinate with the periodic worker: skip the final spawn if a periodic
  // is mid-flight. Lock TTL covers crashed workers.
  if (!tryAcquireLock(sessionId)) {
    wikiLog(`SessionEnd: periodic worker already running for ${sessionId}, skipping final`);
    return;
  }

  try {
    spawnCursorWikiWorker({
      config,
      sessionId,
      cwd,
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      reason: "SessionEnd",
    });
  } catch (e: any) {
    wikiLog(`SessionEnd: wiki spawn failed: ${e?.message ?? e}`);
  }
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
