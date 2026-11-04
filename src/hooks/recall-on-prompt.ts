#!/usr/bin/env node

/**
 * Local proactive recall — Claude Code UserPromptSubmit hook.
 *
 * On a recall-worthy prompt (cheap gate first — acks and short follow-ups are
 * skipped), look the prompt up in the LOCAL index of teammates' summaries and,
 * on a confident match, inject one attributed pointer. Replaces the removed
 * embeddings-only recall (#355): no backend call, no embeddings, works on
 * every existing summary row.
 *
 * Prompts are noisier than errors, so the relevance bar is stricter than the
 * failure trigger's (src/recall/policy.ts) and the default mode is shadow.
 */

import { readStdin } from "../utils/stdin.js";
import { isHivemindEnabled } from "../dir-config.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";
import { log as _log } from "../utils/debug.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
import { shouldRecall } from "./shared/recall-gate.js";
import { runRecall, emitAdditionalContext } from "./shared/recall-run.js";

const log = (msg: string) => _log("recall-prompt", msg);

interface PromptHookInput {
  session_id?: string;
  cwd?: string;
  prompt?: string;
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  if (!isHivemindPluginEnabled()) return;
  if (!entrypointPassesOnlyCliGate()) return;

  const input = await readStdin<PromptHookInput>();
  if (!isHivemindEnabled(input.cwd ?? process.cwd())) return;

  const { recall, reason } = shouldRecall(input.prompt);
  if (!recall) { log(`skip gate=${reason}`); return; }

  const ctx = runRecall({
    trigger: "prompt",
    sessionId: input.session_id,
    cwd: input.cwd,
    query: input.prompt ?? "",
    gate: reason,
  }, log);
  if (ctx) emitAdditionalContext("UserPromptSubmit", ctx);
}

main().catch((e) => { log(`fatal: ${e?.message ?? e}`); process.exit(0); });
