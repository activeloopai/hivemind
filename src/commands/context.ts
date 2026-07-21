#!/usr/bin/env node

/**
 * CLI surface for `hivemind context`.
 *
 * Prints the same rules + open-goals + HOW-TO block that the
 * SessionStart forks inject into agent context. Two consumers:
 *
 *   1. pi / openclaw agents — these platforms don't have a SessionStart
 *      hook in v1, so they invoke `hivemind context` from the model to
 *      pull the block on demand. Deterministic output: identical to
 *      what claude-code / cursor / hermes get auto-injected, so the
 *      same prompt instructions land regardless of which agent runs
 *      them.
 *
 *   2. Any agent / human debugging the inject — `hivemind context`
 *      is a read-only diagnostic that surfaces what the renderer
 *      would produce right now without firing SessionStart.
 *
 * The CLI is thin: load config → construct DeeplakeApi → call
 * renderContextBlock → print. No flags in v1 (the renderer's
 * maxRules / maxGoals defaults of 10 are the v1 contract).
 */

import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { renderContextBlock } from "../hooks/shared/context-renderer.js";

const USAGE = `
hivemind context — print the rules + open-goals block on demand

Usage:
  hivemind context

Same output that SessionStart auto-injects for claude-code / cursor /
hermes: active org rules + the current user's open goals (status
opened or in_progress). Use from pi / openclaw agents (which have no
SessionStart hook in v1) to pull the block manually, or anywhere as
a read-only diagnostic to see what the renderer would produce right
now.
`.trim();

export async function runContextCommand(args: string[]): Promise<void> {
  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(USAGE);
    return;
  }

  const cfg = loadRoutedConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }

  const api = new DeeplakeApi(
    cfg.token,
    cfg.apiUrl,
    cfg.orgId,
    cfg.workspaceId,
    cfg.tableName,
  );

  const known = await api.knownTablesOrNull();
  const tableExists = known ? (name: string) => known.includes(name) : undefined;
  const block = await renderContextBlock(
    (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>,
    {
      rulesTable: cfg.rulesTableName,
      goalsTable: cfg.goalsTableName,
      currentUser: cfg.userName,
    },
    { tableExists },
  );

  if (!block) {
    // Renderer returns "" on empty state OR caught failure. Either
    // way the user-facing message is the same: nothing to print.
    // Print to stderr so a caller pipe-ing the output gets an empty
    // stdout (the documented "nothing to inject" signal).
    console.error("(no active rules or open goals)");
    return;
  }

  console.log(block);
}
