#!/usr/bin/env node

/**
 * Detached worker: upload events of Claude Code sessions whose capture
 * stopped while their transcript kept growing (see capture-recovery/recover.ts).
 *
 * argv[2]: the spawning session's id (skipped — it is capturing right now).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { type Config } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { resolveCaptureConfig } from "./shared/dir-gate.js";
import { redactSecrets } from "./shared/redact.js";
import { buildDirectSessionInsertSql } from "./shared/session-insert-sql.js";
import { appendSessionEvent, sessionEventCachePath } from "./session-event-cache.js";
import { buildSessionPath } from "../utils/session-path.js";
import { projectNameFromCwd } from "../utils/project-name.js";
import { getInstalledVersion } from "../utils/version-check.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";
import { log as _log } from "../utils/debug.js";
import { acquireSyncLock } from "../recall/cache.js";
import { enqueueNotification } from "../notifications/queue.js";
import { tryAcquireLock, markSummaryAttempt, releaseLock } from "./summary-state.js";
import { spawnWikiWorker } from "./spawn-wiki-worker.js";
import { findCaptureGaps, recoverCaptureGaps, recoveredEntry, type CaptureGap } from "../capture-recovery/recover.js";
import { captureRecoveryDisabled, recoveryStateDir } from "../capture-recovery/trigger.js";

const log = (msg: string) => _log("capture-recovery", msg);
const __bundleDir = dirname(fileURLToPath(import.meta.url));
const PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".claude-plugin") ?? "";

async function main(): Promise<void> {
  if (captureRecoveryDisabled() || !isHivemindPluginEnabled()) return;
  const currentSession = process.argv[2] ?? "";
  const cacheDir = dirname(sessionEventCachePath("x"));
  // Events skipped because their directory opted out stay skipped, even if
  // the opt-out is removed later.
  const floorsPath = join(recoveryStateDir(), "skipped.json");
  let floors: Record<string, number> = {};
  try { floors = JSON.parse(readFileSync(floorsPath, "utf-8")); } catch { /* none yet */ }
  const gaps = findCaptureGaps({ cacheDir, skipSessionId: currentSession, floors });
  if (gaps.length === 0) return;

  const release = acquireSyncLock(recoveryStateDir());
  if (!release) { log("another recovery is running"); return; }
  try {
    const configs = new Map<string, Config | null>();
    const configFor = (cwd: string) => {
      if (!configs.has(cwd)) configs.set(cwd, resolveCaptureConfig(cwd, log));
      return configs.get(cwd) ?? null;
    };
    const apis = new Map<string, DeeplakeApi>();
    const apiFor = (c: Config) => {
      const k = `${c.orgId}/${c.workspaceId}/${c.sessionsTableName}`;
      if (!apis.has(k)) apis.set(k, new DeeplakeApi(c.token, c.apiUrl, c.orgId, c.workspaceId, c.sessionsTableName));
      return apis.get(k)!;
    };

    const r = await recoverCaptureGaps(gaps, {
      log,
      // The session's directory comes from its transcript (the cached cwd may
      // be redacted); the per-directory opt-out and routing apply as in capture.
      accept: (gap, events) => {
        gap.cwd = [...events].reverse().find((e) => e.cwd)?.cwd ?? gap.cwd;
        return configFor(gap.cwd) !== null;
      },
      writeEvent: async (gap, ev) => {
        const config = configFor(gap.cwd)!;
        const line = redactSecrets(JSON.stringify(recoveredEntry(gap.sessionId, gap, ev)));
        const sessionPath = buildSessionPath(config, gap.sessionId);
        await apiFor(config).query(buildDirectSessionInsertSql(config.sessionsTableName, {
          id: ev.id,
          sessionPath,
          filename: sessionPath.split("/").pop() ?? "",
          jsonForSql: line.replace(/'/g, "''"),
          embeddingSql: "NULL",
          userName: config.userName,
          sizeBytes: Buffer.byteLength(line, "utf-8"),
          projectName: projectNameFromCwd(ev.cwd ?? gap.cwd),
          description: ev.hookEvent,
          agent: "claude_code",
          pluginVersion: PLUGIN_VERSION,
          timestamp: ev.ts,
        }));
        appendSessionEvent(gap.sessionId, line);
      },
      onSkipped: (gap, uptoMs) => {
        floors[gap.sessionId] = uptoMs;
        try {
          mkdirSync(recoveryStateDir(), { recursive: true });
          writeFileSync(floorsPath, JSON.stringify(floors));
        } catch (e: any) { log(`could not record skip: ${e?.message ?? e}`); }
      },
      onRecovered: (gap) => refreshSummary(gap, configFor(gap.cwd)!),
    });
    log(`done sessions=${r.sessions} events=${r.events} failed=${r.failed}`);
    if (r.events > 0) {
      await enqueueNotification({
        id: "capture-recovered",
        severity: "info",
        title: `Hivemind recovered ${r.events} uncaptured event${r.events === 1 ? "" : "s"}`,
        body:
          `${r.sessions} session${r.sessions === 1 ? "" : "s"} kept running after Claude Code removed the plugin ` +
          `version ${r.sessions === 1 ? "it was" : "they were"} started with, so ${r.sessions === 1 ? "its" : "their"} ` +
          `capture had stopped. The missing prompts, tool calls and replies were uploaded from the local transcript. ` +
          `Restart long-running sessions after a Hivemind update to keep live capture.`,
        dedupKey: { sessions: r.bySession.map((s) => s.sessionId).sort(), events: r.events, at: new Date().toISOString().slice(0, 13) },
        userVisibleOnly: true,
      }).catch(() => undefined);
    }
  } finally {
    release();
  }
}

/** Re-summarize a recovered session so its wiki summary covers the gap. */
function refreshSummary(gap: CaptureGap, config: Config): void {
  if (!tryAcquireLock(gap.sessionId)) return;
  try {
    markSummaryAttempt(gap.sessionId);
    spawnWikiWorker({ config, sessionId: gap.sessionId, cwd: gap.cwd, bundleDir: __bundleDir, reason: "Recovered" });
  } catch (e: any) {
    log(`summary spawn failed: ${e?.message ?? e}`);
    try { releaseLock(gap.sessionId); } catch { /* best-effort */ }
  }
}

main().catch((e) => { log(`fatal: ${e?.message ?? e}`); process.exit(0); });
