/**
 * Primary session-start banner — picks ONE notification to show, based on
 * priority. The session-start surface is a push channel with room for a
 * single message; this function decides which one.
 *
 * Priority (this PR):
 *
 *   1. Savings recap        — when org-wide tokens saved > 1M
 *   2. Welcome              — default for any logged-in user
 *
 * (Future) A higher-priority "team minted skill X" backend push will sit
 * above the savings recap. Backend pushes today still fire from
 * sources/backend.ts independently — that wiring will collapse under this
 * priority model in a follow-up PR.
 *
 * Savings formula (same as the prior local-usage source):
 *
 *   Y = memorySearchBytes / 4               tokens (what hivemind delivered)
 *   X = 1.7 · Y                             tokens (counterfactual w/o hivemind)
 *   Z = X − Y = 0.7 · Y                     tokens saved
 *
 * The 1.7× multiplier is the published LoCoMo benchmark ratio
 * (deeplake.ai/hivemind, Claude Haiku via `claude -p`, hybrid retrieval).
 * The 4-bytes/token conversion is the BPE rule-of-thumb; `~` in the
 * rendered headline signals approximation.
 *
 * Both branches dedupKey on `{session: sessionId}` so the two parallel
 * SessionStart hook registrations collapse to one emission per real
 * session via the atomic claim file, while each new session re-fires.
 *
 * Failure mode: any unexpected error returns null — the SessionStart
 * hook continues unaffected.
 */

import type { Credentials } from "../../commands/auth-creds.js";
import type { Notification } from "../types.js";
import { fetchOrgStats, type OrgStats } from "./org-stats.js";
import { fetchOpenGoals, formatOpenGoalsLine, type OpenGoalsSummary } from "./open-goals.js";
import { pickColdStartBrief } from "./cold-start-brief.js";
import { pickResumeBrief } from "./resume-brief.js";
import { countUserGeneratedSkills, readUsageRecords, sumMetric } from "../usage-tracker.js";
import { loadConfig } from "../../config.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("notifications-primary-banner", msg);

/** Industry rule-of-thumb conversion for BPE tokenizers (Claude/GPT). */
const BYTES_PER_TOKEN = 4;

/** Published LoCoMo benchmark ratio: claude -p with hivemind uses 1/1.7 of
 *  the tokens vs without hivemind on the same QA task. We use this ratio
 *  to estimate the "would-have-spent" tokens for context hivemind delivered. */
const SAVINGS_MULTIPLIER = 1.7;

/** Tokens-saved threshold above which the savings recap replaces the
 *  welcome banner. Lowered from 1M to 1k so early-adopter teams see the
 *  savings recap from their first day of usage instead of staring at the
 *  generic welcome until their cumulative org bytes cross the 7-figure
 *  mark — for a team with a handful of recalls/day, that took weeks. */
const MEANINGFUL_SAVINGS_TOKENS = 1_000;

/** Skip the "you contributed ~X" segment when the user's own
 *  contribution is below this many bytes — keeps the banner from reading
 *  "you contributed ~0 saved" for org members who haven't used hivemind
 *  themselves yet. 4_000 bytes ≈ 1k tokens with the BPE rule-of-thumb. */
const MIN_USER_BYTES_FOR_CONTRIBUTION_LINE = 4_000;

/** 1234 → "1.2k", 12345 → "12.3k", 1234567 → "1.2M". Caller prepends `~`. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 100000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}

/** Plain integer commafier: 42000 → "42,000". Used in the body line. */
function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function bytesToSavedTokens(bytes: number): number {
  const y = bytes / BYTES_PER_TOKEN;
  return (SAVINGS_MULTIPLIER - 1) * y;
}

/** Sum local jsonl records into the same bytes-saved-tokens shape as
 *  org-stats — used when the server is unreachable so the threshold gate
 *  still works in offline mode. Returns 0 on any read/parse failure. */
