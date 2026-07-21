#!/usr/bin/env node

/**
 * Capture hook — writes each session event as a separate row in the sessions table.
 * One INSERT per event, no concat, no race conditions.
 *
 * Used by: UserPromptSubmit, PostToolUse (async), Stop, SubagentStop
 */

import { readStdin } from "../utils/stdin.js";
import { type Config } from "../config.js";
import { resolveCaptureConfig } from "./shared/dir-gate.js";
import { redactSecrets } from "./shared/redact.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { projectNameFromCwd } from "../utils/project-name.js";
import { log as _log } from "../utils/debug.js";
import { buildSessionPath } from "../utils/session-path.js";
import { parseClaudeTurnMetaLive } from "../notifications/model-usage.js";
import {
  bumpTotalCount,
  loadTriggerConfig,
  shouldTrigger,
  tryAcquireLock,
  releaseLock,
  ensureSessionOwner,
} from "./summary-state.js";
import { bundleDirFromImportMeta, spawnWikiWorker, wikiLog } from "./spawn-wiki-worker.js";
import { appendSessionEvent } from "./session-event-cache.js";
import { tryStopCounterTrigger } from "../skillify/triggers.js";
import { reactSkillOpt } from "./shared/skillopt-hook.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingSqlLiteral } from "../embeddings/sql.js";
import { buildDirectSessionInsertSql } from "./shared/session-insert-sql.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";
import { ensurePluginNodeModulesLink } from "../embeddings/self-heal.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getInstalledVersion } from "../utils/version-check.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
const log = (msg: string) => _log("capture", msg);

function resolveEmbedDaemonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "embeddings", "embed-daemon.js");
}

const __bundleDir = dirname(fileURLToPath(import.meta.url));
const PLUGIN_VERSION = getInstalledVersion(__bundleDir, ".claude-plugin") ?? "";

// Self-heal the shared-deps symlink for this plugin version. Marketplace
// auto-upgrades drop new versioned cache dirs without the symlink that
// `hivemind embeddings install` originally created; this restores it on
// first capture after each upgrade. No-op when the symlink already exists,
// shared deps are not installed, or the user has disabled embeddings.
if (!embeddingsDisabled()) {
  try { ensurePluginNodeModulesLink({ bundleDir: __bundleDir }); } catch { /* best-effort */ }
}

interface HookInput {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  agent_id?: string;
  agent_type?: string;
  // UserPromptSubmit
  prompt?: string;
  // PostToolUse
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
  // Stop / SubagentStop
  last_assistant_message?: string;
  stop_hook_active?: boolean;
  agent_transcript_path?: string;
}

const CAPTURE = process.env.HIVEMIND_CAPTURE !== "false";

