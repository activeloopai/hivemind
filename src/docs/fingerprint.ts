/**
 * Per-page source fingerprint = the git blob-sha of each of a page's member
 * files, as of the committed tree (HEAD). This is the objective, content-defined
 * freshness signal:
 *   - git already content-addresses every file, so the blob-sha is a pure
 *     function of the file's bytes — no reading/hashing here, we ask git;
 *   - a page is stale iff its stored fingerprint differs from the current one
 *     (a member file changed, joined, or left);
 *   - path-independent: a rebase/merge/branch that lands the SAME bytes yields
 *     the SAME fingerprint, so freshness never chases the commit graph.
 *
 * It is stored per doc row (`source_fp`, a JSON `{file: blob-sha}` map) and drives
 * freshness, the overlay-divergence decision, the origin publish gate, and the
 * merge-promotion match.
 *
 * NB: fingerprints reflect COMMITTED content (`git ls-tree HEAD`), not the dirty
 * working tree — a doc is never fresher than a pushable commit.
 */

import type { GitRunner } from "./branch-scope.js";

/** Map of `file path -> git blob-sha` for a page's member files. */
export type SourceFingerprint = Record<string, string>;

/**
 * Blob-sha per file at a git `ref` (a commit / branch / `origin/<branch>`) via a
 * single `git ls-tree`. Files git can't resolve (deleted, untracked, absent at
 * that ref, or no git) are simply absent from the map — so a page whose file was
 * deleted or isn't on the ref reads as "changed". Returns `{}` when git or the
 * ref is unavailable, which downstream treats as "unknown → stale / not there".
 */
export function computeFingerprintAt(git: GitRunner, ref: string, files: readonly string[]): SourceFingerprint {
  const fp: SourceFingerprint = {};
  if (files.length === 0) return fp;
  const out = git(["ls-tree", ref, "--", ...files]);
  if (out === null) return fp;
  for (const line of out.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    // `<mode> blob <sha>\t<path>`
    const meta = line.slice(0, tab).trim().split(/\s+/);
    const path = line.slice(tab + 1);
    if (meta.length >= 3 && meta[1] === "blob" && path) fp[path] = meta[2];
  }
  return fp;
}

/** Blob-sha per file at the committed tree (HEAD) — the freshness baseline. */
export function computeFingerprint(git: GitRunner, files: readonly string[]): SourceFingerprint {
  return computeFingerprintAt(git, "HEAD", files);
}

/**
 * True iff every member file is committed-clean — working tree == HEAD, with no
 * modified or untracked bytes among them (`git status --porcelain -- <files>`
 * is empty). Doc content is read from the WORKING TREE, while the fingerprint
 * and publish gate reason about committed HEAD; publishing is only consistent
 * when the two agree. A dirty or untracked member file means the page would
 * document uncommitted bytes stamped as committed HEAD — so it must be held.
 * No git (null) → true: a non-git repo has no notion of "committed".
 */
export function workingTreeClean(git: GitRunner, files: readonly string[]): boolean {
  if (files.length === 0) return true;
  const out = git(["status", "--porcelain", "--", ...files]);
  if (out === null) return true;
  return out.trim() === "";
}

/**
 * Is a page's source PUBLISHED — i.e. does every member file have, on
 * `origin/<branch>`, the exact same blob it has at HEAD? True → the doc can be
 * shared to the cloud (teammates on the branch have this code). False → the code
 * is only local (unpushed): the doc must stay private, never published early.
 * A repo with no `origin/<branch>` yields false (nothing is shared yet).
 */
export function sourcePushed(git: GitRunner, files: readonly string[], branch: string): boolean {
  if (files.length === 0) return true;
  const head = computeFingerprint(git, files);
  const origin = computeFingerprintAt(git, `origin/${branch}`, files);
  return isFresh(head, origin);
}

/** Serialize a fingerprint for the `source_fp` TEXT column (stable key order). */
export function serializeFingerprint(fp: SourceFingerprint): string {
  const sorted: SourceFingerprint = {};
  for (const k of Object.keys(fp).sort()) sorted[k] = fp[k];
  return JSON.stringify(sorted);
}

/** Parse the `source_fp` cell; garbage degrades to `{}` (→ treated as stale). */
export function parseFingerprint(raw: unknown): SourceFingerprint {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: SourceFingerprint = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return parseFingerprint(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Files whose blob differs between two fingerprints — including files that
 * appear in only one (added/removed from the page). Sorted for determinism.
 */
export function changedFiles(a: SourceFingerprint, b: SourceFingerprint): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) changed.push(k);
  return changed.sort();
}

/** A page is fresh iff its stored fingerprint matches the current one exactly. */
export function isFresh(stored: SourceFingerprint, current: SourceFingerprint): boolean {
  return changedFiles(stored, current).length === 0;
}
