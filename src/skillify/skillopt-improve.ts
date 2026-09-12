/**
 * #4 (redesigned) — the TARGETED core: judge ONE skill against the user's reaction
 * and improve it immediately if it failed. No anchor, no counter, no org-wide sweep.
 *
 * Flow: an org skill X was invoked → the user reacted → judge X's window (the LLM is
 * the only evaluator now — a regex can't catch "you fucked up again") with the
 * just-submitted reaction appended (it lags Deeplake, so it's passed in straight from
 * the hook). If the judge says the task FAILED, read X's current body, propose a
 * bounded edit, and publish v+1 — right then. The meta-dedup stops re-publishing the
 * same edit when the next reaction re-judges the same window.
 *
 * Everything is injected (query, judge/proposer models, meta) so this is unit-tested
 * with no Deeplake / LLM.
 */
import { sqlStr, sqlIdent } from "../utils/sql.js";
import {
  parseMessage, invokedSkillRef, splitOrgSkill, windowAroundInvocation,
  type QueryFn, type SkillInvocation,
} from "./skill-invocations.js";
import { judgeSuccess } from "./success-judge.js";
import { proposeSkillEdit } from "./skill-proposer.js";
import { readCurrentSkillRow, publishImprovedSkill } from "./skill-org-publish.js";
import type { ModelCall } from "./agent-model.js";
import type { Edit } from "./skill-edits.js";

function likeEscape(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

/**
 * Find the invocation of `name--author` to judge. When `toolUseId` is given (the exact
 * call that opened the pending window, captured at PreToolUse), match THAT invocation —
 * so a quick re-invocation of the same skill before the worker queries can't make us
 * judge the wrong window. Falls back to the latest matching invocation (e.g. the pinned
 * one isn't captured yet). null if the skill isn't in the session at all.
 */
export async function findInvocation(
  query: QueryFn, sessionsTable: string, sessionId: string, name: string, author: string, toolUseId?: string,
): Promise<SkillInvocation | null> {
  const sid = sqlStr(likeEscape(sessionId));
  const rows = await query(
    `SELECT message FROM "${sqlIdent(sessionsTable)}" WHERE path LIKE '/sessions/%${sid}%' ESCAPE '\\' ORDER BY creation_date ASC`,
  );
  let latest: SkillInvocation | null = null;
  let pinned: SkillInvocation | null = null;
  for (const r of rows) {
    const m = parseMessage(r.message);
    if (!m) continue;
    if (typeof m.session_id === "string" && m.session_id !== sessionId) continue;
    const ref = invokedSkillRef(m);
    if (!ref) continue;
    const p = splitOrgSkill(ref);
    if (!p || p.name !== name || p.author !== author) continue;
    const inv: SkillInvocation = { sessionId, name, author, ts: typeof m.timestamp === "string" ? m.timestamp : "" };
    latest = inv; // keep last → latest
    if (toolUseId && m.tool_use_id === toolUseId) pinned = inv; // the exact arming invocation
  }
  return pinned ?? latest;
}

export interface ImproveResult {
  judged: boolean;   // did we locate the invocation and run the judge?
  failed: boolean;   // judge verdict: task failed (success === 0)
  improved: boolean; // a new version was published
  version?: number;
  reason: string;
}

export interface ImproveOpts {
  query: QueryFn;
  sessionsTable: string;
  skillsTable: string;
  workspaceId: string;
  sessionId: string;
  skillRef: string;  // "name--author"
  toolUseId?: string; // the exact invocation that opened the window (pins the judged window)
  reaction: string;  // the user's just-submitted prompt (the reaction)
  judge: ModelCall;
  proposerModel: ModelCall;
  collaborator?: string;
  now: string;
  prior?: (name: string, author: string) => string[];
  alreadyProposed?: (name: string, author: string, edits: Edit[]) => boolean;
  recordEdit?: (name: string, author: string, edits: Edit[]) => void;
  /**
   * Called after the judge runs to close the meta-learning loop. When the judge
   * says the task PASSED (`"applied"`), the most recently proposed edit for this
   * skill gets credit. When the task FAILED again and we cannot publish a new
   * improvement (`"reverted"`), the prior edit is marked as not having helped.
   * Best-effort — a failure here must not affect the improvement result.
   */
  resolveEdit?: (name: string, author: string, status: "applied" | "reverted") => void;
  // Deeplake insert→read lag tolerance: the invocation row is written by a SEPARATE process
  // (capture.js) and lands in Deeplake on a short visibility lag (expected, not a defect), so a
  // worker firing on a fast reaction can read stale. Poll findInvocation with linear backoff
  // before giving up. Injectable for tests.
  invocationRetries?: number;            // extra attempts after the first (default 5)
  invocationBackoffMs?: number;          // linear backoff base ms: sleep = base * attempt (default 3000)
  sleep?: (ms: number) => Promise<void>; // default real timer
}

const DEFAULT_INVOCATION_RETRIES = 5;
const DEFAULT_INVOCATION_BACKOFF_MS = 3000;
const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * findInvocation, tolerant of Deeplake's insert→read visibility lag (expected latency, not a
 * defect). The window's skill-invocation row is captured by a SEPARATE process and may not be queryable the instant the
 * worker fires on a fast reaction. The row is near-certain to land (capture is a reliable path), so
 * poll with linear backoff; but it's NOT guaranteed (capture may be disabled/errored), so the
 * attempts are BOUNDED — on exhaustion we return null and the caller gives up gracefully (no
 * publish) instead of spinning. Runs inside the already-detached worker, so the waits block nothing.
 * Only a not-found (null) result is retried — a query ERROR (e.g. 402) propagates immediately.
 */
