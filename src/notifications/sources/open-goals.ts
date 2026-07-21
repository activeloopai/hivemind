/**
 * Open-goals SessionStart summary.
 *
 * Reads the user's open goals from the dedicated hivemind_goals
 * table via the shared `listOpenGoals` reader (canonical owner-form
 * matching + version=MAX dedup) and produces a short one-line summary
 * the primary banner appends to its body. Sharing that reader keeps
 * the banner and the SessionStart context block in agreement — both
 * count one row per goal_id and never leak another user's goals via a
 * substring collision.
 *
 * Returns null when:
 *   - creds are missing
 *   - the goals table is unreachable (network / auth / missing)
 *   - no open goals match
 *
 * Hard timeout: caller's responsibility — `pickPrimaryBanner` already
 * runs under the SessionStart hook's overall budget. Goal content
 * lives in markdown, so the first line of the body is the
 * human-readable label for the banner.
 */

import type { Credentials } from "../../commands/auth-creds.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { listOpenGoals } from "../../hooks/shared/context-renderer.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("notifications-open-goals", msg);

export interface OpenGoalsSummary {
  /** Total count of open goals owned by current_user. */
  count: number;
  /** Up to 3 short labels in newest-first order — used for the body line. */
  sample: string[];
}

/**
 * Fetch and summarize the current user's open goals. "Open" =
 * status IN ('opened', 'in_progress'). Resolves to `null` on any
 * error or when there is nothing to show.
 */
export async function fetchOpenGoals(
  creds: Credentials,
  goalsTableName: string,
): Promise<OpenGoalsSummary | null> {
  if (!creds.token || !creds.userName || !creds.orgId) return null;
  try {
    const api = new DeeplakeApi(
      creds.token,
      creds.apiUrl ?? "https://api.deeplake.ai",
      creds.orgId,
      creds.workspaceId ?? "default",
      goalsTableName,
    );
    // Pre-flight existence guard (mirrors the SessionStart context block's
    // `tableExists` skip): on a fresh org that never created hivemind_goals,
    // sending the SELECT logs a 42P01 server-side on EVERY SessionStart even
    // though the catch below hides it from the user. knownTablesOrNull returns
    // the trusted table list (skip the read when goals is absent) and null when
    // the lookup couldn't be trusted (fall back to SELECT-then-catch so a
    // transient blip doesn't suppress a table that really exists).
    const known = await api.knownTablesOrNull();
    if (known && !known.includes(goalsTableName)) {
      log(`fetchOpenGoals: table "${goalsTableName}" not present — skipping read`);
      return null;
    }
    // Reuse the canonical goal reader: it matches the owner by exact
    // full form, exact short form, and `short@%` alias (never a
    // `'%user%'` substring scan, which collides — e.g. 'ali' matching
    // 'malice@…') and keeps only the latest version per goal_id, so
    // multiple stored versions of one goal count exactly once.
    const rows = await listOpenGoals(
      sql => api.query(sql) as Promise<Array<Record<string, unknown>>>,
      goalsTableName,
      creds.userName,
      { limit: 25 },
    );
    if (rows.length === 0) return null;

    const goals: Array<{ label: string }> = [];
    for (const r of rows) {
      if (!r.content) continue;
      goals.push({ label: firstLine(r.content) });
    }
    if (goals.length === 0) return null;
    return {
      count: goals.length,
      // Match the resume brief's line width (MAX_LINE_CHARS = 120) so the
      // two 📌 blocks in the SessionStart banner truncate consistently
      // instead of goals cutting off at 60 while "picking up" runs long.
      sample: goals.slice(0, 3).map(g => truncate(g.label, 120)),
    };
  } catch (e: unknown) {
    log(`fetchOpenGoals: ${(e as Error).message}`);
    return null;
  }
}

/**
 * The first non-empty line of a markdown body — used as the goal's
 * banner label. Falls back to the whole content when there are no
 * newlines.
 */
function firstLine(content: string): string {
  for (const ln of content.split(/\r?\n/)) {
    const trimmed = ln.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return content.trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Format the goals summary for the primary banner. The first line is a
 * count header (which the caller prefixes with 📌); each sampled goal
 * then gets its own indented bullet line so a multi-goal banner reads
 * as a list instead of a single ' · '-joined run that the terminal
 * truncates mid-goal. Returns the empty string when there is nothing
 * worth showing.
 */
export function formatOpenGoalsLine(summary: OpenGoalsSummary | null): string {
  if (!summary || summary.count === 0) return "";
  const head = summary.count === 1
    ? "1 goal open:"
    : `${summary.count} goals open:`;
  if (summary.sample.length === 0) return head;
  const bullets = summary.sample.map(g => `   • ${g}`).join("\n");
  return `${head}\n${bullets}`;
}
