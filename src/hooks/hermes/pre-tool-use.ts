/**
 * Hermes pre_tool_call hook (matcher: "terminal").
 *
 * Defense-in-depth for memory recall accuracy. The agent's preferred path
 * is the hivemind_search MCP tool — but if it ignores the skill guidance
 * and runs `rg` / `grep` against ~/.deeplake/memory/ via terminal, we
 * intercept that here and return the same SQL fast-path result other
 * Tier 1 agents (Claude / Codex / Cursor) get from their PreToolUse
 * interceptors.
 *
 * Hermes pre_tool_call output convention (from agent/shell_hooks.py):
 *   {"action": "block", "message": "..."}   — Hermes-canonical
 *   {"decision": "block", "reason": "..."}  — Claude-Code-style (also accepted)
 *
 * No command-rewrite is supported on this event, so we use "block" + the
 * SQL search results inlined as the block message. The agent sees the
 * actual data + a nudge toward the MCP tool.
 *
 * Returns nothing (silent fall-through) when the command isn't aimed at
 * our memory mount — Hermes runs the original command unmodified.
 */

import { readStdin } from "../../utils/stdin.js";
import { loadRoutedConfig } from "../../dir-config.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { log as _log } from "../../utils/debug.js";
import { parseBashGrep, handleGrepDirect } from "../grep-direct.js";
import { touchesMemory, rewritePaths } from "../memory-path-utils.js";
import { tryGraphRead } from "../../graph/graph-command.js";
import { armSkillOptOnSkillUse } from "../shared/skillopt-hook.js";
const log = (msg: string) => _log("hermes-pre-tool-use", msg);

interface HermesPreToolUseInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string } | Record<string, unknown>;
  session_id?: string;
  cwd?: string;
  extra?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const input = await readStdin<HermesPreToolUseInput>();
  // SkillOpt: hermes USES an org skill by shelling a read of its SKILL.md (the path is in the
  // terminal command). Arm the judgment window on it. Swallowed; never affects the decision below.
  armSkillOptOnSkillUse(input.session_id ?? "", input.tool_name ?? "", input.tool_input);
  // Hermes' shell-hook tool name for terminal commands is "terminal".
  if (input.tool_name !== "terminal") return;

  const ti = input.tool_input as { command?: string } | undefined;
  const command = ti?.command;
  if (typeof command !== "string" || command.length === 0) return;
  if (!touchesMemory(command)) return;

  const rewritten = rewritePaths(command);

  // Graph VFS dispatch — a cat/head/tail/ls on the `/graph/*` subtree is
  // answered from the local snapshot, no SQL, no config needed. Runs before
  // grep handling. Shared parser: src/graph/graph-command.ts.
  const graphBody = tryGraphRead(rewritten, input.cwd ?? process.cwd());
  if (graphBody !== null) {
    log(`graph vfs intercept: ${command.slice(0, 80)}`);
    process.stdout.write(JSON.stringify({ action: "block", message: graphBody }));
    return;
  }

  const grepParams = parseBashGrep(rewritten);
  if (!grepParams) return; // not grep/rg/egrep/fgrep — leave it alone

  const config = loadRoutedConfig(input.cwd ?? process.cwd());
  if (!config) {
    log("no config — falling through to Hermes");
    return;
  }

  const api = new DeeplakeApi(
    config.token,
    config.apiUrl,
    config.orgId,
    config.workspaceId,
    config.tableName,
  );

  try {
    const result = await handleGrepDirect(api, config.tableName, config.sessionsTableName, grepParams);
    if (result === null) return;
    log(`intercepted ${command.slice(0, 80)} → ${result.length} chars from SQL fast-path`);

    const message = [
      result,
      "",
      "(Hivemind: blocked the slow grep against ~/.deeplake/memory/ and ran a single SQL query instead. " +
        "For future recalls, prefer the hivemind_search MCP tool — same accuracy, no terminal round-trip.)",
    ].join("\n");

    process.stdout.write(JSON.stringify({ action: "block", message }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`fast-path failed, falling through: ${msg}`);
    // Silent — Hermes runs the original command via its terminal tool.
  }
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
