/**
 * Public API for the notifications framework.
 *
 * Two production code paths use this module:
 *   1. The hook entry point (e.g. src/hooks/session-notifications.ts) calls
 *      drainSessionStart() once per session start.
 *   2. Any code path can call enqueueNotification() at any time to push
 *      a notification onto the persistent queue, drained at the next session.
 *
 * Rule registration (registerRule) currently happens at module-load time
 * inside drainSessionStart's caller — see hooks/session-notifications.ts.
 * Rules are pure (no IO) so a cold registry-evaluation has zero side effects
 * if no rule fires.
 */

import type { Credentials } from "../commands/auth-creds.js";
import type { Agent, Notification, NotificationContext } from "./types.js";
import type { LocalManifestEntry } from "../skillify/local-manifest.js";
import { evaluateRules } from "./rules/registry.js";
import { readQueue, writeQueue } from "./queue.js";
import { readState, writeState, alreadyShown, markShown, tryClaim, releaseClaim } from "./state.js";
import { emit } from "./delivery/index.js";
import { fetchBackendNotifications } from "./sources/backend.js";
import { pickPrimaryBanner } from "./sources/primary-banner.js";
import { pickLowBalanceNotice } from "./sources/low-balance.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("notifications", msg);

export type { Notification, Rule, Trigger, Severity, NotificationContext, NotificationsState, NotificationsQueue, Agent } from "./types.js";
export { registerRule, listRules, _resetRulesForTest } from "./rules/registry.js";
export { enqueueNotification } from "./queue.js";

/**
 * Rank order for the rendered block: anything the user must act on outranks
 * anything informational. Without this, a "credits exhausted — top up" line
 * rendered UNDER the welcome banner and the referral nudge, which is exactly
 * where a user stops reading (reported 2026-08-12 in #platform: "I didn't
 * receive an unprompted CTA to top up at any time").
 *
 * Stable within a severity: `sort` is stable in Node, so the source order
 * above (primary banner → low balance → rules → queue → backend) still
 * decides ties.
 */
const SEVERITY_RANK: Record<string, number> = { error: 0, warn: 1, info: 2 };

function sortBySeverity(items: Notification[]): Notification[] {
  return [...items].sort(
    (a, b) => (SEVERITY_RANK[a.severity ?? "info"] ?? 2) - (SEVERITY_RANK[b.severity ?? "info"] ?? 2),
  );
}

export interface DrainOptions {
  agent: Agent;
  creds: Credentials | null;
  /** Claude Code session_id from the hook stdin. Used as the dedupKey
   *  basis for the per-session savings recap so the same session's two
   *  parallel hook invocations dedupe to one emission. */
  sessionId?: string;
  /** SessionStart source ("startup" | "resume" | "clear" | "compact"). The
   *  primary banner is suppressed on "resume" — you already have the thread. */
  source?: string;
  /**
   * Optional, populated by the hook entry point so rules don't have to
   * read the local-mined manifest themselves (rules contract: no IO).
   */
  localSkillsCount?: number | null;
  /**
   * Most recent insight-bearing manifest entry; powers the concrete-insight
   * branch of localMinedRule. Populated by the hook entry point so rules
   * stay IO-free.
   */
  latestInsightEntry?: LocalManifestEntry | null;
  /**
   * Current session count (1-based) for cadence rules. Populated by the hook
   * entry point via bumpSessionCount so rules stay IO-free.
   */
  sessionCount?: number;
  /**
   * Pre-read embeddings status — populated by the hook entry point so rules
   * stay IO-free. When absent, treated as "enabled" (no nudge fired).
   */
  embeddingsStatus?: import("../embeddings/disable.js").EmbeddingsStatus;
  /**
   * Delivery override. When set, the claimed notifications are handed to
   * this function instead of the per-agent adapter in delivery/index.ts.
   *
   * Needed by harnesses whose SessionStart hook already writes its own JSON
   * object to stdout — Codex tolerates exactly one, so the hook collects the
   * notifications here and merges them into that object rather than letting
   * an adapter write a second. See src/hooks/codex/session-start.ts.
   */
  deliver?: (notifications: Notification[]) => void;
}

/**
 * Evaluate all session_start rules + drain the queue, dedup, render, deliver,
 * and persist updated state.
 *
 * Concurrency note: the SessionStart hook is registered in BOTH
 * ~/.claude/settings.json and the marketplace hooks.json, so two node
 * processes can race this function. State dedup (`alreadyShown`) protects
 * against duplicate emission ONLY if one process completes its write
 * before the other reads — not guaranteed. We additionally call
 * `tryClaim()` per notification: an atomic O_CREAT|O_EXCL on a claim file
 * for each (id, dedupKey) pair. First process wins, second skips.
 *
 * Failures are caught and logged — never thrown. A broken notifications
 * pipeline must not abort the SessionStart hook process (the existing
 * memory/hivemind block emit must still happen from the sibling hook).
 */
