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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveProjectKey } from "../utils/repo-identity.js";
import { readLastBuild } from "./last-build.js";
import { repoDir } from "./snapshot.js";
import type { GraphSnapshot } from "./types.js";

/** Stable per-worktree id — same derivation the VFS handler uses. */
export function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

/** Load the latest built snapshot for `cwd`, or null if unavailable/invalid. */
export function loadCurrentSnapshot(cwd: string): GraphSnapshot | null {
  let baseDir: string;
  try {
    baseDir = repoDir(deriveProjectKey(cwd).key);
  } catch {
    return null;
  }
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null) return null;
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  const snapPath = join(baseDir, "snapshots", `${fileBase}.json`);
  if (!existsSync(snapPath)) return null;
  try {
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as GraphSnapshot;
    if (!Array.isArray(snap.nodes) || !Array.isArray(snap.links)) return null;
    return snap;
  } catch {
    return null;
  }
}