function localSavedTokens(): number {
  try {
    const records = readUsageRecords();
    if (records.length === 0) return 0;
    const bytes = sumMetric(records, "memorySearchBytes");
    return bytesToSavedTokens(bytes);
  } catch (e: unknown) {
    log(`localSavedTokens threw: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/**
 * Decide and render the one session-start banner. Returns null when there
 * is nothing meaningful to show (no creds, no sessionId, or unexpected
 * error). The drainer combines this with other notification streams
 * (backend pushes, queue items) — those remain additive in this PR.
 */
export async function pickPrimaryBanner(
  sessionId: string | undefined,
  creds: Credentials | null | undefined,
  source?: string,
): Promise<Notification | null> {
  if (!sessionId) {
    // Without a per-session dedupKey, the two parallel hook fires can't
    // collapse to one — better to render nothing than to double-fire.
    return null;
  }
  // On a resume, the user already has the thread in front of them — the
  // welcome/"where you left off" banner is pure noise. Only a genuine fresh
  // startup gets the banner. (Unknown/absent source → treat as startup so we
  // don't regress older Claude Code versions that don't send it.)
  if (source === "resume") {
    return null;
  }
  if (!creds?.token) {
    // Anonymous — no welcome/savings, but THIS is the install→sign-in
    // conversion slot. The cold-start brief mines local history for one
    // recognized insight and pitches sign-in as the way to keep it. It
    // re-nudges itself (24h cap, see cold-start-brief) until they convert;
    // once signed in, the welcome/savings + resume path below takes over.
    // userVisibleOnly: the mined prose must not reach the model's context
    // (prompt-injection guard, same as localMinedRule).
    const cold = await pickColdStartBrief(creds);
    if (!cold?.brief) return null;
    return {
      id: "signup-brief",
      severity: "info",
      title: "Hey 👋 I'm Hivemind",
      body: `${cold.brief}\n\n→ hivemind login`,
      dedupKey: { session: sessionId },
      userVisibleOnly: true,
    };
  }

  const orgStats = await fetchOrgStats(creds ?? null);
  const tokensSaved = orgStats != null
    ? bytesToSavedTokens(orgStats.org.memorySearchBytes)
    : localSavedTokens();

  // Open-goals summary runs in parallel — best-effort, never blocks
  // the banner. A network/auth failure returns null and the banner
  // renders as before. The goals table name comes from config so the
  // staging override (HIVEMIND_GOALS_TABLE=hivemind_goals_test) works
  // automatically.
  let openGoals: OpenGoalsSummary | null = null;
  try {
    const cfg = loadConfig();
    if (cfg?.goalsTableName) {
      openGoals = await fetchOpenGoals(creds, cfg.goalsTableName);
    }
  } catch (e: unknown) {
    log(`open-goals lookup failed: ${(e as Error).message}`);
  }

  // Session brief — onboarding vs continuity, both gated on sign-in
  // (this whole function returns early when !creds.token above):
  //   • first signed-in session → cold-start brief: one recognized
  //     insight from local history + the promise that future sessions
  //     resume. Greeting flips to "Hey <name>".
  //   • every later session      → resume brief: "where you left off"
  //     from captured summaries — the payoff that promise owes.
  // pickColdStartBrief writes its first-run state, so exactly one of the
  // two fires per session and they never both show.
  let prefix: string | null = null;
  let firstRun = false;
  try {
    const cold = await pickColdStartBrief(creds);
    if (cold) {
      prefix = cold.brief;
      firstRun = cold.firstRun;
    } else {
      prefix = (await pickResumeBrief(creds, sessionId))?.brief ?? null;
    }
  } catch (e: unknown) {
    log(`session brief threw: ${(e as Error).message}`);
  }

  const balanceCents = orgStats?.balanceCents ?? null;
  if (tokensSaved > MEANINGFUL_SAVINGS_TOKENS) {
    const banner = orgStats != null
      ? renderOnlineSavings(sessionId, orgStats, creds.userName, openGoals, prefix)
      : renderOfflineSavings(sessionId, creds.userName, openGoals, prefix);
    return appendBalance(banner, balanceCents, creds);
  }
  const welcome = renderWelcome(sessionId, creds, openGoals, firstRun, prefix);
  return appendBalance(welcome, balanceCents, creds);
}

/**
 * Assemble a banner body in reading order: the lead line (org connection or
 * savings recap) first, then the resume/cold-start brief, then the open-goals
 * block. Sections are blank-line separated; the brief and goals each carry
 * their own 📌. The brief already includes its 📌 header (resume) or is plain
 * prose (cold-start), so only goals get the 📌 prefix here. Empty sections are
 * dropped so a banner with nothing to resume / no open goals reads as just the
 * lead line.
 */
function composeBody(
  lead: string,
  brief: string | null,
  openGoals: OpenGoalsSummary | null,
): string {
  const parts: string[] = [lead];
  if (brief) parts.push(brief);
  const goals = formatOpenGoalsLine(openGoals);
  if (goals) parts.push(`📌 ${goals}`);
  // Strip trailing newlines per section so the blank-line separator is the
  // join's `\n\n` alone. The resume brief ends each session block with a
  // trailing `\n`, which would otherwise stack with the join to render two
  // blank lines between the brief and the goals.
  return parts.map(p => p.replace(/\n+$/, "")).join("\n\n");
}

/** Below this prepaid balance (cents) we warn the user. Mirrors the SDK's
 *  LOW_BALANCE_THRESHOLD_CENTS — kept here so the live SessionStart check
 *  and the legacy query-path check agree on the boundary. */
const LOW_BALANCE_THRESHOLD_CENTS = 200;

/** Org-scoped billing page, falling back to the bare host when creds lack
 *  the org/workspace names. Mirrors deeplake-api.ts billingUrl(). */
function billingUrl(creds: Credentials): string {
  if (creds.orgName && creds.workspaceId) {
    return `https://deeplake.ai/${encodeURIComponent(creds.orgName)}/workspace/${encodeURIComponent(creds.workspaceId)}/billing`;
  }
  return "https://deeplake.ai";
}

/**
 * Merge a live low-balance notice into the banner body, detected THIS
 * SessionStart from the `X-Activeloop-Balance-Cents` header (see org-stats).
 * Replaces the lagging, separately-queued low-balance notice so the warning
 * shows the moment we see it, in the same banner the user is already reading.
 *
 * Scope: the soft warning only (0 < balance < threshold). Hard exhaustion
 * (balance ≤ 0) stays on the 402-driven `balance-exhausted` queue path in
 * deeplake-api — surfacing it here too would double up. No-op when balance
 * is unknown or healthy. The banner is userVisibleOnly, so this never
 * reaches the model.
 */
function appendBalance(n: Notification, balanceCents: number | null, creds: Credentials): Notification {
  if (balanceCents === null || balanceCents <= 0 || balanceCents >= LOW_BALANCE_THRESHOLD_CENTS) return n;
  const line = `⚠️ Hivemind balance low — only $${(balanceCents / 100).toFixed(2)} of prepaid credit left. `
    + `Top up at ${billingUrl(creds)} before requests start failing.`;
  return { ...n, body: `${n.body}\n\n${line}` };
}

/** "🐝 Welcome back, kamo.aghbalyan / Connected to org mind (workspace default)."
 *  Same content as the prior welcome rule (src/notifications/rules/welcome.ts);
 *  the dedupKey is the only behavior change — session-scoped, refires every
 *  session, rather than savedAt-scoped (which dedup'd until next login). */
function renderWelcome(
  sessionId: string,
  creds: Credentials,
  openGoals: OpenGoalsSummary | null,
  firstEver = false,
  brief: string | null = null,
): Notification {
  // Personalization is optional. If creds.userName is missing (malformed
  // credentials.json — rare), drop the comma-clause rather than fall back
  // to a generic "there" that reads awkwardly. If creds.orgName is missing,
  // say "your organization" rather than expose the orgId UUID — UUIDs are
  // unreadable to humans and worse UX than no label at all.
  //
  // Greeting depends on whether this is the first time Hivemind has ever
  // surfaced a brief for this user: "Hey <name>" on first contact (an
  // introduction — "welcome back" would be a lie), "Welcome back" after.
  const greeting = firstEver ? "Hey" : "Welcome back";
  const title = creds.userName
    ? `${greeting}, ${creds.userName}`
    : greeting;
  const orgPhrase = creds.orgName ? `org ${creds.orgName}` : "your organization";
  const workspace = creds.workspaceId ?? "default";
  return {
    id: "welcome",
    severity: "info",
    title,
    body: composeBody(`Connected to ${orgPhrase} (workspace ${workspace}).`, brief, openGoals),
    dedupKey: { session: sessionId },
    // User-facing only. This banner (welcome / savings / any prepended
    // cold-start or resume brief) carries mined and summary-derived prose,
    // which must never enter the model's additionalContext — that would be
    // a prompt-injection channel (codex P1). The model gets its memory
    // instructions from the sibling session-start hook; this slot is purely
    // for the human reading their terminal.
    userVisibleOnly: true,
  };
}

/** "🐝 Hivemind has saved your team ~5.2M tokens
 *      42,000 memory recalls · across 187 sessions · you contributed ~140k" */
function renderOnlineSavings(
  sessionId: string,
  s: OrgStats,
  userName: string | undefined,
  openGoals: OpenGoalsSummary | null,
  brief: string | null = null,
): Notification {
  const zOrg = bytesToSavedTokens(s.org.memorySearchBytes);
  const zUser = bytesToSavedTokens(s.user.memorySearchBytes);

  const title = `Hivemind has saved your team ~${formatTokens(zOrg)} tokens`;
  const segments = [
    `${formatCount(s.org.memoryRecallCount)} memory ${s.org.memoryRecallCount === 1 ? "recall" : "recalls"}`,
    `across ${formatCount(s.org.sessionsCount)} ${s.org.sessionsCount === 1 ? "session" : "sessions"}`,
  ];
  // Drop "you contributed" when the user's contribution is below ~1k
  // tokens — saves the org member who hasn't used hivemind themselves
  // from reading "you contributed ~0 saved" alongside the team total.
  if (s.user.memorySearchBytes >= MIN_USER_BYTES_FOR_CONTRIBUTION_LINE) {
    segments.push(`you contributed ~${formatTokens(zUser)}`);
  }
  // Skills the user has generated across all their projects — purely local
  // count. Append when non-zero to keep the cross-machine banner connected
  // to the user's own machine without leaking that this is a hybrid render.
  const skillsGenerated = countUserGeneratedSkills(userName);
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" · ")}`, brief, openGoals);

  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true,
  };
}

/** Offline fallback when org-stats is unreachable but local jsonl shows
 *  more than 1M tokens saved. "Hivemind has saved you ~Xk tokens / N sessions
 *  · M memory searches · K skills generated" */
function renderOfflineSavings(
  sessionId: string,
  userName: string | undefined,
  openGoals: OpenGoalsSummary | null,
  brief: string | null = null,
): Notification {
  const records = readUsageRecords();
  const memorySearchBytes = sumMetric(records, "memorySearchBytes");
  const zTokens = bytesToSavedTokens(memorySearchBytes);
  const sessionCount = records.length;
  const memorySearches = sumMetric(records, "memorySearchCount");
  const skillsGenerated = countUserGeneratedSkills(userName);

  const title = `Hivemind has saved you ~${formatTokens(zTokens)} tokens`;
  const segments = [
    `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
    `${memorySearches} memory ${memorySearches === 1 ? "search" : "searches"}`,
  ];
  if (skillsGenerated > 0) {
    segments.push(`${skillsGenerated} ${skillsGenerated === 1 ? "skill" : "skills"} generated`);
  }
  const body = composeBody(`   ${segments.join(" · ")}`, brief, openGoals);

  return {
    id: "savings-recap",
    severity: "info",
    title,
    body,
    dedupKey: { session: sessionId },
    // User-facing only — see the welcome renderer's note. A resume/cold-start
    // brief rides in this body, so it must not reach the model's
    // additionalContext.
    userVisibleOnly: true,
  };
}
