/**
 * Shared accessor for the `mine-local` manifest at
 * ~/.claude/hivemind/local-mined.json.
 *
 * The manifest does triple duty:
 *   1. One-shot sentinel — `hivemind skillify mine-local` refuses to
 *      re-run when the file exists (unless `--force` is passed).
 *   2. Provenance index — records every locally-mined skill's canonical
 *      path, source sessions, fan-out symlinks, and gate metadata for a
 *      future `push-local` flow (uploads `uploaded:false` rows after
 *      sign-in).
 *   3. Read-only hint surface — the per-agent SessionStart hooks read
 *      the entry count when no credentials are present and surface it
 *      as part of the "not logged in" injection: "You have N local
 *      skills. Sign in to share new ones."
 *
 * Pulled out of `src/commands/mine-local.ts` so the session-start hooks
 * don't have to depend on the CLI orchestrator (which transitively
 * imports the gate runner, parallelMap, etc. — heavy for a hook).
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LocalManifestEntry {
  skill_name: string;
  canonical_path: string;
  /** Symlink targets created in other agents' skill roots. */
  symlinks: string[];
  source_session_ids: string[];
  source_session_paths: string[];
  source_agent: string;
  gate_agent: string;
  created_at: string;
  /** False until a future `push-local` flow uploads the row to the org table. */
  uploaded: boolean;
  /**
   * One-line user-facing insight emitted by the gate alongside the skill —
   * concrete and counted, addressed to the user in second person ("You
   * revisited 4 merged PRs in the last month..."). Surfaced by the
   * SessionStart banner when present so unauthenticated users see a real
   * finding instead of an abstract skill count. Optional for backward
   * compatibility — entries written before this field landed parse fine
   * and fall back to the count-only banner.
   */
  insight?: string;
  /**
   * Set to true by the advisor pass when this entry is the chosen "best"
   * insight to surface. The advisor (sonnet) ranks all insight-bearing
   * entries from a mining run by quality (concrete, quantified, non-meta)
   * and marks the winner. `getLatestInsightEntry` prefers primary entries
   * over the recency tiebreak when present.
   */
  primary?: boolean;
}

export interface LocalManifest {
  created_at: string;
  entries: LocalManifestEntry[];
}

export const LOCAL_MANIFEST_PATH = join(homedir(), ".claude", "hivemind", "local-mined.json");

/**
 * Sibling lock file used by maybeAutoMineLocal() (spawn-mine-local-worker.ts)
 * and released by runMineLocal() on exit. Exported here so both producers
 * agree on the path without circular imports.
 */
export const LOCAL_MINE_LOCK_PATH = join(homedir(), ".claude", "hivemind", "local-mined.lock");

/**
 * Read the manifest. Returns null when the file doesn't exist or is
 * malformed. `path` defaults to LOCAL_MANIFEST_PATH; tests inject a
 * tmpdir path so they don't have to mutate the developer's HOME.
 */
export function readLocalManifest(path: string = LOCAL_MANIFEST_PATH): LocalManifest | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as LocalManifest;
  } catch {
    return null;
  }
}

