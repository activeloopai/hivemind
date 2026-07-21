#!/usr/bin/env node

/**
 * Proactive Recall — Claude Code UserPromptSubmit hook.
 *
 * On a *recall-worthy* prompt (cheap gate first — NOT every prompt), search the
 * team's summaries and, if the top hit clears a relevance bar, inject ONE
 * attributed snippet ("recalled from <teammate> · <date>") into the model
 * context. Every recall-worthy invocation is recorded to an always-on
 * `~/.deeplake/recall-events.jsonl` sink (independent of HIVEMIND_DEBUG) so
 * usage / hit-rate is directly measurable.
 *
 * Search mode: SEMANTIC (cosine) ONLY. When embeddings are unavailable (or the
 * query yields no vector), recall is SKIPPED — there is deliberately no lexical
 * (ILIKE) fallback, which forced unindexed full-table scans on the backend
 * (seconds-long per prompt) for little precision. Better to return nothing.
 *
 * Design guarantees:
 *   - Precision-biased: skip aggressively; never inject below the bar.
 *   - Failure-isolated: any error → emit nothing, never block the prompt.
 *   - Latency-bounded: the whole search path is capped (withDeadline).
 *   - additionalContext on Claude Code is model-only (invisible to the user).
 *
 * Opt-out: this auto-search-and-inject is ENABLED BY DEFAULT. A user turns it
 * off (without affecting session capture or the agent's own reactive recall)
 * via HIVEMIND_PROACTIVE_RECALL_DISABLED=1 (or HIVEMIND_PROACTIVE_RECALL=0).
 * See proactiveRecallDisabled() in shared/recall-gate.ts.
 */

import { readStdin } from "../utils/stdin.js";
import { loadConfig } from "../config.js";
import { resolveDirConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { EmbedClient } from "../embeddings/client.js";
import { embedSummaryWithWarmup } from "../embeddings/embed-summary.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import { ensurePluginNodeModulesLink } from "../embeddings/self-heal.js";
import { isHivemindPluginEnabled } from "../utils/plugin-state.js";
import { log as _log } from "../utils/debug.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  shouldRecall,
  passesThreshold,
  proactiveRecallDisabled,
  parsePositive,
  RECALL_THRESHOLD,
} from "./shared/recall-gate.js";
import { recallTopHit } from "./shared/recall-query.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
import { formatRecallContext, type RecallHit } from "./shared/recall-format.js";
import { withDeadline } from "./shared/with-deadline.js";
import { recordRecallEvent } from "./shared/recall-events.js";

const log = (msg: string) => _log("recall", msg);

const SEMANTIC_ENABLED = process.env.HIVEMIND_SEMANTIC_SEARCH !== "false" && !embeddingsDisabled();
// Hard ceiling on the recall critical path. recall runs SYNCHRONOUSLY on
// UserPromptSubmit — it blocks the turn — so we cap the worst case to a
// predictable budget and degrade to "skip" rather than stall on a slow backend.
// Budget raised 1000->1500 so a one-time cold-daemon warmup (~300ms) + embed
// (~500ms) + query comfortably fit; still well under the 2s recall hook timeout.
const RECALL_BUDGET_MS = parsePositive(process.env.HIVEMIND_RECALL_TIMEOUT_MS, 1500);
// The embed self-timeout is clamped to the budget so EmbedClient.embed() (which
// has no abort hook) can never outlast the overall recall budget, even if a
// user sets HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS higher than the budget.
const EMBED_TIMEOUT_MS = Math.min(parsePositive(process.env.HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS, 500), RECALL_BUDGET_MS);
// Bounded daemon warmup on the recall path. A COLD embed daemon's model loads
// in ~300ms, but EmbedClient.embed() fire-and-forgets on a cold socket and
// returns null immediately — so the FIRST recall-worthy prompt of a session
// silently misses SEMANTIC recall (the model becomes ready just after). The
// budget easily covers a ~300ms spawn, so warm the daemon (bounded) BEFORE
// embedding instead of racing it. Warm sessions pay ~0 (warmup returns as soon
// as the socket already accepts).
const WARMUP_BUDGET_MS = Math.min(parsePositive(process.env.HIVEMIND_RECALL_WARMUP_MS, 700), RECALL_BUDGET_MS);

