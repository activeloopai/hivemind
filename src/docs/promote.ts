/**
 * Merge promotion — when a branch's changes land in main, the overlay it built
 * is REUSED as main's canonical page instead of regenerating it (saving LLM).
 *
 * The safety condition is content-defined: an overlay may be promoted only when
 * its stored source fingerprint equals main's CURRENT source fingerprint for the
 * same files — i.e. the exact bytes the overlay documents are now what main has.
 * (After merging feature A into main with no other change to those files, A's
 * overlay fingerprint == main's fingerprint → promote. If the merge combined A
 * with other edits, the fingerprints differ → no promotion, main regenerates.)
 *
 * Promotion re-stamps the overlay content at scope `main` and archives the now
 * redundant branch overlay. `planPromotions` is a pure decision (testable with a
 * fake git); `promoteMergedOverlays` executes it against the table.
 */

import { sqlIdent, sqlStr } from "../utils/sql.js";
import { stableUnionRows } from "./stable-read.js";
import { upsertDoc, editDoc } from "./write.js";
import { parseFilesIndex, WIKI_DOC_PREFIX } from "./wiki-generate.js";
import { computeFingerprint, parseFingerprint, serializeFingerprint, isFresh } from "./fingerprint.js";
import { MAIN_SCOPE, parseScope, type GitRunner } from "./branch-scope.js";
import type { QueryFn } from "./read.js";

/** Minimal row shape the planner needs. */
export interface PromoteRow {
  doc_id: string;
  path: string;
  content: string;
  tier: string;
  scope: string;
  source_fp: string;
}

export interface Promotion {
  doc_id: string;
  /** The overlay scope being promoted (e.g. `b:feat`). */
  fromScope: string;
  path: string;
  content: string;
  tier: string;
  /** Main's current fingerprint (what the promoted row is stamped with). */
  mainFp: string;
}

/**
 * Decide which branch overlays can be promoted to main. An overlay qualifies iff
 * its `source_fp` equals main's current fingerprint for the page's CURRENT group
 * membership (`groupFiles`, from the live snapshot — NOT the possibly-stale
 * `## Files` index of a stored page). This is what makes promotion safe under a
 * membership change: if the merge added/removed a member, the current
 * fingerprint won't match the overlay's, so it is not promoted and the normal
 * refresh regenerates it. A page whose group no longer exists is skipped. Pure —
 * all git access is the injected runner.
 */
export function planPromotions(
  rows: readonly PromoteRow[],
  git: GitRunner,
  groupFiles: ReadonlyMap<string, string[]>,
): Promotion[] {
  // Group rows per doc_id into { main, overlays }.
  const byDoc = new Map<string, { main?: PromoteRow; overlays: PromoteRow[] }>();
  for (const r of rows) {
    if (!r.doc_id.startsWith(WIKI_DOC_PREFIX)) continue;
    const g = byDoc.get(r.doc_id) ?? { overlays: [] };
    if (parseScope(r.scope).kind === "branch") g.overlays.push(r);
    else g.main = r;
    byDoc.set(r.doc_id, g);
  }

  const out: Promotion[] = [];
  for (const [doc_id, g] of byDoc) {
    if (g.overlays.length === 0) continue;
    const files = groupFiles.get(doc_id);
    if (!files || files.length === 0) continue; // group gone / empty → let refresh handle it
    const mainFp = computeFingerprint(git, files);
    if (Object.keys(mainFp).length === 0) continue; // no git signal → don't promote
    const mainFpStr = serializeFingerprint(mainFp);
    for (const ov of g.overlays) {
      // The overlay must ALSO cover exactly the current membership (its ## Files
      // == the group's files) — else it documents a stale file set.
      if (!sameFileSet(parseFilesIndex(ov.content), files)) continue;
      if (isFresh(parseFingerprint(ov.source_fp), mainFp)) {
        out.push({ doc_id, fromScope: ov.scope, path: ov.path, content: ov.content, tier: ov.tier, mainFp: mainFpStr });
      }
    }
  }
  return out;
}

/** Order-independent equality of two file lists. */
function sameFileSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((f) => s.has(f));
}

export interface PromoteOutcome {
  doc_id: string;
  fromScope: string;
  action: "promoted";
}

/**
 * Execute merge promotions for a project: re-stamp each qualifying overlay as
 * main, then archive the overlay. Runs on the trunk after a merge. Best-effort
 * per page — one failure doesn't abort the rest.
 */
export async function promoteMergedOverlays(
  query: QueryFn,
  tableName: string,
  project: string,
  git: GitRunner,
  groupFiles: ReadonlyMap<string, string[]>,
  opts: { agent?: string; pluginVersion?: string } = {},
): Promise<PromoteOutcome[]> {
  const safe = sqlIdent(tableName);
  const raw = await stableUnionRows(
    query,
    `SELECT id, doc_id, path, content, tier, scope, source_fp FROM "${safe}" ` +
      `WHERE project = '${sqlStr(project)}' AND status = 'active'`,
  );
  const rows: PromoteRow[] = raw.map((r) => ({
    doc_id: String(r.doc_id ?? ""),
    path: String(r.path ?? ""),
    content: String(r.content ?? ""),
    tier: String(r.tier ?? "slow"),
    scope: String(r.scope ?? MAIN_SCOPE),
    source_fp: String(r.source_fp ?? "{}"),
  }));

  const outcomes: PromoteOutcome[] = [];
  for (const p of planPromotions(rows, git, groupFiles)) {
    try {
      await upsertDoc(query, tableName, {
        doc_id: p.doc_id,
        path: p.path,
        content: p.content,
        tier: p.tier === "fast" ? "fast" : "slow",
        project,
        scope: MAIN_SCOPE,
        source_fp: p.mainFp,
        agent: opts.agent ?? "docs-wiki-promote",
        plugin_version: opts.pluginVersion,
      });
      // Archive the now-redundant overlay (its content is main's truth).
      await editDoc(query, tableName, { doc_id: p.doc_id, status: "archived" }, { project, scope: p.fromScope });
      outcomes.push({ doc_id: p.doc_id, fromScope: p.fromScope, action: "promoted" });
    } catch {
      // best-effort — leave this overlay for the next cycle
    }
  }
  return outcomes;
}