async function main(): Promise<void> {
  if (!CAPTURE) return;
  if (!isHivemindPluginEnabled()) { log("plugin disabled, skipping capture"); return; }
  if (!entrypointPassesOnlyCliGate()) return;
  const input = await readStdin<HookInput>();
  // Per-directory `.hivemind`: skip capture where opted out, and route to the
  // configured org/workspace otherwise.
  const config = resolveCaptureConfig(input.cwd ?? process.cwd(), log);
  if (!config) return;

  // Self-heal the owner record for sessions that were already open before this
  // shipped (SessionStart only records it for new sessions). One /proc walk on
  // the first event where the record is missing; a no-op thereafter.
  if (input.session_id && process.env.HIVEMIND_WIKI_WORKER !== "1") {
    ensureSessionOwner(input.session_id);
  }

  const sessionsTable = config.sessionsTableName;
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, sessionsTable);

  // Build the event entry
  const ts = new Date().toISOString();
  const meta = {
    session_id: input.session_id,
    transcript_path: input.transcript_path,
    cwd: input.cwd,
    permission_mode: input.permission_mode,
    hook_event_name: input.hook_event_name,
    agent_id: input.agent_id,
    agent_type: input.agent_type,
    timestamp: ts,
  };

  let entry: Record<string, unknown>;

  if (input.prompt !== undefined) {
    log(`user session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "user_message",
      content: input.prompt,
    };
  } else if (input.tool_name !== undefined) {
    log(`tool=${input.tool_name} session=${input.session_id}`);
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "tool_call",
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      tool_input: JSON.stringify(input.tool_input),
      tool_response: JSON.stringify(input.tool_response),
    };
  } else if (input.last_assistant_message !== undefined) {
    log(`assistant session=${input.session_id}`);
    // Model / usage aren't in the hook payload — read them from the transcript's
    // last assistant turn (best-effort; null on any read/parse failure). On
    // SubagentStop, last_assistant_message belongs to the subagent transcript;
    // transcript_path points at the parent session, so prefer the agent one.
    // The Stop event races the transcript writer (the turn's final assistant
    // record may not be flushed yet), so this re-reads across a short backoff
    // and correlates the record with last_assistant_message — never attributing
    // a PREVIOUS turn's tokens to this one. A sidechain record is a subagent's
    // on a main-session Stop, but IS the turn on SubagentStop.
    // An empty last_assistant_message can't be correlated with a transcript
    // record — skipping the correlation would silently accept the PREVIOUS
    // turn's record, so skip the enrichment instead.
    const expectText = typeof input.last_assistant_message === "string" ? input.last_assistant_message.trim() : "";
    if (!expectText) log("empty last_assistant_message — skipping turn-meta enrichment");
    const modelMeta = expectText
      ? await parseClaudeTurnMetaLive(
          input.agent_transcript_path ?? input.transcript_path,
          expectText,
          Boolean(input.agent_transcript_path),
        )
      : null;
    entry = {
      id: crypto.randomUUID(),
      ...meta,
      type: "assistant_message",
      content: input.last_assistant_message,
      ...(input.agent_transcript_path ? { agent_transcript_path: input.agent_transcript_path } : {}),
      ...(modelMeta ?? {}),
    };
  } else {
    log("unknown event, skipping");
    return;
  }

  const sessionPath = buildSessionPath(config, input.session_id);
  // Mask secrets (tokens, passwords, API keys) before the payload is embedded
  // or written to the store. Redacting the serialized line covers every field
  // (content / tool_input / tool_response) and both egress paths at once.
  const line = redactSecrets(JSON.stringify(entry));
  log(`writing to ${sessionPath}`);

  // Simple INSERT — one row per event, no concat, no race conditions.
  const projectName = projectNameFromCwd(input.cwd);
  const filename = sessionPath.split("/").pop() ?? "";

  // For JSONB: only escape single quotes for the SQL literal, keep JSON structure intact.
  // sqlStr() would also escape backslashes and strip control chars, corrupting the JSON.
  const jsonForSql = line.replace(/'/g, "''");

  // Skip the daemon round-trip entirely when embeddings are globally disabled —
  // the column stays NULL, schema-compatible with future re-enabling.
  const embedding = embeddingsDisabled()
    ? null
    : await new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() }).embed(line, "document");
  const embeddingSql = embeddingSqlLiteral(embedding);

  const insertSql = buildDirectSessionInsertSql(sessionsTable, {
    // Reuse the event id already embedded in the message JSON so the row PK
    // matches the payload's id (and keeps the dedup key = the logical event).
    id: entry.id as string,
    sessionPath,
    filename,
    jsonForSql,
    embeddingSql,
    userName: config.userName,
    sizeBytes: Buffer.byteLength(line, "utf-8"),
    projectName,
    description: input.hook_event_name ?? "",
    agent: "claude_code",
    pluginVersion: PLUGIN_VERSION,
    timestamp: ts,
  });

  try {
    await api.query(insertSql);
  } catch (e: any) {
    // Fallback: table might not exist (session-start failed or org switched mid-session).
    // Create it and retry once.
    if (e.message?.includes("permission denied") || e.message?.includes("does not exist")) {
      log("table missing, creating and retrying");
      await api.ensureSessionsTable(sessionsTable);
      await api.query(insertSql);
    } else {
      throw e;
    }
  }

  log("capture ok → cloud");

  // Mirror the event into the local per-session cache (row-for-row identical
  // to the `message` column just INSERTed). The wiki-worker reads this instead
  // of re-scanning the entire fat `message` column for the current session on
  // every periodic / session-end summary trigger. Best-effort; DB stays the
  // source of truth. Only reached after a successful INSERT above.
  appendSessionEvent(input.session_id, line);

  // Commit-driven KPI auto-extract is disabled for now — the
  // fire-and-forget sub-agent spawned per `git commit` (see
  // src/hooks/commit-kpi-extract.ts) consumed a high amount of tokens
  // on the user's claude/codex plan (every commit triggered a full
  // goal/KPI scan + reasoning pass over the diff). The module is
  // kept on disk for future re-wiring once we add: sha-dedup,
  // empty-goals prefilter, debounce, and a hard timeout. Re-enable
  // by restoring the import + try block here.

  maybeTriggerPeriodicSummary(input.session_id, input.cwd ?? "", config);

  // SkillOpt: the user prompt is the reaction to a recently-used org skill. Swallowed.
  reactSkillOpt(input.session_id, input.prompt, "claude_code");

  if (input.hook_event_name === "Stop") {
    if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
    tryStopCounterTrigger({
      config,
      cwd: input.cwd ?? "",
      bundleDir: bundleDirFromImportMeta(import.meta.url),
      agent: "claude_code",
      sessionId: input.session_id,
    });
  }
}

/** Increment the event counter and, if the threshold is crossed, spawn a background wiki worker. */
function maybeTriggerPeriodicSummary(sessionId: string, cwd: string, config: Config): void {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  try {
    const state = bumpTotalCount(sessionId);
    const cfg = loadTriggerConfig();
    if (!shouldTrigger(state, cfg)) return;

    if (!tryAcquireLock(sessionId)) {
      log(`periodic trigger suppressed (lock held) session=${sessionId}`);
      return;
    }

    wikiLog(`Periodic: threshold hit (total=${state.totalCount}, since=${state.totalCount - state.lastSummaryCount}, N=${cfg.everyNMessages}, hours=${cfg.everyHours})`);
    try {
      spawnWikiWorker({
        config,
        sessionId,
        cwd,
        bundleDir: bundleDirFromImportMeta(import.meta.url),
        reason: "Periodic",
      });
    } catch (e: any) {
      log(`periodic spawn failed: ${e.message}`);
      try {
        releaseLock(sessionId);
      } catch (releaseErr: any) {
        log(`releaseLock after periodic spawn failure also failed: ${releaseErr.message}`);
      }
      throw e;
    }
  } catch (e: any) {
    log(`periodic trigger error: ${e.message}`);
  }
}

main().catch((e) => {
  const msg: string = e?.message ?? String(e);
  log(`fatal: ${msg}`);
  // We deliberately surface NOTHING mid-session here. Claude Code only
  // renders `systemMessage` (the user-visible channel) for SessionStart
  // hooks — for PostToolUse it is silently dropped, so the only channel
  // that would reach mid-session is `additionalContext`, which is the
  // MODEL's prompt. Writing a user-facing "credits exhausted, top up at
  // <url>" notice there is a prompt-injection pattern (imperative text +
  // URL injected into the model's context) and external agents correctly
  // flag it. The credit-exhausted condition is surfaced to the USER via the
  // SessionStart banner instead — deeplake-api.ts enqueues a
  // `userVisibleOnly` `balance-exhausted` notification. Hard rule: nothing
  // user-facing is ever written into the model/agent prompt.
  process.exit(0);
});