type FindResult =
  | { kind: "hit"; hit: RecallHit }
  | { kind: "none" }
  | { kind: "error" }
  | { kind: "timeout" };

const TIMED_OUT: FindResult = { kind: "timeout" };

const __bundleDir = dirname(fileURLToPath(import.meta.url));

function resolveDaemonPath(): string {
  return join(__bundleDir, "embeddings", "embed-daemon.js");
}

interface RecallInput {
  session_id?: string;
  prompt?: string;
  cwd?: string;
  hook_event_name?: string;
}

/** Emit the model-context injection (or nothing). Claude Code: model-only. */
function emit(additionalContext: string): void {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
  }));
}

/**
 * Find the top hit: SEMANTIC-ONLY. Embeds the prompt and takes the top cosine
 * hit that clears the threshold. If embeddings are unavailable, the prompt
 * yields no vector, or nothing clears the bar, recall is skipped — there is
 * deliberately no lexical (ILIKE) fallback. Bounded by withDeadline in main.
 */
async function findHit(
  input: RecallInput,
  config: NonNullable<ReturnType<typeof loadConfig>>,
  signal: AbortSignal,
): Promise<FindResult> {
  const prompt = input.prompt ?? "";
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  // Pass the budget's abort signal so a timeout actually CANCELS the in-flight
  // query rather than leaving the socket/retry loop running.
  const q = (sql: string) => api.query(sql, signal) as Promise<Array<Record<string, unknown>>>;
  const opts = {
    // No project filter: summaries are tagged with the cwd BASENAME at capture
    // time, so a basename filter both collides (…/foo/api vs …/bar/api) and —
    // worse — silently drops valid history when the user prompts from a
    // subdirectory (session tagged `repo`, prompt from `repo/src` → `src`).
    // Precision instead comes from the `/summaries/%` row filter + the
    // relevance threshold. Robust project-aware scoping needs a stable project
    // key on summary rows (capture/schema change) — tracked as a follow-up.
    excludePath: input.session_id ? `/summaries/${config.userName}/${input.session_id}.md` : undefined,
    limit: 3,
  };

  // Failure-isolated: catch our own I/O errors and report `error` so the caller
  // (and telemetry) never mislabels a backend failure as a deadline timeout.
  try {
    // SEMANTIC-ONLY: take the top cosine hit that clears the threshold. There is
    // deliberately NO lexical (ILIKE) fallback — an unindexed keyword scan over
    // summary+message is a full-table scan on the backend (seconds per prompt),
    // so if semantic is unavailable or misses we skip rather than fall back.
    let semanticHit: RecallHit | null = null;
    if (SEMANTIC_ENABLED) {
      // Self-heal the shared-deps symlink BEFORE building the EmbedClient.
      // A marketplace auto-upgrade drops a new versioned cache dir without the
      // `node_modules` symlink that `hivemind embeddings install` created.
      // capture.js repairs this too, but recall and capture are independent
      // async UserPromptSubmit hooks — recall can run first, so without this
      // the first prompt after an upgrade would silently skip recall entirely
      // (there is no lexical fallback) even though embeddings are installed.
      // Best-effort: a failure here just means we skip semantic recall.
      try { ensurePluginNodeModulesLink({ bundleDir: __bundleDir }); } catch { /* best-effort */ }
      // Warm the daemon (spawn + wait for socket, bounded) THEN embed with one
      // retry, so a cold first prompt doesn't lose semantic recall to the
      // fire-and-forget spawn OR to the daemon's post-spawn recycle race (the
      // retry covers the case where the daemon became ready only after attempt
      // 1 connected). Mirrors the finalize path. Warm sessions pay ~0.
      const client = new EmbedClient({
        daemonEntry: resolveDaemonPath(),
        timeoutMs: EMBED_TIMEOUT_MS,
        spawnWaitMs: WARMUP_BUDGET_MS,
      });
      const vec = await embedSummaryWithWarmup(prompt, "query", { client, log });
      if (vec) {
        semanticHit = await recallTopHit(q, config.tableName, vec, opts);
        if (semanticHit && passesThreshold(semanticHit.score)) return { kind: "hit", hit: semanticHit };
      }
    }

    // Nothing cleared the bar. Surface the below-threshold semantic hit (so
    // telemetry records 'below') if we had one; otherwise nothing matched.
    return semanticHit ? { kind: "hit", hit: semanticHit } : { kind: "none" };
  } catch (e) {
    // Includes the AbortError when the budget cancels us mid-flight; the
    // wrapper has already settled to TIMED_OUT in that case, so this result is
    // ignored. A genuine fast failure is reported as `error`.
    log(`search error: ${(e as Error)?.message ?? e}`);
    return { kind: "error" };
  }
}

