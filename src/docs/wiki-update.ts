/**
 * Wiki update-worker — patch a page in place instead of regenerating it.
 *
 * The refresh loop feeds each stale page the ACCUMULATED unified diff of its
 * member files (`last_refresh_sha..HEAD`). The model corrects ONLY sentences
 * the diff made false — or answers NO_CHANGE. This is the cheap steady-state
 * path: most commits invalidate a line or two of prose, not the page.
 *
 * Mechanics stay code-owned regardless of the model's answer: the `## Files`
 * index and the anchors are recomputed on EVERY update, including NO_CHANGE.
 *
 * Escalation (full page regen, decided by the CALLER) fires when patching is
 * the wrong tool:
 *   - group membership changed (files added/removed — the narrative's shape
 *     is stale, not just its sentences),
 *   - many public signatures changed at once,
 *   - the page has been patched `maxPatches` times since its last regen
 *     (drift accumulates; a periodic rewrite resets it),
 *   - the model's patch blows the bounded-edit budget (a "patch" that
 *     rewrites the page is a regen wearing a trench coat).
 *
 * Writes go through `editDoc` → one UPDATE (the Deeplake coalescing rule).
 */

import { gateDocEdit } from "./gate.js";
import { unwrapModelOutput } from "./refresh-llm.js";
import { editDoc, upsertDoc } from "./write.js";
import { computeFingerprint, serializeFingerprint } from "./fingerprint.js";
import { defaultGit } from "./candidates.js";
import { appendFilesIndex, collectWikiAnchors, stripFilesIndex, type RunPromptFn } from "./wiki-generate.js";
import type { DocEmbedder } from "./embed.js";
import type { DocRow, QueryFn } from "./read.js";
import type { GraphSnapshot } from "../graph/types.js";

export const NO_CHANGE = "NO_CHANGE";

/** Consecutive in-place patches before a page must be fully regenerated. */
export const DEFAULT_MAX_PATCHES = 15;
/** Signature changes in one window above which patching is the wrong tool. */
export const DEFAULT_MAX_SIGNATURE_CHANGES = 5;
/** Changed-line budget for one patch (wiki pages are larger than file docs). */
export const DEFAULT_WIKI_MAX_CHANGED_LINES = 60;

/** Build the bounded-patch prompt: diff in, corrected sentences (or NO_CHANGE) out. */
export function buildUpdatePrompt(pageKey: string, narrative: string, diff: string): string {
  return [
    `Below is the internal wiki page for the subsystem \`${pageKey}\`, followed by`,
    "the unified diff of the code changes since the page was last verified.",
    "",
    "Correct ONLY the statements this diff makes false. Do NOT rephrase, restyle,",
    "or expand anything the diff does not contradict. Keep every untouched line",
    "byte-identical. Do NOT add a file listing section.",
    `If nothing in the page is contradicted by the diff, reply with exactly: ${NO_CHANGE}`,
    "Otherwise output the FULL corrected page as raw markdown (no preamble, no outer code fence).",
    "",
    "=== CURRENT PAGE ===",
    "",
    narrative,
    "",
    "=== CODE DIFF ===",
    "",
    diff,
  ].join("\n");
}

export interface EscalationInput {
  /** Files added to / removed from the subsystem group since the last cycle. */
  membershipChanged: boolean;
  /** Count of changed public signatures among member files in this window. */
  signatureChanges: number;
  /** Consecutive in-place patches since the page's last full regen. */
  patchCount: number;
  maxPatches?: number;
  maxSignatureChanges?: number;
}

/** Pre-flight: is patching the wrong tool for this window? Pure. */
export function shouldEscalate(input: EscalationInput): { escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.membershipChanged) reasons.push("group membership changed");
  const maxSig = input.maxSignatureChanges ?? DEFAULT_MAX_SIGNATURE_CHANGES;
  if (input.signatureChanges > maxSig) {
    reasons.push(`too many signature changes: ${input.signatureChanges} > ${maxSig}`);
  }
  const maxPatches = input.maxPatches ?? DEFAULT_MAX_PATCHES;
  if (input.patchCount >= maxPatches) {
    reasons.push(`patch budget exhausted: ${input.patchCount} >= ${maxPatches}`);
  }
  return { escalate: reasons.length > 0, reasons };
}

export interface WikiUpdateArgs {
  query: QueryFn;
  tableName: string;
  /** Current wiki page row (latest version). */
  page: DocRow;
  /** Subsystem key, e.g. `xarray/plot` (doc_id minus the `wiki/` prefix). */
  pageKey: string;
  /** CURRENT member files of the group (drives index + anchors). */
  files: string[];
  snap: GraphSnapshot;
  repoRoot: string;
  /** Accumulated unified diff of the member files since last_refresh_sha. */
  diff: string;
  run: RunPromptFn;
  escalation: EscalationInput;
  maxChangedLines?: number;
  embed?: DocEmbedder;
  agent?: string;
  pluginVersion?: string;
  /**
   * The branch identity to WRITE to (`main`, or `b:<branch>`). When it differs
   * from the resolved `page`'s scope, the patched content is a copy-on-write
   * overlay for this branch: it is CREATED at the target scope from the (main)
   * base, never overwriting main. When it matches, the row is patched in place.
   * Default `main` — legacy in-place behavior.
   */
  scope?: string;
  /**
   * When set, the patched page is written HERE (the local private store)
   * instead of the shared cloud table — used for committed-but-unpushed branch
   * code, which must never reach the cloud. The caller persists it locally.
   */
  privateSink?: (doc: { doc_id: string; path: string; content: string; source_fp: string; tier: "fast" | "slow" }) => void;
}

