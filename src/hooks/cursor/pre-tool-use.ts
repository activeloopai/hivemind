/**
 * Cursor preToolUse hook (matcher: Shell).
 *
 * Cursor 1.7+ docs: https://cursor.com/docs/agent/hooks
 *
 * When the agent runs a Shell command that targets `~/.deeplake/memory/`,
 * we want to:
 *   - parse the bash command (grep / rg / egrep / fgrep)
 *   - run a single SQL fast-path query against the deeplake `memory` and
 *     `sessions` tables (via the same `searchDeeplakeTables` primitive that
 *     Claude Code, Codex, and OpenClaw use), and
 *   - return an `updated_input` that replaces the original command with
 *     `echo <result>` so Cursor still "runs" something but sees the
 *     pre-computed answer.
 *
 * Result: Cursor recall against `~/.deeplake/memory/` matches Claude Code's
 * accuracy and speed (one SQL query) instead of streaming many readdir/open
 * roundtrips through the virtual filesystem. Lifts Cursor from Tier 3 to
 * Tier 1 in the per-agent accuracy ladder.
 *
 * Input  shape (Cursor): { tool_name, tool_input, tool_use_id, cwd,
 *                           agent_message, conversation_id, hook_event_name,
 *                           workspace_roots, ... }
 * Output shape          : { permission: "allow", updated_input: { command } }
 *                          OR fall through (no JSON, exit 0) to leave the
 *                          command alone for Cursor's own bash to run.
 */

import { readStdin } from "../../utils/stdin.js";
import { deriveProjectKey } from "../../utils/repo-identity.js";
import { loadRoutedConfig } from "../../dir-config.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { log as _log } from "../../utils/debug.js";
import { parseBashGrep, handleGrepDirect } from "../grep-direct.js";
import { touchesMemory, rewritePaths } from "../memory-path-utils.js";
import { tryGraphRead } from "../../graph/graph-command.js";
import { tryDocsRead } from "../../docs/docs-command.js";
import { makeQueryEmbedder } from "../../docs/embed.js";
const log = (msg: string) => _log("cursor-pre-tool-use", msg);

interface CursorShellToolInput {
  command?: string;
}

interface CursorPreToolUseInput {
  tool_name?: string;
  tool_input?: CursorShellToolInput | Record<string, unknown>;
  tool_use_id?: string;
  cwd?: string;
  conversation_id?: string;
  hook_event_name?: string;
  workspace_roots?: string[];
}

async function main(): Promise<void> {
  const input = await readStdin<CursorPreToolUseInput>();
  if (input.tool_name !== "Shell") return; // only intercept Shell, not Read/Write/MCP

  const command = (input.tool_input as CursorShellToolInput | undefined)?.command;
  if (typeof command !== "string" || command.length === 0) return;
  if (!touchesMemory(command)) return; // not aimed at our mount — let Cursor run it

  // Translate host paths (~/.deeplake/memory, $HOME/..., absolute) to the
  // virtual mount root "/" before parsing — same step Claude / Codex run.
  const rewritten = rewritePaths(command);

  // Graph VFS dispatch — a cat/head/tail/ls on the `/graph/*` subtree is
  // answered from the local snapshot (synthesized text), no SQL, no disk.
  // Must run BEFORE parseBashGrep: a `cat /graph/find/foo` isn't a grep and
  // would otherwise fall through and leave Cursor blind to the graph (the
  // exact gap that made Cursor silently lack graph queries). See
  // src/graph/graph-command.ts (shared with the Claude Code intercept).
  const graphBody = tryGraphRead(rewritten, input.cwd ?? process.cwd());
  if (graphBody !== null) {
    log(`graph vfs intercept: ${command.slice(0, 80)}`);
    const echoCmd = `cat <<'__HIVEMIND_RESULT__'\n${graphBody}\n__HIVEMIND_RESULT__`;
    process.stdout.write(JSON.stringify({
      permission: "allow",
      updated_input: { command: echoCmd },
      agent_message: "[Hivemind graph]",
    }));
    return;
  }

  const config = loadRoutedConfig(input.cwd ?? process.cwd());
  if (!config) {
    log("no config — falling through to Cursor's bash");
    return;
  }

  const api = new DeeplakeApi(
    config.token,
    config.apiUrl,
    config.orgId,
    config.workspaceId,
    config.tableName,
  );

  // Docs VFS dispatch — a cat of /docs/* (browse or find/) answered from the
  // docs table, same rewrite trick as the graph dispatch above. Runs before the
  // grep parse so `cat /docs/find/x` (not a grep) isn't left to Cursor's host bash.
  const docsTable = process.env["HIVEMIND_DOCS_TABLE"] ?? config.docsTableName;
  // Fail OPEN like the grep path below: a throw here would crash the hook
  // without a decision and let a memory-touching command reach the host shell.
  let docsBody: string | null = null;
  try {
    docsBody = await tryDocsRead(rewritten, (sql) => api.query(sql), docsTable, { embedQuery: makeQueryEmbedder(), project: deriveProjectKey(input.cwd ?? process.cwd()).key });
  } catch (err) {
    log(`docs vfs failed: ${(err as Error).message}`);
    docsBody = "(docs temporarily unavailable — try again)";
  }
  if (docsBody !== null) {
    log(`docs vfs intercept: ${command.slice(0, 80)}`);
    const echoCmd = `cat <<'__HIVEMIND_RESULT__'\n${docsBody}\n__HIVEMIND_RESULT__`;
    process.stdout.write(JSON.stringify({
      permission: "allow",
      updated_input: { command: echoCmd },
      agent_message: "[Hivemind docs]",
    }));
    return;
  }

  const grepParams = parseBashGrep(rewritten);
  if (!grepParams) return; // not a grep/rg invocation we can handle directly

  try {
    const result = await handleGrepDirect(api, config.tableName, config.sessionsTableName, grepParams);
    if (result === null) {
      log(`fallthrough — handleGrepDirect returned null for "${grepParams.pattern}"`);
      return;
    }
    log(`intercepted ${command.slice(0, 80)} → ${result.length} chars from SQL fast-path`);
    // Replace the original Shell command with `echo <result>` so Cursor's
    // own bash runs a no-op-ish command and the agent sees our SQL answer.
    const echoCmd = `cat <<'__HIVEMIND_RESULT__'\n${result}\n__HIVEMIND_RESULT__`;
    process.stdout.write(JSON.stringify({
      permission: "allow",
      updated_input: { command: echoCmd },
      agent_message: `[Hivemind direct] ${grepParams.pattern}`,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`fast-path failed, falling through: ${msg}`);
    // Fall through — Cursor runs the original command via virtual FS.
  }
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