/** Relevance gate: cosine threshold for the (semantic-only) hit. */
function hitPasses(hit: RecallHit): boolean {
  return passesThreshold(hit.score);
}

async function main(): Promise<void> {
  if (proactiveRecallDisabled()) return; // on by default; opt out: HIVEMIND_PROACTIVE_RECALL_DISABLED=1
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  if (!isHivemindPluginEnabled()) return;
  // Honor HIVEMIND_CAPTURE_ONLY_CLI: when set, SessionStart/Capture/SessionEnd
  // all skip non-interactive entrypoints (sdk-py/sdk-ts/sdk-cli). Recall must
  // too — otherwise it would inject hidden context into Agent SDK / `claude -p`
  // runs the user explicitly scoped to CLI-only, perturbing scripted output.
  if (!entrypointPassesOnlyCliGate()) return;

  const input = await readStdin<RecallInput>();

  // Layer 0/1 gate — the whole point: don't search on every prompt.
  const { recall, reason } = shouldRecall(input.prompt);
  if (!recall) { log(`skip gate=${reason}`); return; }

  const session = input.session_id;
  const baseConfig = loadConfig();
  if (!baseConfig?.token) {
    log("skip no-config");
    recordRecallEvent({ event: "no-config", gate: reason, session });
    return;
  }
  // Route recall by the nearest `.hivemind`, like capture and memory search:
  // a routed directory must recall from ITS workspace, not the global one.
  const config = resolveDirConfig(baseConfig, input.cwd ?? process.cwd()).config;

  // Bound the whole search path so the turn never stalls beyond the budget.
  // On timeout we ABORT the controller so the in-flight query is cancelled
  // (not just abandoned) and the hook process can exit promptly.
  const controller = new AbortController();
  const res = await withDeadline(findHit(input, config, controller.signal), RECALL_BUDGET_MS, TIMED_OUT);
  if (res.kind === "timeout") {
    controller.abort();
    log(`skip timeout budget=${RECALL_BUDGET_MS}ms`);
    recordRecallEvent({ event: "timeout", gate: reason, session });
    return;
  }
  if (res.kind === "error") {
    log(`skip search-error gate=${reason}`);
    recordRecallEvent({ event: "error", gate: reason, session });
    return;
  }
  if (res.kind === "none") {
    log(`searched gate=${reason} hit=none`);
    recordRecallEvent({ event: "none", gate: reason, session });
    return;
  }

  const hit = res.hit;
  const teammate = hit.author !== config.userName;
  const bar = `thr=${RECALL_THRESHOLD}`;
  if (!hitPasses(hit)) {
    log(`searched mode=${hit.mode} hit=below score=${hit.score} ${bar} author=${hit.author}`);
    recordRecallEvent({ event: "below", gate: reason, mode: hit.mode, score: hit.score, author: hit.author, teammate, project: hit.project, session });
    return;
  }

  const additionalContext = formatRecallContext({ hit, currentUser: config.userName, memoryRoot: config.memoryPath, now: Date.now() });
  if (!additionalContext) {
    log(`searched mode=${hit.mode} hit=unattributable score=${hit.score}`);
    recordRecallEvent({ event: "unattributable", mode: hit.mode, score: hit.score, session });
    return;
  }

  // Structured recall event — debug log (opt-in) + always-on JSONL sink.
  log(`injected mode=${hit.mode} score=${hit.score} author=${hit.author} teammate=${teammate} project=${hit.project}`);
  recordRecallEvent({ event: "injected", gate: reason, mode: hit.mode, score: hit.score, author: hit.author, teammate, project: hit.project, session });
  emit(additionalContext);
}

main().catch((e) => { log(`fatal: ${e?.message ?? e}`); process.exit(0); });
