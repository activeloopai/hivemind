/**
 * Spawn a detached skillify worker. Mirror of spawn-wiki-worker.ts.
 *
 * The hook calls this when the per-project Stop counter crosses the
 * threshold. It writes a config JSON to tmpdir, spawns the worker,
 * and returns immediately. All heavy work (Deeplake fetch, model gate,
 * skill write) happens in the detached child.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync, appendFileSync, chmodSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type { Config } from "../config.js";
import { utcTimestamp } from "../utils/debug.js";
import { findAgentBin, type Agent } from "./gate-runner.js";
import { spawnDetachedNodeWorker } from "../utils/spawn-detached.js";

const HOME = homedir();
export const SKILLIFY_LOG = join(HOME, ".claude", "hooks", "skillify.log");

export function skillifyLog(msg: string): void {
  try {
    mkdirSync(dirname(SKILLIFY_LOG), { recursive: true });
    appendFileSync(SKILLIFY_LOG, `[${utcTimestamp()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// Re-export from scope-config.ts so callers don't need a second import path.
export type { Scope, InstallLocation, ScopeConfig } from "./scope-config.js";
import type { ScopeConfig } from "./scope-config.js";

export interface SkillifySpawnOptions {
  config: Config;
  cwd: string;
  projectKey: string;
  project: string;
  bundleDir: string;
  agent: string;
  scopeConfig: ScopeConfig;
  /** session_id of the live session that triggered the spawn — excluded from mining */
  currentSessionId?: string;
  reason: string;
}

export function spawnSkillifyWorker(opts: SkillifySpawnOptions): void {
  const { config, cwd, projectKey, project, bundleDir, agent, scopeConfig, currentSessionId, reason } = opts;

  const tmpDir = join(tmpdir(), `deeplake-skillify-${projectKey}-${Date.now()}`);
  // Worker handoffs contain provider metadata, but no credentials or database URL.
  mkdirSync(tmpDir, { recursive: true, mode: 0o700 });

  // Resolve the gate CLI for this agent up front (faster cold-start in the
  // worker, fail-fast if the binary doesn't exist on this machine).
  const gateBin = findAgentBin(agent as Agent);

  const configFile = join(tmpDir, "config.json");
  // Keep the file private because it still carries local paths and project data.
  writeFileSync(configFile, JSON.stringify({
    storage: {
      kind: config.storage?.kind ?? "deeplake",
      orgId: (config.storage?.kind ?? "deeplake") === "deeplake" ? config.orgId : undefined,
      workspaceId: (config.storage?.kind ?? "deeplake") === "deeplake" ? config.workspaceId : undefined,
    },
    sessionsTable: config.sessionsTableName,
    skillsTable: config.skillsTableName,
    userName: config.userName,
    cwd,
    projectKey,
    project,
    agent,
    scope: scopeConfig.scope,
    team: scopeConfig.team,
    install: scopeConfig.install,
    tmpDir,
    gateBin,
    cursorModel: process.env.HIVEMIND_CURSOR_MODEL,
    hermesProvider: process.env.HIVEMIND_HERMES_PROVIDER,
    hermesModel: process.env.HIVEMIND_HERMES_MODEL,
    piProvider: process.env.HIVEMIND_PI_PROVIDER,
    piModel: process.env.HIVEMIND_PI_MODEL,
    skillifyLog: SKILLIFY_LOG,
    currentSessionId,
  }), { mode: 0o600 });
  // chmod again as a belt-and-suspenders against umask weirdness — some
  // file systems / overlay setups strip mode bits on the initial create.
  try { chmodSync(configFile, 0o600); } catch { /* best effort */ }

  skillifyLog(`${reason}: spawning skillify worker for project=${project} key=${projectKey}`);

  const workerPath = join(bundleDir, "skillify-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);

  skillifyLog(`${reason}: spawned skillify worker for ${projectKey}`);
}

export function bundleDirFromImportMeta(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}
