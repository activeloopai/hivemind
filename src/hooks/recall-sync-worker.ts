#!/usr/bin/env node

/**
 * Detached worker: refresh the local proactive-recall cache from the memory
 * table. Spawned by session-start-setup (fire-and-forget) so a first full pull
 * on a large org never delays a session. Throttled + single-flighted inside
 * syncRecallCache, so spawning it on every SessionStart is cheap.
 *
 * argv[2]: the session cwd (for `.hivemind` workspace routing).
 */

import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { recallMode } from "../recall/policy.js";
import { syncRecallCache } from "../recall/sync.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("recall-sync", msg);

async function main(): Promise<void> {
  if (recallMode("failure") === "off" && recallMode("prompt") === "off") return;
  const config = loadRoutedConfig(process.argv[2] || process.cwd());
  if (!config?.token) return;
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const r = await syncRecallCache({
    query: (sql) => api.query(sql),
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    table: config.tableName,
    userName: config.userName,
  });
  log(`${r.status} fetched=${r.fetched} removed=${r.removed} total=${r.total} pages=${r.pages} ms=${r.ms}${r.error ? ` error=${r.error}` : ""}`);
}

main().catch((e) => { log(`fatal: ${e?.message ?? e}`); process.exit(0); });
