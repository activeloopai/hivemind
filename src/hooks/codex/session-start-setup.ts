#!/usr/bin/env node

/**
 * Codex SessionStart async setup hook:
 * Runs server-side operations (table creation, placeholder, version check)
 * in the background so they don't block session startup.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { loadCredentials, saveCredentials } from "../../commands/auth.js";
import { loadConfig } from "../../config.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { readStdin } from "../../utils/stdin.js";
import { createPlaceholderSummary } from "../shared/placeholder-summary.js";
import { log as _log } from "../../utils/debug.js";
import { makeWikiLogger } from "../../utils/wiki-log.js";
import { autoUpdate } from "../shared/autoupdate.js";
import { getInstalledVersion } from "../../utils/version-check.js";
const log = (msg: string) => _log("codex-session-setup", msg);

const { log: wikiLog } = makeWikiLogger(join(homedir(), ".codex", "hooks"));

const __bundleDir = dirname(fileURLToPath(import.meta.url));
const PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".codex-plugin") ?? "";

/** Create a placeholder summary via the shared race-safe writer (see placeholder-summary.ts). */
async function createPlaceholder(api: DeeplakeApi, table: string, sessionId: string, cwd: string, userName: string, orgName: string, workspaceId: string): Promise<void> {
  await createPlaceholderSummary(
    (sql) => api.query(sql),
    { table, sessionId, cwd, userName, orgName, workspaceId, agent: "codex", pluginVersion: PLUGIN_VERSION },
    wikiLog,
  );
}

interface CodexSessionStartInput {
  session_id: string;
  transcript_path?: string | null;
  cwd: string;
  hook_event_name: string;
  model: string;
  source?: string;
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  const input = await readStdin<CodexSessionStartInput>();
  const creds = loadCredentials();
  if (!creds?.token) { log("no credentials"); return; }

  // Backfill userName if missing
  if (!creds.userName) {
    try {
      const { userInfo } = await import("node:os");
      creds.userName = userInfo().username ?? "unknown";
      saveCredentials(creds);
      log(`backfilled userName: ${creds.userName}`);
    } catch { /* non-fatal */ }
  }

  // Centralized autoupdate fires BEFORE the DB ensure-table calls — those
  // can stall for tens of seconds against a slow/unreachable backend, and
  // autoUpdate has no dependency on table state. Run it first so the user
  // sees the upgrade notice promptly even when the API is down.
  await autoUpdate(creds, { agent: "codex" });

  // Table setup + sync — always sync, only skip placeholder when capture disabled
  const captureEnabled = process.env.HIVEMIND_CAPTURE !== "false";
  if (input.session_id) {
    try {
      const config = loadConfig();
      if (config) {
        const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
        await api.ensureTable();
        await api.ensureSessionsTable(config.sessionsTableName);
        if (captureEnabled) {
          await createPlaceholder(api, config.tableName, input.session_id, input.cwd ?? "", config.userName, config.orgName, config.workspaceId);
        }
        log("setup complete");
      }
    } catch (e: any) {
      log(`setup failed: ${e.message}`);
      wikiLog(`SessionSetup: failed for ${input.session_id}: ${e.message}`);
    }
  }
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
