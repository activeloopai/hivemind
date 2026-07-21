/**
 * Pull a graph snapshot from the Deeplake `codebase` table (Phase 3 v1.1 — simple).
 *
 * Use case: I open a session on machine A but the freshest build for HEAD
 * was produced on machine B (or in a different local worktree of the same
 * project). Cloud has the row. Local doesn't. Pull writes the snapshot
 * file + sidecars locally so the rest of the toolchain (`graph show`,
 * SessionStart inject, etc.) reads it like any other local build.
 *
 * Identity model (v1.1 — accepts the per-worktree push identity but uses
 * a relaxed pull identity):
 *   - PUSH key (unchanged): (org, ws, repo, user, worktree_id, commit_sha)
 *   - PULL key (this file): (org, ws, repo, user, commit_sha) — NO worktree_id
 *
 * Why the asymmetry: a push row's worktree_id records WHO produced the build
 * (one row per checkout that ran the extractor). A pull asks "what's the
 * freshest snapshot of THIS commit for ME, anywhere?" — because for the
 * same source content the extracted snapshot bytes are identical regardless
 * of which checkout produced them. So we let push remain per-worktree
 * (avoid silent overwrite between checkouts at the same commit with
 * different extractor outputs — covered by drift detection there), and let
 * pull look across worktrees by ORDER BY ts DESC LIMIT 1. Same user, same
 * project, same commit, freshest payload wins.
 *
 * Best-effort: any failure logs and returns. Local file system stays the
 * source of truth; if the network/auth/SELECT fails the caller falls back
 * to whatever's on disk. Disable via HIVEMIND_GRAPH_PULL=0.
 *
 * What's NOT in this version (v1.2 follow-ups):
 *   - Resume of partial downloads (full row each time)
 *   - Content-addressable node-level dedup (whole snapshot per pull)
 *   - --commit X for arbitrary commits (only HEAD today)
 *   - --force to overwrite local-newer
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Mirror of workTreeIdFor in src/commands/graph.ts. Per-worktree singletons
 * (.last-build.json + latest-commit.txt) are partitioned by this id so two
 * checkouts of the same project don't overwrite each other.
 */
function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

import { type Config } from "../config.js";
import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { deriveProjectKey } from "../utils/repo-identity.js";
import { writeLastBuild, readLastBuild } from "./last-build.js";
import { appendHistoryEntry } from "./history.js";
import { computeSnapshotSha256, repoDir } from "./snapshot.js";
import type { GraphSnapshot } from "./types.js";

export type PullOutcome =
  | { kind: "skipped-no-auth" }
  | { kind: "skipped-disabled" }
  | { kind: "skipped-no-head" }
  | { kind: "no-cloud-row"; commitSha: string }
  | { kind: "up-to-date"; commitSha: string; snapshotSha256: string }
  | { kind: "local-newer"; commitSha: string; localTs: number; cloudTs: number }
  | { kind: "pulled"; commitSha: string; snapshotSha256: string; bytes: number; cloudTs: number; sourceWorktreePath: string }
  | { kind: "error"; message: string };

export interface PullDeps {
  /** Override for tests. Defaults to loadConfig(). Returns null when no auth. */
  loadConfig?: () => Config | null;
  /** Override for tests. Defaults to a real DeeplakeApi. */
  makeApi?: (config: Config) => DeeplakeApi;
  /** Override for tests. Defaults to `git rev-parse HEAD` in `cwd`. */
  readHead?: (cwd: string) => string | null;
}

/**
 * Pull the freshest cloud snapshot for the current HEAD into the local
 * graph dir. Caller passes its own cwd so tests can point at a temp dir.
 *
 * Resolution rules (in order — first matching wins):
 *   1. HIVEMIND_GRAPH_PULL=0 in env       → skipped-disabled
 *   2. loadConfig() === null              → skipped-no-auth
 *   3. git rev-parse HEAD fails           → skipped-no-head
 *   4. SELECT returns 0 rows              → no-cloud-row
 *   5. local sha256 matches cloud sha256  → up-to-date (no write)
 *   6. local ts > cloud ts                → local-newer (no overwrite)
 *   7. else                               → pulled (write + return bytes)
 */
