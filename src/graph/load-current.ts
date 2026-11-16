/**
 * Load the current local graph snapshot for a working directory.
 *
 * Mirrors the resolution `vfs-handler.ts` uses (derive repo key → repo dir →
 * last build for this worktree → read the snapshot json), extracted as a
 * standalone loader so non-VFS callers (the docs refresh command) can get the
 * snapshot without going through the VFS rendering layer. Returns null when
 * no graph has been built for this worktree, or the snapshot is missing /
 * malformed — callers print a "run `hivemind graph build` first" message.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveProjectKey } from "../utils/repo-identity.js";
import { readLastBuild } from "./last-build.js";
import { repoDir } from "./snapshot.js";
import type { GraphSnapshot } from "./types.js";

/** Stable per-worktree id — same derivation the VFS handler uses. */
export function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

export interface CurrentSnapshot {
  snapshot: GraphSnapshot;
  snapshotPath: string;
}

export interface LoadCurrentSnapshotOptions {
  /** Override the graph state root for hermetic callers and tests. */
  graphsHome?: string;
}

/** Load the latest built snapshot and its path for `cwd`, or null if invalid. */
export function loadCurrentSnapshotDetails(
  cwd: string,
  opts: LoadCurrentSnapshotOptions = {},
): CurrentSnapshot | null {
  let baseDir: string;
  let repoKey: string;
  try {
    repoKey = deriveProjectKey(cwd).key;
    baseDir = opts.graphsHome === undefined ? repoDir(repoKey) : join(opts.graphsHome, repoKey);
  } catch {
    return null;
  }
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null) return null;
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  // The state file is local input. Keep it a single safe filename component
  // before turning it into a path under the graph snapshot directory.
  if (!/^[A-Za-z0-9._-]+$/.test(fileBase)) return null;
  const snapPath = join(baseDir, "snapshots", `${fileBase}.json`);
  try {
    if (!existsSync(snapPath) || !lstatSync(snapPath).isFile()) return null;
  } catch {
    return null;
  }
  try {
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as GraphSnapshot;
    if (!Array.isArray(snap.nodes) || !Array.isArray(snap.links)) return null;
    const graph = snap.graph as Partial<GraphSnapshot["graph"]> | undefined;
    if (graph !== undefined && (typeof graph !== "object" || graph === null)) return null;
    if (graph?.repo_key !== undefined && graph.repo_key !== repoKey) return null;
    if (graph?.commit_sha !== undefined && graph.commit_sha !== last.commit_sha) return null;
    return { snapshot: snap, snapshotPath: snapPath };
  } catch {
    return null;
  }
}

/** Load the latest built snapshot for `cwd`, or null if unavailable/invalid. */
export function loadCurrentSnapshot(cwd: string, opts: LoadCurrentSnapshotOptions = {}): GraphSnapshot | null {
  return loadCurrentSnapshotDetails(cwd, opts)?.snapshot ?? null;
}