/** Write the manifest, creating parent directories as needed. */
export function writeLocalManifest(m: LocalManifest, path: string = LOCAL_MANIFEST_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  let destination = path;
  let mode: number | undefined;
  let existing;
  try {
    existing = lstatSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (existing) {
    // Preserve a user's existing symlink instead of replacing it with a
    // regular file carrying the symlink's usually-permissive mode bits.
    if (existing.isSymbolicLink()) {
      destination = realpathSync(path);
      existing = statSync(destination);
    }
    if (!existing.isFile()) throw new Error(`local manifest is not a regular file: ${path}`);
    mode = existing.mode & 0o777;
  }
  const tmp = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  let staged = false;
  try {
    // O_EXCL prevents a pre-created temp symlink from redirecting the write.
    writeFileSync(tmp, JSON.stringify(m, null, 2), { encoding: "utf8", mode: mode ?? 0o666, flag: "wx" });
    staged = true;
    // Creation mode is filtered by umask. Existing files retain their exact
    // access bits; fresh manifests still respect the caller's umask.
    if (mode !== undefined) chmodSync(tmp, mode);
    renameSync(tmp, destination);
  } catch (e) {
    // Do not remove a collision we never created. A later rename error,
    // however, still owns the successfully staged file and must clean it up.
    if (staged || (e as NodeJS.ErrnoException).code !== "EEXIST") {
      try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
    }
    throw e;
  }
}

/**
 * Cheap accessor for the SessionStart hook — returns the count of locally
 * mined skills without forcing callers to handle null/error branches.
 * Returns 0 if the manifest is missing, malformed, or has no entries.
 */
export function countLocalManifestEntries(path: string = LOCAL_MANIFEST_PATH): number {
  const m = readLocalManifest(path);
  // Defend against malformed manifests where `entries` is present but not
  // an array (e.g. a string like "oops" would otherwise leak `.length`).
  return Array.isArray(m?.entries) ? m!.entries.length : 0;
}

/**
 * Return the most recent manifest entry that has a non-empty `insight`, or
 * null when none exists. "Most recent" = highest `created_at` ISO timestamp
 * among entries that carry an insight (we don't assume manifest order).
 *
 * Powers the SessionStart concrete-insight banner: when the gate produced a
 * quantified user-facing finding, we surface that instead of the generic
 * count. Returns null cleanly for legacy manifests written before the
 * `insight` field landed, so the banner can fall back to the count surface
 * without branching on a sentinel.
 */
/**
 * Window (ms) used to cluster manifest entries into "the most recent
 * mine-local run." Each invocation writes its rows within milliseconds
 * of each other, and subsequent runs typically happen at least minutes
 * apart. 5 minutes is generous enough to cover slow disk writes /
 * synchronization slack but tight enough to clearly separate distinct
 * runs.
 */
const LATEST_RUN_WINDOW_MS = 5 * 60 * 1000;

export function getLatestInsightEntry(
  path: string = LOCAL_MANIFEST_PATH,
): LocalManifestEntry | null {
  const m = readLocalManifest(path);
  if (!m || !Array.isArray(m.entries)) return null;
  // First pass: find the absolute-newest entry timestamp (insight or
  // not). This anchors the "latest run" cluster. Without this anchor,
  // a stale historical insight would forever shadow newer runs that
  // happened to produce no insight — and the rule's dedup state
  // would suppress the count fallback that should have fired
  // instead (codex P2).
  let newestTs = Number.NEGATIVE_INFINITY;
  for (const e of m.entries) {
    if (!e) continue;
    const ts = Date.parse(e.created_at ?? "");
    if (Number.isFinite(ts) && ts > newestTs) newestTs = ts;
  }
  if (!Number.isFinite(newestTs)) return null;
  // Second pass: pick the best insight-bearing entry within the
  // latest-run window. Preference order:
  //   1. `primary: true` entries (advisor marked these as the best
  //      among the run's candidates by quality criteria)
  //   2. otherwise, the newest by created_at
  // Date.parse handles timezone-offset variants; unparseable created_at
  // rows are skipped so a single malformed entry can't shadow valid ones.
  let best: LocalManifestEntry | null = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  let bestIsPrimary = false;
  for (const e of m.entries) {
    if (!e || typeof e.insight !== "string" || e.insight.trim().length === 0) continue;
    const ts = Date.parse(e.created_at ?? "");
    if (!Number.isFinite(ts)) continue;
    if (newestTs - ts > LATEST_RUN_WINDOW_MS) continue;
    const isPrimary = e.primary === true;
    // Primary entries always beat non-primary; among same-class, newer wins.
    if (!best || (isPrimary && !bestIsPrimary) || (isPrimary === bestIsPrimary && ts > bestTs)) {
      best = e;
      bestTs = ts;
      bestIsPrimary = isPrimary;
    }
  }
  return best;
}
