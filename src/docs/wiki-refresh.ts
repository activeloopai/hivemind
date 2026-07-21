/**
 * Wiki refresh orchestrator — the "cron that lives in the code".
 *
 * No CI, no crontab: every dev machine is a potential refresher. The
 * post-commit trigger (and any future session hook) spawns this cycle
 * detached; the cycle itself decides whether anything should happen:
 *
 *   1. GUARDS (cheap, read-only): HEAD == last_refresh_sha → up-to-date;
 *      meta row touched less than `minPeriodMs` ago → too-soon.
 *   2. LEASE: `tryClaimTurn` (TTL 30 min, read-back verified). Losing the
 *      claim is normal — someone else is refreshing; just leave.
 *   3. WORK, O(diff): `git diff last_refresh_sha..HEAD --name-only` picks the
 *      candidate pages; each is patched in place (`updateWikiPage`), escalated
 *      to a full regen when patching is the wrong tool, or generated fresh
 *      when the subsystem is new.
 *   4. COMMIT POINT: `commitRefresh(HEAD)` — the ONLY place the sha advances,
 *      and only when every candidate succeeded. A crashed or partially failed
 *      cycle leaves the sha untouched; the next turn redoes the same window
 *      (every step is idempotent, so redoing converges). A worker that lost
 *      its lease mid-cycle is refused at the commit point.
 *
 * Everything effectful is injected (query, git, LLM run, regenerate), so the
 * whole protocol is unit-testable without a repo or a backend.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitRefresh, readRefreshMeta, releaseClaim, tryClaimTurn } from "./meta.js";
import { gateDocEdit } from "./gate.js";
import { buildUpdatePrompt, updateWikiPage, DEFAULT_WIKI_MAX_CHANGED_LINES, NO_CHANGE } from "./wiki-update.js";
import { parseScope, trunkBranch, currentBranch } from "./branch-scope.js";
import { sourcePushed, workingTreeClean } from "./fingerprint.js";
import { promoteMergedOverlays } from "./promote.js";
import { writePrivateDoc, deletePrivateDoc } from "./private-store.js";
import {
  appendFilesIndex,
  generateWikiPages,
  parseFilesIndex,
  selectWikiGroups,
  stripFilesIndex,
  wikiDocId,
  WIKI_DOC_PREFIX,
  type RunPromptFn,
} from "./wiki-generate.js";
import { listDocs } from "./read.js";
import { diffSnapshots, type ModifiedNode } from "../graph/diff.js";
import type { GitRunner } from "./candidates.js";
import type { DocEmbedder } from "./embed.js";
import type { DocRow, QueryFn } from "./read.js";
import type { GraphSnapshot } from "../graph/types.js";
import type { WikiGroup } from "./wiki-groups.js";

/** Minimum quiet period between cycles (any meta activity counts). */
export const DEFAULT_MIN_PERIOD_MS = 6 * 60 * 60 * 1000;

export interface WikiRefreshArgs {
  query: QueryFn;
  tableName: string;
  snap: GraphSnapshot;
  repoRoot: string;
  project: string;
  scope?: string;
  run: RunPromptFn;
  /** Final-page authoring runner for regens (see WikiGenArgs.runPage). */
  runPage?: RunPromptFn;
  /** `git -C repoRoot <args>` runner (null on failure). */
  git: GitRunner;
  /** Claim owner id, e.g. `user@host:pid`. */
  owner: string;
  minPeriodMs?: number;
  /** Skip the quiet-period guard (manual `docs wiki-refresh --force`). */
  force?: boolean;
  now?: () => Date;
  /** Injectable settle delay for the claim read-back (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Full-page regeneration seam (defaults to generateWikiPages, force). */
  regenerate?: (group: WikiGroup) => Promise<"created" | "failed" | "skipped">;
  /**
   * Snapshot-at-sha loader (production: loadSnapshotByCommit on the repo's
   * graphs dir). When it can resolve the snapshot at `last_refresh_sha`, the
   * cycle counts per-group SIGNATURE changes and escalates pages whose public
   * contracts churned en masse. Absent/unresolvable → 0 (patching still safe:
   * mass rewrites are caught by the edit budget instead).
   */
  loadSnapshotAt?: (sha: string) => GraphSnapshot | null;
  embed?: DocEmbedder;
  agent?: string;
  pluginVersion?: string;
  log?: (msg: string) => void;
}

export interface WikiRefreshOutcome {
  doc_id: string;
  action: "patched" | "mechanics_refreshed" | "no_change" | "regenerated" | "generated" | "failed" | "skipped" | "held" | "promoted";
  reasons?: string[];
}