export async function drainSessionStart(opts: DrainOptions): Promise<void> {
  try {
    const state = readState();
    const queue = readQueue();
    const ctx: NotificationContext = {
      agent: opts.agent,
      creds: opts.creds,
      state,
      localSkillsCount: opts.localSkillsCount ?? null,
      latestInsightEntry: opts.latestInsightEntry ?? null,
      sessionCount: opts.sessionCount,
      embeddingsStatus: opts.embeddingsStatus,
    };

    const fromRules = evaluateRules("session_start", ctx);
    const fromQueue = queue.queue;
    // Two parallel fetches with independent 1.5s timeouts so session-start
    // latency stays bounded by ~1.5s rather than 3s. Both fail-soft.
    //
    // pickPrimaryBanner returns the single banner for the welcome/savings
    // priority slot (org savings > 1M → savings recap; else → welcome).
    // Backend pushes remain additive in this PR — they're rare and not yet
    // under the priority model. A follow-up will collapse all sources
    // (including queue) under the same priority.
    //
    // The low-balance notice runs as its own source, NOT as a rider on the
    // primary banner: a billing warning must not inherit the banner's
    // suppression rules (resume sessions, missing session_id, the 1h stats
    // cache). See sources/low-balance.ts for the full list of gates that
    // used to swallow it.
    const [fromBackend, primary, lowBalance] = await Promise.all([
      fetchBackendNotifications(opts.creds),
      pickPrimaryBanner(opts.sessionId, opts.creds, opts.source),
      pickLowBalanceNotice(opts.creds),
    ]);
    const fromPrimary = primary != null ? [primary] : [];
    const fromLowBalance = lowBalance != null ? [lowBalance] : [];
    // A live balance notice supersedes any queued one with the same id. The
    // queued copy was written when a 402 fired in an earlier session and can
    // name a DIFFERENT org than the one in force now (observed: a notice
    // enqueued under one org rendered after switching to another, linking to
    // the wrong billing page). The live read is scoped to current credentials.
    const liveIds = new Set(fromLowBalance.map(n => n.id));
    const currentOrgId = opts.creds?.orgId ?? null;
    const queueMinusLive = fromQueue.filter(n => {
      if (liveIds.has(n.id)) return false;
      // Org-scoped notices belong to the org that produced them. Without this,
      // switching from a drained org to a funded one still rendered the old
      // org's "credits exhausted", pointing at the wrong billing page — the
      // live-supersedes rule above can't help, because a healthy org produces
      // no live notice to supersede it with.
      const notifOrgId = (n.dedupKey as { orgId?: string | null } | undefined)?.orgId;
      if (notifOrgId != null && notifOrgId !== currentOrgId) return false;
      return true;
    });
    if (queueMinusLive.length !== fromQueue.length) {
      log(`dropped ${fromQueue.length - queueMinusLive.length} queued notice(s): superseded by the live read or belonging to another org`);
    }
    // Primary banner first so the user reads "Welcome back / <brief>" at the
    // top, then everything else (backend pushes, rules) below.
    const all: Notification[] = sortBySeverity([
      ...fromPrimary, ...fromLowBalance, ...fromRules, ...queueMinusLive, ...fromBackend,
    ]);

    const fresh = all.filter(n => !alreadyShown(state, n));
    if (fresh.length === 0) {
      // Still drain queue items that were already shown so they don't pile up.
      if (queue.queue.length > 0) writeQueue({ queue: [] });
      return;
    }

    // Per-notification atomic claim — prevents two concurrent SessionStart
    // hook invocations (settings.json + marketplace hooks.json both fire)
    // from emitting the same notification twice. See state.ts:tryClaim.
    const claimed = fresh.filter(n => tryClaim(n));
    if (claimed.length === 0) {
      if (queue.queue.length > 0) writeQueue({ queue: [] });
      log(`all ${fresh.length} notification(s) claimed by another process`);
      return;
    }

    // Adapter decides per-channel rendering (some notifications go only
    // to user-visible channels). See delivery/claude-code.ts for the
    // model-vs-user split that closes the codex prompt-injection P1.
    if (opts.deliver) opts.deliver(claimed);
    else emit(opts.agent, claimed);

    // Persist state for non-transient notifications. Transient ones (see
    // Notification.transient docstring) are self-clearing — their enqueue
    // is the rate limit, so recording them in state.shown would block the
    // next session's refire. We also release their claim file so the next
    // session's tryClaim() succeeds (the claim file is the OTHER cross-
    // session blocker, separate from state.shown).
    let nextState = state;
    for (const n of claimed) {
      if (n.transient) releaseClaim(n);
      else nextState = markShown(nextState, n);
    }
    writeState(nextState);

    // Queue is fully drained whether or not its items were dedup-skipped:
    // they've been read once. If a producer needs to re-enqueue, it re-pushes.
    if (queue.queue.length > 0) writeQueue({ queue: [] });

    log(`delivered ${claimed.length} notification(s) to ${opts.agent}`);
  } catch (e: any) {
    log(`drainSessionStart failed: ${e?.message ?? String(e)}`);
  }
}
