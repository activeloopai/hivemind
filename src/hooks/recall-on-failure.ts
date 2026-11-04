#!/usr/bin/env node

/**
 * Local proactive recall — Claude Code PostToolUseFailure hook.
 *
 * When a Bash / MCP tool call fails with a real error (not a grep miss, a user
 * rejection or an Edit mismatch), distill the error text and look it up in the
 * LOCAL index of teammates' summaries. On a confident match, inject one
 * attributed pointer ("<teammate> hit this <when> in <project>: ...") so the
 * agent checks the team's prior fix before debugging from scratch.
 *
 * No backend call on this path, no embeddings: the index is maintained by the
 * background recall-sync worker (see src/recall/sync.ts). Mode (off / shadow /
 * on) is resolved by src/recall/policy.ts; default shadow = record only.
 */

import { readStdin } from "../utils/stdin.js";
import { isHivemindEnabled } from "../dir-config.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";
import { log as _log } from "../utils/debug.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
import { classifyFailure, failureKey } from "../recall/error-normalize.js";
import { runRecall, emitAdditionalContext } from "./shared/recall-run.js";

const log = (msg: string) => _log("recall-failure", msg);

interface FailureHookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: unknown;
  is_interrupt?: boolean;
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  if (!isHivemindPluginEnabled()) return;
  if (!entrypointPassesOnlyCliGate()) return;

  const input = await readStdin<FailureHookInput>();
  if (!isHivemindEnabled(input.cwd ?? process.cwd())) return;

  const verdict = classifyFailure(input);
  if (!verdict.worthy) { log(`skip ${verdict.reason} tool=${input.tool_name}`); return; }

  const ctx = runRecall({
    trigger: "failure",
    sessionId: input.session_id,
    cwd: input.cwd,
    query: verdict.query,
    dedupeKey: `f:${failureKey(verdict.terms)}`,
    gate: input.tool_name,
  }, log);
  if (ctx) emitAdditionalContext("PostToolUseFailure", ctx);
}

main().catch((e) => { log(`fatal: ${e?.message ?? e}`); process.exit(0); });