export interface WikiRefreshReport {
  status: "no-git" | "up-to-date" | "too-soon" | "not-claimed" | "committed" | "incomplete" | "lost-lease";
  head?: string;
  outcomes: WikiRefreshOutcome[];
}

function defaultRegenerate(args: WikiRefreshArgs): (group: WikiGroup) => Promise<"created" | "failed" | "skipped"> {
  return async (group) => {
    const report = await generateWikiPages({
      query: args.query,
      tableName: args.tableName,
      snap: args.snap,
      repoRoot: args.repoRoot,
      project: args.project,
      scope: args.scope,
      include: group.files,
      existing: new Set<string>(),
      force: true,
      run: args.run,
      runPage: args.runPage,
      embed: args.embed,
      agent: args.agent,
      pluginVersion: args.pluginVersion,
    });
    if (report.created > 0 && report.failed === 0) return "created";
    // A group the generator SKIPS (min-size gate, no readable sources) wants
    // no page at all — treating it as a failure would poison every cycle on
    // any repo with tiny groups, keeping the sha from ever advancing.
    if (report.failed === 0 && report.skipped > 0) return "skipped";
    return "failed";
  };
}

export interface LocalWikiRefreshArgs {
  snap: GraphSnapshot;
  repoRoot: string;
  run: RunPromptFn;
  git: GitRunner;
  maxChangedLines?: number;
  log?: (msg: string) => void;
}

export interface LocalWikiRefreshOutcome {
  /** Repo-relative materialized file, e.g. `pkg/core.hivemind.md`. */
  file: string;
  action: "patched" | "no_change" | "not-materialized" | "escalate-skipped" | "failed";
  reasons?: string[];
}

/**
 * LOCAL preview refresh: same patch pipeline, but the diff is the WORKING
 * TREE (uncommitted edits) and the writes go ONLY to the local gitignored
 * `<key>.hivemind.md` files — never the table. No lease, no meta, no sha:
 * this is a per-developer preview of what the canonical refresh will say
 * once the work is committed and merged. Pages not materialized locally
 * (no `docs pull` yet) are reported and skipped, and an over-budget patch
 * is skipped rather than escalated — a full regen belongs to the canonical
 * cycle, not a preview.
 */
