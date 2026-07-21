/**
 * Scope a refresh to the diff — turn "what changed in git" into "which docs
 * could possibly be stale", so per-commit work is O(diff), not O(all docs).
 *
 * Two steps:
 *   1. `changedFilesFromGit` — the files touched vs HEAD. Union of the working
 *      tree (uncommitted edits — the manual `docs refresh` case) and the last
 *      commit (HEAD~1..HEAD — the post-commit auto-refresh case). Returns null
 *      when git is unavailable, so the caller can fall back to a full scan.
 *   2. `expandToCandidateFiles` — the changed files PLUS every file that
 *      transitively CALLS a symbol in them (blast radius over the graph's
 *      reverse edges). Loading exactly these docs reproduces the full-scan
 *      impacted set: the direct hash pass flags the changed files' docs, and
 *      their caller docs are present to be flagged by the relational pass.
 */

import { execFileSync } from "node:child_process";
import { impactedNodes } from "../graph/render/impact.js";
import type { GraphSnapshot } from "../graph/types.js";

/** Run `git <args>` in `cwd`; returns stdout, or null on any failure. */
export type GitRunner = (args: string[]) => string | null;

export function defaultGit(cwd: string): GitRunner {
  return (args) => {
    try {
      return execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
}

function collect(out: string | null, into: Set<string>): void {
  if (out === null) return;
  for (const line of out.split("\n")) {
    const f = line.trim();
    if (f) into.add(f);
  }
}

/**
 * Files changed relative to HEAD. `null` means "no git signal" → full scan.
 * An empty array means git works but nothing changed.
 */
export function changedFilesFromGit(cwd: string, git: GitRunner = defaultGit(cwd)): string[] | null {
  const workingTree = git(["diff", "--name-only", "HEAD"]);
  if (workingTree === null) return null; // not a repo / git missing
  const files = new Set<string>();
  collect(workingTree, files);
  // Untracked, non-ignored files — a brand-new file doesn't show in `git diff`
  // but is exactly the case that needs a fresh doc generated.
  collect(git(["ls-files", "--others", "--exclude-standard"]), files);
  // The last commit too, for the post-commit path where the tree is clean.
  collect(git(["diff", "--name-only", "HEAD~1", "HEAD"]), files);
  return [...files];
}

/**
 * Expand changed files to the candidate doc set: the changed files + the
 * transitive callers of any symbol they define. Result is a superset of the
 * files whose docs the full scan would flag — never smaller.
 */
export function expandToCandidateFiles(snap: GraphSnapshot, changedFiles: Iterable<string>): string[] {
  const changed = new Set(changedFiles);
  const out = new Set(changed);
  const seedIds = snap.nodes.filter((n) => changed.has(n.source_file)).map((n) => n.id);
  if (seedIds.length > 0) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    for (const id of impactedNodes(snap, seedIds)) {
      const node = byId.get(id);
      if (node) out.add(node.source_file);
    }
  }
  return [...out];
}