async function findInvocationWithRetry(opts: ImproveOpts, name: string, author: string): Promise<SkillInvocation | null> {
  const retries = opts.invocationRetries ?? DEFAULT_INVOCATION_RETRIES;
  const backoffMs = opts.invocationBackoffMs ?? DEFAULT_INVOCATION_BACKOFF_MS;
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    const inv = await findInvocation(opts.query, opts.sessionsTable, opts.sessionId, name, author, opts.toolUseId);
    if (inv) return inv;
    if (attempt >= retries) return null;
    await sleep(backoffMs * (attempt + 1));
  }
}

export async function improveSkillIfFailed(opts: ImproveOpts): Promise<ImproveResult> {
  const none = (reason: string): ImproveResult => ({ judged: false, failed: false, improved: false, reason });
  const parts = splitOrgSkill(opts.skillRef);
  if (!parts) return none("not an org skill");

  const inv = await findInvocationWithRetry(opts, parts.name, parts.author);
  if (!inv) return none("invocation not found in session");

  let window = await windowAroundInvocation(opts.query, opts.sessionsTable, inv);
  // The reaction is the freshest turn (lags Deeplake), so append it from the hook payload.
  if (opts.reaction?.trim()) window += `\n\nUSER: ${opts.reaction.trim()}`;

  const verdict = await judgeSuccess(window, { model: opts.judge });
  if (verdict.success !== 0) {
    // Task passed — the skill (at its current published version) worked. Mark the
    // most recently proposed edit for this skill as applied. Best-effort.
    try { opts.resolveEdit?.(parts.name, parts.author, "applied"); } catch { /* meta is best-effort */ }
    return { judged: true, failed: false, improved: false, reason: verdict.reason };
  }

  // Failed → improve the specific skill, right now.
  const current = await readCurrentSkillRow(opts.query, opts.skillsTable, parts.name, parts.author);
  if (!current) {
    // Can't improve — mark the prior edit as reverted (the skill failed and we can do nothing).
    try { opts.resolveEdit?.(parts.name, parts.author, "reverted"); } catch { /* meta is best-effort */ }
    return { judged: true, failed: true, improved: false, reason: "skill not in org table" };
  }

  const priorEdits = opts.prior?.(parts.name, parts.author) ?? [];
  const p = await proposeSkillEdit(current.body, [verdict.reason], { model: opts.proposerModel, priorEdits });
  if (!p.changed) {
    // Proposer made no change — the prior edit didn't help enough to suggest anything new.
    try { opts.resolveEdit?.(parts.name, parts.author, "reverted"); } catch { /* meta is best-effort */ }
    return { judged: true, failed: true, improved: false, reason: "proposer made no change" };
  }
  if (opts.alreadyProposed?.(parts.name, parts.author, p.edits)) {
    // Dedup blocked — the prior edit was already tried and is still failing.
    try { opts.resolveEdit?.(parts.name, parts.author, "reverted"); } catch { /* meta is best-effort */ }
    return { judged: true, failed: true, improved: false, reason: "edit already proposed (dedup)" };
  }

  const { version } = await publishImprovedSkill({
    query: opts.query, tableName: opts.skillsTable, workspaceId: opts.workspaceId,
    current, newBody: p.editedBody, collaborator: opts.collaborator, now: opts.now,
  });
  // The publish already landed — a meta-write failure must NOT report failure (that would
  // drop the dedup marker AND make the run look failed, inviting a re-publish). Swallow it.
  try { opts.recordEdit?.(parts.name, parts.author, p.edits); } catch { /* meta is best-effort */ }
  return { judged: true, failed: true, improved: true, version, reason: verdict.reason };
}