export async function runLocalWikiRefresh(args: LocalWikiRefreshArgs): Promise<{ outcomes: LocalWikiRefreshOutcome[] }> {
  const changedOut = args.git(["diff", "--name-only", "HEAD"]);
  const changed = new Set((changedOut ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
  const untracked = args.git(["ls-files", "--others", "--exclude-standard"]);
  for (const l of (untracked ?? "").split("\n")) if (l.trim()) changed.add(l.trim());

  const outcomes: LocalWikiRefreshOutcome[] = [];
  if (changed.size === 0) return { outcomes };

  for (const group of selectWikiGroups(args.snap)) {
    const touched = group.files.filter((f) => changed.has(f));
    if (touched.length === 0) continue;
    const localFile = `${group.key}.wiki.hivemind.md`; // matches localDocPath's wiki namespace
    const abs = join(args.repoRoot, localFile);
    if (!existsSync(abs)) {
      outcomes.push({ file: localFile, action: "not-materialized", reasons: ["run `hivemind docs pull` first"] });
      continue;
    }
    const diff = args.git(["diff", "HEAD", "--", ...touched]) ?? "";
    if (diff.trim() === "") continue;

    let current: string;
    try {
      current = readFileSync(abs, "utf-8"); // existsSync raced a concurrent delete → treat as not materialized
    } catch {
      outcomes.push({ file: localFile, action: "not-materialized", reasons: ["file vanished during refresh"] });
      continue;
    }
    let response: string;
    try {
      response = (await args.run(buildUpdatePrompt(group.key, stripFilesIndex(current), diff))).trim();
    } catch (err) {
      outcomes.push({ file: localFile, action: "failed", reasons: [(err as Error).message] });
      continue;
    }
    if (response === NO_CHANGE || response === "") {
      outcomes.push({ file: localFile, action: "no_change" });
      continue;
    }
    const next = appendFilesIndex(response, group.files);
    const gate = gateDocEdit({
      tier: "slow",
      allowSlow: true,
      prevContent: current,
      newContent: next,
      newAnchors: [],
      snap: args.snap,
      maxChangedLines: args.maxChangedLines ?? DEFAULT_WIKI_MAX_CHANGED_LINES,
    });
    if (!gate.ok) {
      outcomes.push({ file: localFile, action: "escalate-skipped", reasons: gate.reasons });
      continue;
    }
    writeFileSync(abs, next.endsWith("\n") ? next : next + "\n");
    outcomes.push({ file: localFile, action: "patched" });
  }
  return { outcomes };
}

/** One full refresh cycle. See module docstring for the protocol. */
export async function runWikiRefreshCycle(args: WikiRefreshArgs): Promise<WikiRefreshReport> {
  const log = args.log ?? (() => {});
  const nowFn = args.now ?? (() => new Date());
  const scope = args.scope ?? "main";

  const head = args.git(["rev-parse", "HEAD"])?.trim();
  if (!head) return { status: "no-git", outcomes: [] };

  // Cheap read-only guards before taking any lease.
  const metaBefore = await readRefreshMeta(args.query, args.tableName, args.project, scope);
  if (metaBefore?.meta.last_refresh_sha === head) {
    return { status: "up-to-date", head, outcomes: [] };
  }
  if (metaBefore && !args.force) {
    const sinceLastTouch = nowFn().getTime() - new Date(metaBefore.updated_at).getTime();
    const minPeriod = args.minPeriodMs ?? DEFAULT_MIN_PERIOD_MS;
    if (Number.isFinite(sinceLastTouch) && sinceLastTouch < minPeriod) {
      return { status: "too-soon", head, outcomes: [] };
    }
  }

  const claim = await tryClaimTurn(args.query, args.tableName, args.project, scope, {
    owner: args.owner,
    now: args.now,
    sleep: args.sleep,
  });
  if (!claim.won) return { status: "not-claimed", head, outcomes: [] };

  // Someone may have committed HEAD between the guard read and our claim
  // (the claim carries their fresh sha — see tryClaimTurn). Release and go.
  if (claim.meta.last_refresh_sha === head) {
    await commitRefresh(args.query, args.tableName, args.project, scope, head, claim.meta.patch_counts, {
      owner: args.owner,
      now: args.now,
    });
    return { status: "up-to-date", head, outcomes: [] };
  }

  const lastSha = claim.meta.last_refresh_sha;
  const patchCounts = { ...claim.meta.patch_counts };

  // The refresh window base. Normally the stored cursor. But on a BRANCH's
  // first cycle (empty cursor), seed it from the merge-base with the trunk so
  // the window is the branch's OWN changes — otherwise every page would be
  // regenerated as an overlay identical to main (correct but wasteful).
  let baseSha = lastSha;
  if (lastSha === "" && parseScope(scope).kind === "branch") {
    const trunk = trunkBranch(args.git);
    const mb = (args.git(["merge-base", "HEAD", `origin/${trunk}`]) ?? args.git(["merge-base", "HEAD", trunk]))?.trim();
    if (mb) {
      baseSha = mb;
      log(`branch first cycle — window from merge-base ${mb.slice(0, 8)}..HEAD`);
    }
  }

  // The refresh window. No base sha (first cycle on the trunk) or an unreachable
  // sha (history rewritten) → null = "everything is a candidate", logged.
  let changed: Set<string> | null = null;
  if (baseSha !== "") {
    const out = args.git(["diff", "--name-only", `${baseSha}..HEAD`]);
    if (out !== null) {
      changed = new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
    } else {
      log(`diff ${baseSha}..HEAD unavailable — full-candidate cycle`);
    }
  } else {
    log("first refresh cycle — full-candidate cycle");
  }

  // Signature churn per file (Phase 7): diff the graph at last_refresh_sha
  // against the current one. Best-effort — no snapshot, no signal.
  let modified: ModifiedNode[] = [];
  if (lastSha !== "" && args.loadSnapshotAt) {
    const prevSnap = args.loadSnapshotAt(lastSha);
    if (prevSnap) modified = diffSnapshots(prevSnap, args.snap).nodes.modified ?? [];
    else log(`no graph snapshot at ${lastSha} — signature-churn escalation disabled this cycle`);
  }
  const sigChangesByFile = new Map<string, number>();
  for (const m of modified) {
    sigChangesByFile.set(m.after.source_file, (sigChangesByFile.get(m.after.source_file) ?? 0) + 1);
  }

  const groups = selectWikiGroups(args.snap);
  const pages = new Map<string, DocRow>();
  // Read the branch's VIEW: on a feature branch `readerScope` resolves each page
  // to its own overlay where one exists, and to main as the base everywhere
  // else — so a first patch on the branch copies-on-write from main.
  for (const d of await listDocs(args.query, args.tableName, { project: args.project, status: "active", limit: 100000, readerScope: scope })) {
    if (d.doc_id.startsWith(WIKI_DOC_PREFIX)) pages.set(d.doc_id, d);
  }

  const regenerate = args.regenerate ?? defaultRegenerate(args);
  const outcomes: WikiRefreshOutcome[] = [];
  let failures = 0;
  // Pages written PRIVATELY (unpushed) have pending "publish on push" work. A
  // push does NOT move HEAD, so if we advanced the cursor past them the next
  // cycle would short-circuit as up-to-date and never publish them. Counting
  // them keeps the cursor behind until they are pushed (then published). (Dirty/
  // detached holds don't need this: the commit that cleans them moves HEAD.)
  let pendingPublish = 0;

  // Publish gate: on a branch, only pages whose source is already on
  // origin/<branch> may be written to the SHARED cloud table. A page built from
  // an unpushed local commit is HELD — never leaked as a doc describing code the
  // team can't see. (Readers on the branch fall back to main + the staleness
  // banner until the code is pushed and the next cycle publishes the overlay.)
  const parsedScope = parseScope(scope);
  const branchName = parsedScope.kind === "branch" ? parsedScope.branch : null;
  // Detached HEAD resolves to `main` scope (branchName === null) but has no
  // branch identity. It must be computed BEFORE the promotion block below: a
  // detached checkout points at an arbitrary commit, and promoting branch
  // overlays into the canonical `main` corpus from it would bypass the branch
  // gate. So detect it up front and both skip promotion and hold all writes.
  const detached = branchName === null && currentBranch(args.git) === null;

  // On the trunk, first PROMOTE any branch overlays whose source now matches
  // main (a merge landed their changes) — reuse the overlay instead of paying to
  // regenerate. Promoted pages are then skipped by the loop below. NEVER on a
  // detached HEAD (see above) — it has no branch identity to promote from.
  const promotedIds = new Set<string>();
  if (branchName === null && !detached) {
    const groupFiles = new Map(groups.map((g) => [wikiDocId(g.key), g.files]));
    for (const p of await promoteMergedOverlays(args.query, args.tableName, args.project, args.git, groupFiles, { agent: args.agent, pluginVersion: args.pluginVersion })) {
      promotedIds.add(p.doc_id);
      outcomes.push({ doc_id: p.doc_id, action: "promoted", reasons: [`from ${p.fromScope}`] });
    }
  }
  // A page may be written to the shared cloud only when it is committed-clean
  // (content == committed HEAD, so it never documents uncommitted bytes) AND —
  // on a branch — its source is already on origin/<branch>. Checked at the write
  // sites (not for skipped pages). Returns the hold reason, or null if writable.
  const holdReason = (files: string[]): string | null => {
    if (detached) return "detached HEAD — ambiguous branch identity";
    if (!workingTreeClean(args.git, files)) return "uncommitted changes in member files";
    return null;
  };
  // A committed-clean page on a branch not yet on origin is PRIVATE: written to
  // the local store, never the shared cloud, until the source is pushed.
  const isPrivate = (files: string[]): boolean =>
    branchName !== null && !sourcePushed(args.git, files, branchName);
  const stampPrivate = (doc: { doc_id: string; path: string; content: string; source_fp: string; tier: "fast" | "slow" }): void =>
    writePrivateDoc(args.project, scope, { ...doc, updated_at: nowFn().toISOString() });

  for (const group of groups) {
    const docId = wikiDocId(group.key);
    const page = pages.get(docId);

    if (promotedIds.has(docId)) continue; // already promoted from a merged overlay

    // New subsystem → fresh page.
    if (!page) {
      const hr = holdReason(group.files);
      if (hr) {
        outcomes.push({ doc_id: docId, action: "held", reasons: [hr] });
        continue;
      }
      // A brand-new subsystem authored on an unpushed branch is held from the
      // cloud (full regeneration writes to the shared table); it publishes once
      // the source is pushed. (Private materialization covers UPDATES to existing
      // pages via the patch path below.)
      if (isPrivate(group.files)) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["new subsystem on an unpushed branch — publishes on push"] });
        pendingPublish++;
        continue;
      }
      const res = await regenerate(group);
      if (res === "skipped") {
        outcomes.push({ doc_id: docId, action: "skipped", reasons: ["below min size — no page wanted"] });
        continue;
      }
      outcomes.push({ doc_id: docId, action: res === "created" ? "generated" : "failed" });
      if (res === "failed") failures++;
      else { patchCounts[docId] = 0; if (branchName) deletePrivateDoc(args.project, scope, docId); }
      continue;
    }

    const pageFiles = parseFilesIndex(page.content);
    const membershipChanged =
      pageFiles.length > 0 &&
      (pageFiles.length !== group.files.length || group.files.some((f) => !pageFiles.includes(f)));

    // Candidate filter: page is touched by the window (or the window is
    // unknown), or its membership drifted. Everything else is skipped free.
    const touched = changed === null || group.files.some((f) => changed.has(f));
    if (!touched && !membershipChanged) continue;

    const hr = holdReason(group.files);
    if (hr) {
      outcomes.push({ doc_id: docId, action: "held", reasons: [hr] });
      continue;
    }

    // Whether this page's source is unpushed (→ private, cloud writes forbidden).
    // Computed BEFORE the regeneration branches so they never leak private
    // content to the shared cloud via `regenerate()` → generateWikiPages/upsertDoc.
    const priv = isPrivate(group.files);

    const diff = baseSha === "" ? null : args.git(["diff", `${baseSha}..HEAD`, "--", ...group.files]);
    if (diff === null && !membershipChanged) {
      // No usable diff to patch from → normally regenerate. But a private page
      // must NOT be regenerated to the cloud; hold it until pushed.
      if (priv) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["private page needs regeneration — publishes on push"] });
        pendingPublish++;
        continue;
      }
      const res = await regenerate(group);
      outcomes.push({ doc_id: docId, action: res === "failed" ? "failed" : "regenerated", reasons: ["no usable diff"] });
      if (res === "failed") failures++;
      else patchCounts[docId] = 0;
      continue;
    }

    const out = await updateWikiPage({
      query: args.query,
      tableName: args.tableName,
      page,
      scope,
      privateSink: priv ? stampPrivate : undefined,
      pageKey: group.key,
      files: group.files,
      snap: args.snap,
      repoRoot: args.repoRoot,
      diff: diff ?? "",
      run: args.run,
      escalation: {
        membershipChanged,
        signatureChanges: group.files.reduce((n, f) => n + (sigChangesByFile.get(f) ?? 0), 0),
        patchCount: patchCounts[docId] ?? 0,
      },
      embed: args.embed,
      agent: args.agent,
      pluginVersion: args.pluginVersion,
    });
    if (priv) {
      // Written to the local private store — pending publish once pushed.
      pendingPublish++;
    } else if (branchName) {
      // On the cloud (source pushed) → any pre-push private copy is now obsolete.
      deletePrivateDoc(args.project, scope, docId);
    }

    if (out.action === "escalate") {
      // Over-budget patch → normally full regeneration (which escalate did NOT
      // write). A private page can't regenerate to the cloud, so it is held and
      // stays pending (already counted above) until pushed — then it regenerates
      // to the cloud cleanly.
      if (priv) {
        outcomes.push({ doc_id: docId, action: "held", reasons: ["private page over patch budget — regenerates on push"] });
      } else {
        const res = await regenerate(group);
        outcomes.push({ doc_id: docId, action: res === "failed" ? "failed" : "regenerated", reasons: out.reasons });
        if (res === "failed") failures++;
        else patchCounts[docId] = 0;
      }
    } else if (out.action === "failed") {
      outcomes.push({ doc_id: docId, action: "failed", reasons: [out.reason] });
      failures++;
    } else if (out.action === "patched") {
      outcomes.push({ doc_id: docId, action: "patched" });
      patchCounts[docId] = (patchCounts[docId] ?? 0) + 1;
    } else {
      outcomes.push({ doc_id: docId, action: out.action });
    }
  }

  // Commit point: the sha advances ONLY on a fully clean cycle with nothing left
  // to publish. Failures OR pending-private pages leave it untouched so the next
  // turn redoes the window (idempotent by design) — critically, so a page that
  // was private this cycle gets published once its source is pushed (the push
  // doesn't move HEAD, so an advanced cursor would strand it forever).
  if (failures > 0 || pendingPublish > 0) {
    log(`${failures} failed, ${pendingPublish} pending publish — sha NOT advanced, next turn redoes the window`);
    // Free the lease so the retry does not have to wait out the 30-min TTL;
    // the untouched sha makes the redo idempotent.
    await releaseClaim(args.query, args.tableName, args.project, scope, {
      owner: args.owner,
      patchCounts,
      now: args.now,
    });
    return { status: "incomplete", head, outcomes };
  }
  const committed = await commitRefresh(args.query, args.tableName, args.project, scope, head, patchCounts, {
    owner: args.owner,
    now: args.now,
  });
  if (!committed.committed) return { status: "lost-lease", head, outcomes };
  return { status: "committed", head, outcomes };
}