export type WikiUpdateOutcome =
  | { action: "patched"; version: number; changedLines: number }
  | { action: "mechanics_refreshed"; version: number }
  | { action: "no_change" }
  | { action: "escalate"; reasons: string[] }
  | { action: "failed"; reason: string };

/** Anchors compare (order-insensitive) — mechanics need a write only on drift. */
function anchorsEqual(a: DocRow["anchors"], b: DocRow["anchors"]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: DocRow["anchors"][number]): string => `${x.symbol_id}\u0000${x.content_hash}`;
  const set = new Set(a.map(key));
  return b.every((x) => set.has(key(x)));
}

/** Patch one wiki page in place (or report that regen/nothing is needed). */
export async function updateWikiPage(args: WikiUpdateArgs): Promise<WikiUpdateOutcome> {
  const pre = shouldEscalate(args.escalation);
  if (pre.escalate) return { action: "escalate", reasons: pre.reasons };

  const narrative = stripFilesIndex(args.page.content);

  let response: string;
  try {
    response = (await args.run(buildUpdatePrompt(args.pageKey, narrative, args.diff))).trim();
  } catch (err) {
    return { action: "failed", reason: `update failed: ${(err as Error).message}` };
  }

  const noChange = response === NO_CHANGE;
  if (!noChange && response === "") return { action: "failed", reason: "empty patch response" };

  // Models sometimes narrate before the page ("Here's the corrected page:")
  // despite the no-preamble instruction — caught live in the tick e2e, where
  // the chat prose was stored as documentation. The page shape is code-owned:
  // a narrative always starts at a markdown heading, so anything before the
  // first heading is preamble by construction. No heading at all means the
  // reply is not a page — fail rather than store chat prose.
  let newNarrative = narrative;
  if (!noChange) {
    const unwrapped = unwrapModelOutput(response);
    const firstHeading = unwrapped.search(/^#{1,6} /m);
    if (firstHeading < 0) return { action: "failed", reason: "patch response has no markdown heading — not a page" };
    newNarrative = unwrapped.slice(firstHeading).trimEnd();
  }
  const newContent = appendFilesIndex(newNarrative, args.files);
  const newAnchors = collectWikiAnchors(args.snap, args.files, args.repoRoot);

  // Mechanics are refreshed even on NO_CHANGE — but only written on drift.
  if (newContent === args.page.content && anchorsEqual(newAnchors, args.page.anchors)) {
    return { action: "no_change" };
  }

  const gate = gateDocEdit({
    tier: args.page.tier,
    allowSlow: true, // wiki pages are slow-tier but machine-authored — see gate.ts
    prevContent: args.page.content,
    newContent,
    newAnchors,
    snap: args.snap,
    maxChangedLines: args.maxChangedLines ?? DEFAULT_WIKI_MAX_CHANGED_LINES,
  });
  if (!gate.ok) {
    // Over-budget or invalid patch → the caller regenerates the page instead.
    return { action: "escalate", reasons: gate.reasons };
  }

  try {
    const source_fp = serializeFingerprint(computeFingerprint(defaultGit(args.repoRoot), args.files));

    // Private branch code: persist locally instead of the shared cloud — and do
    // NOT embed it (the embedder may be a remote service; private branch docs
    // must never leave this machine).
    if (args.privateSink) {
      args.privateSink({ doc_id: args.page.doc_id, path: args.page.path, content: newContent, source_fp, tier: args.page.tier });
      return noChange
        ? { action: "mechanics_refreshed", version: args.page.version }
        : { action: "patched", version: args.page.version, changedLines: gate.changedLines };
    }

    const content_embedding = args.embed ? (await args.embed(newContent)) ?? undefined : undefined;
    const targetScope = args.scope ?? "main";
    const pageScope = args.page.scope ?? "main";
    let res: { version: number };
    if (pageScope === targetScope) {
      // In-place patch of the row that already exists at this scope (main, or an
      // existing branch overlay). One UPDATE — the Deeplake coalescing rule.
      res = await editDoc(
        args.query,
        args.tableName,
        {
          doc_id: args.page.doc_id,
          content: newContent,
          anchors: newAnchors,
          source_fp,
          agent: args.agent ?? "docs-wiki-update",
          plugin_version: args.pluginVersion,
          content_embedding,
        },
        { project: args.page.project, scope: targetScope },
      );
    } else {
      // Copy-on-write: the base is main but we are on a branch — CREATE the
      // overlay at the target scope (upsert = create-or-replace by fixed id),
      // never touching the main row it was based on.
      res = await upsertDoc(args.query, args.tableName, {
        doc_id: args.page.doc_id,
        path: args.page.path,
        content: newContent,
        anchors: newAnchors,
        tier: args.page.tier,
        project: args.page.project,
        scope: targetScope,
        source_fp,
        agent: args.agent ?? "docs-wiki-update",
        plugin_version: args.pluginVersion,
        content_embedding,
      });
    }
    return noChange
      ? { action: "mechanics_refreshed", version: res.version }
      : { action: "patched", version: res.version, changedLines: gate.changedLines };
  } catch (err) {
    return { action: "failed", reason: `write failed: ${(err as Error).message}` };
  }
}
