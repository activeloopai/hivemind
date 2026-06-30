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
 * Search mode: SEMANTIC (cosine) when embeddings are available, else falls back
 * to LEXICAL (ILIKE keyword overlap) — so recall works WITHOUT the embeddings
 * model installed. Each mode has its own precision gate.
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

import { openSync, readSync, closeSync, statSync } from "node:fs";
import { readStdin } from "../utils/stdin.js";
import { loadConfig } from "../config.js";
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
  extractKeywords,
  proactiveRecallDisabled,
  parsePositive,
  RECALL_THRESHOLD,
  MIN_LEXICAL_OVERLAP,
} from "./shared/recall-gate.js";
import { recallTopHit, recallTopHitLexical } from "./shared/recall-query.js";
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
 * Read plain text from the last few user+assistant turns of the current
 * session transcript. Used to enrich the lexical keyword query with context
 * from recent conversation — so a short prompt like "implement refund()" picks
 * up "payments ledger charge" from earlier turns and matches the right summary.
 *
 * Semantic path stays prompt-only (a focused short query embeds better than a
 * noisy context dump). Lexical benefits because it is keyword-overlap based.
 *
 * Reads only the last 32 KB of the file to avoid loading huge transcripts.
 * Pure sync I/O (no await) — best-effort, never throws.
 */
function readRecentTurnsText(sessionId: string | undefined, cwd: string | undefined, maxTurns = 3): string {
  if (!sessionId || !cwd) return "";
  try {
    const home = process.env.HOME ?? "/root";
    const slug = cwd.replace(/[^a-zA-Z0-9]/g, "-");
    const filePath = `${home}/.claude/projects/${slug}/${sessionId}.jsonl`;

    const stat = statSync(filePath);
    const tailBytes = Math.min(stat.size, 32_768);
    const buf = Buffer.alloc(tailBytes);
    const fd = openSync(filePath, "r");
    readSync(fd, buf, 0, tailBytes, stat.size - tailBytes);
    closeSync(fd);

    const lines = buf.toString("utf-8").split("\n").filter(Boolean);
    const texts: string[] = [];
    let turns = 0;
    for (let i = lines.length - 1; i >= 0 && turns < maxTurns; i--) {
      try {
        const obj = JSON.parse(lines[i]) as Record<string, unknown>;
        if (obj["type"] !== "user" && obj["type"] !== "assistant") continue;
        const msg = obj["message"] as Record<string, unknown> | undefined;
        const content = msg?.["content"];
        if (!content) continue;
        if (typeof content === "string" && content.trim()) {
          texts.push(content.trim());
          turns++;
        } else if (Array.isArray(content)) {
          const text = (content as Array<Record<string, unknown>>)
            .filter(b => b["type"] === "text")
            .map(b => (b["text"] as string | undefined) ?? "")
            .filter(Boolean)
            .join(" ");
          if (text) { texts.push(text); turns++; }
        }
      } catch { /* skip malformed lines */ }
    }
    return texts.reverse().join(" ").slice(0, 2000);
  } catch {
    return "";
  }
}

/**
 * Find the top hit: semantic when embeddings yield a vector, else lexical.
 * Also falls back to lexical when semantic finds nothing (e.g. summaries not
 * embedded yet). Bounded by withDeadline in main.
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
    // Hybrid: prefer a semantic hit that clears the threshold; otherwise fall
    // through to lexical (exact keyword/identifier match), the same way the grep
    // path blends both. A below-threshold semantic hit must NOT suppress a good
    // lexical match (stack traces / exact error names).
    let semanticHit: RecallHit | null = null;
    if (SEMANTIC_ENABLED) {
      // Self-heal the shared-deps symlink BEFORE building the EmbedClient.
      // A marketplace auto-upgrade drops a new versioned cache dir without the
      // `node_modules` symlink that `hivemind embeddings install` created.
      // capture.js repairs this too, but recall and capture are independent
      // async UserPromptSubmit hooks — recall can run first, so without this
      // the first prompt after an upgrade would silently lose semantic recall
      // (falling back to lexical/null) even though embeddings are installed.
      // Best-effort: a failure here just means we degrade to lexical.
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

    // Augment the lexical query with keywords from recent turns so a short
    // prompt like "implement refund()" inherits context ("payments", "ledger",
    // "charge") from the session history. Semantic path stays prompt-only.
    const recentContext = readRecentTurnsText(input.session_id, input.cwd);
    const keywords = extractKeywords(prompt + (recentContext ? " " + recentContext : ""));
    if (keywords.length >= 2) {
      const lex = await recallTopHitLexical(q, config.tableName, keywords, opts);
      if (lex && lex.score >= MIN_LEXICAL_OVERLAP) return { kind: "hit", hit: lex };
    }

    // Nothing cleared a bar. Surface the below-threshold semantic hit (so
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

/** Mode-aware relevance gate: cosine threshold for semantic, overlap for lexical. */
function hitPasses(hit: RecallHit): boolean {
  return hit.mode === "semantic"
    ? passesThreshold(hit.score)
    : hit.score >= MIN_LEXICAL_OVERLAP;
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
  const config = loadConfig();
  if (!config?.token) {
    log("skip no-config");
    recordRecallEvent({ event: "no-config", gate: reason, session });
    return;
  }

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
  const bar = hit.mode === "semantic" ? `thr=${RECALL_THRESHOLD}` : `min=${MIN_LEXICAL_OVERLAP}`;
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