export async function pullSnapshot(
  cwd: string,
  deps: PullDeps = {},
): Promise<PullOutcome> {
  if (process.env.HIVEMIND_GRAPH_PULL === "0") {
    return { kind: "skipped-disabled" };
  }
  // Route by the caller's cwd so a pull lands from the same `.hivemind`
  // workspace the graph was pushed to (deeplake-push routes identically).
  const config = (deps.loadConfig ?? (() => loadRoutedConfig(cwd)))();
  if (config === null) {
    return { kind: "skipped-no-auth" };
  }

  const head = (deps.readHead ?? defaultReadHead)(cwd);
  if (head === null) {
    return { kind: "skipped-no-head" };
  }

  const api = (deps.makeApi ?? defaultMakeApi)(config);
  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome("ensureCodebaseTable", err);
  }

  // 5-key WHERE — NO worktree_id (see file header for rationale).
  // We need the full payload (snapshot_jsonb) plus the metadata we'll
  // mirror locally. ORDER BY ts DESC LIMIT 1 = "freshest build of this
  // commit for me, regardless of which checkout produced it".
  const tableId = sqlIdent(config.codebaseTableName);
  const { key: repoKey } = deriveProjectKey(cwd);
  const selectSql =
    `SELECT snapshot_jsonb, snapshot_sha256, ts, node_count, edge_count, ` +
    `branch, generator_version, worktree_id FROM "${tableId}" WHERE ` +
    `org_id = '${sqlStr(config.orgId)}' AND ` +
    `workspace_id = '${sqlStr(config.workspaceId)}' AND ` +
    `repo_slug = '${sqlStr(repoKey)}' AND ` +
    `user_id = '${sqlStr(config.userName)}' AND ` +
    `commit_sha = '${sqlStr(head)}' ` +
    `ORDER BY ts DESC LIMIT 1`;

  let rows: Record<string, unknown>[];
  try {
    rows = await api.query(selectSql);
  } catch (err) {
    return errorOutcome("SELECT cloud row", err);
  }
  if (rows.length === 0) {
    return { kind: "no-cloud-row", commitSha: head };
  }

  const row = rows[0]!;
  const cloudSha256 = String(row.snapshot_sha256 ?? "").trim();
  // CodeRabbit P1: validate payload shape + sha256 BEFORE writing to disk.
  // The cloud column is opaque JSON-or-text; a malformed row (null, garbage,
  // wrong type, or a sha mismatch) must not persist a corrupt snapshot
  // locally. coerceSnapshotPayload accepts string or object (re-serializing
  // the latter); anything else → error outcome.
  const cloudPayload = coerceSnapshotPayload(row.snapshot_jsonb);
  if (cloudPayload === null) {
    return errorOutcome("SELECT cloud row", new Error("invalid snapshot_jsonb payload"));
  }
  // Parse the payload so we can recompute the *stable-field* hash the same
  // way push does (see computeSnapshotSha256 in src/graph/snapshot.ts).
  // The payload bytes intentionally include `observation` (build-time
  // metadata), so hashing them directly would never match the column —
  // which by contract excludes observation so identical code on different
  // worktrees/branches/timestamps dedups.
  let parsedSnapshot: GraphSnapshot;
  try {
    parsedSnapshot = JSON.parse(cloudPayload) as GraphSnapshot;
  } catch (err) {
    return errorOutcome("parse cloud snapshot", err);
  }
  // JSON.parse accepts `null` and primitives ("null"/"5"/"true" → null/5/true),
  // none of which are valid snapshots. Guard for a non-null object BEFORE the
  // property access below, so a malformed payload returns the documented error
  // outcome instead of throwing TypeError on `null.nodes` (CodeRabbit).
  if (parsedSnapshot === null || typeof parsedSnapshot !== "object") {
    return errorOutcome("parse cloud snapshot", new Error("snapshot not an object"));
  }
  if (!Array.isArray((parsedSnapshot as { nodes?: unknown }).nodes) ||
      !Array.isArray((parsedSnapshot as { links?: unknown }).links)) {
    return errorOutcome("parse cloud snapshot", new Error("snapshot missing nodes/links arrays"));
  }
  // Hash mismatch = the API returned a snapshot whose stable fields don't
  // match the claimed sha256. Refuse rather than poison the local cache.
  // Empty sha is permitted (legacy rows that predate the column being
  // populated).
  if (cloudSha256 !== "") {
    const computedSha = computeSnapshotSha256(parsedSnapshot);
    if (cloudSha256 !== computedSha) {
      return errorOutcome("SELECT cloud row", new Error(`snapshot_sha256 mismatch (expected ${cloudSha256}, got ${computedSha})`));
    }
  }
  const cloudTs = parseTs(row.ts);

  // Compare with local. readLastBuild returns null on missing/corrupt
  // files; in that case we ALWAYS pull (no comparison possible).
  //
  // Codex P1 fix: gate the comparison on local.commit_sha === head.
  // `.last-build.json` records the last build for ANY commit in the
  // repo. Without this gate, if I'd built commit B (ts=1000) then
  // checked out commit A, HEAD=A and cloud has A at ts=500, the raw
  // comparison would say "local newer" and refuse to pull — but local
  // has no snapshot for A at all. The timestamp/sha comparison is only
  // semantically meaningful when local and cloud refer to the SAME
  // commit. When they don't, we fall through to the pull branch and
  // let the cloud bytes land locally (correct outcome: the user
  // doesn't have A locally and we just fetched it).
  const baseDir = repoDir(repoKey);
  // Per-worktree state: read THIS worktree's .last-build.json, not any
  // sibling's. Without this, after pull worktree-A would overwrite
  // worktree-B's metadata (or vice versa).
  const worktreeId = workTreeIdFor(cwd);
  const local = readLastBuild(baseDir, worktreeId);
  if (local !== null && local.commit_sha === head) {
    // CodeRabbit P1: empty cloud sha (legacy rows without the column
    // populated) is NOT proof local is current — it's "we don't know".
    // Only short-circuit on real hash equality; otherwise fall through
    // to the ts comparison or pull path.
    if (cloudSha256 !== "" && local.snapshot_sha256 === cloudSha256) {
      return { kind: "up-to-date", commitSha: head, snapshotSha256: cloudSha256 };
    }
    if (local.ts > cloudTs) {
      return {
        kind: "local-newer",
        commitSha: head,
        localTs: local.ts,
        cloudTs,
      };
    }
  }

  // Write payload + sidecars. The payload IS the canonical bytes
  // (canonicalJSON(snapshot)) — same function as writeSnapshot uses
  // locally — so the file we write here is byte-identical to what a
  // local build would have produced.
  const snapshotsDir = join(baseDir, "snapshots");
  const snapshotPath = join(snapshotsDir, `${head}.json`);
  const worktreeRoot = join(baseDir, "worktrees", worktreeId);
  try {
    writeFileAtomic(snapshotPath, cloudPayload);
    writeFileAtomic(join(worktreeRoot, "latest-commit.txt"), `${head}\n`);
    writeLastBuild(baseDir, {
      ts: cloudTs,
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: numOrUndefined(row.node_count),
      edge_count: numOrUndefined(row.edge_count),
    }, worktreeId);
    appendHistoryEntry(baseDir, {
      ts: new Date(cloudTs).toISOString(),
      commit_sha: head,
      snapshot_sha256: cloudSha256,
      node_count: Number(row.node_count ?? 0),
      edge_count: Number(row.edge_count ?? 0),
      trigger: "pull",
    });
  } catch (err) {
    return errorOutcome("write local files", err);
  }

  return {
    kind: "pulled",
    commitSha: head,
    snapshotSha256: cloudSha256,
    bytes: Buffer.byteLength(cloudPayload, "utf8"),
    cloudTs,
    sourceWorktreePath: String(row.worktree_id ?? ""),
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function defaultReadHead(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function defaultMakeApi(config: Config): DeeplakeApi {
  return new DeeplakeApi(
    config.token,
    config.apiUrl,
    config.orgId,
    config.workspaceId,
    config.tableName,
  );
}

/**
 * Deeplake serializes TIMESTAMP differently in different paths — sometimes
 * ISO string, sometimes epoch number. Coerce both into epoch ms. Returns
 * 0 on parse failure (treats unknown ts as "old", so the pull happens
 * rather than getting wedged on an unparseable cloud row).
 */
function parseTs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Heuristic: epoch seconds (10 digits) vs epoch ms (13 digits).
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function numOrUndefined(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * Cloud `snapshot_jsonb` arrives as either a string (text column) or a
 * parsed object (JSON column). Coerce both to a canonical string for
 * sha-verification + on-disk write. Anything else → null (caller errors).
 */
function coerceSnapshotPayload(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw !== null && typeof raw === "object") return JSON.stringify(raw);
  return null;
}

function writeFileAtomic(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, filePath);
}

function errorOutcome(stage: string, err: unknown): PullOutcome {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}

// existsSync re-export silenced — caller is responsible for any post-pull
// existence checks; pullSnapshot returns enough information in PullOutcome
// to drive UI decisions without re-stating disk.
void existsSync;
