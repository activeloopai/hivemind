/**
 * Push a graph snapshot to the Deeplake `codebase` table (Phase 3 — simple).
 *
 * Pattern: SELECT-before-INSERT with drift detection.
 *   1. Bootstrap the table on first push (lazy schema).
 *   2. SELECT existing row for (org, workspace, repo, user, worktree, commit).
 *   3. If row exists with matching snapshot_sha256 → no-op (idempotent).
 *   4. If row exists with DIFFERENT snapshot_sha256 → log drift warning,
 *      DO NOT overwrite (same commit producing different content = extractor
 *      version drift; let a human investigate before clobbering history).
 *   5. If no row → INSERT.
 *
 * Phase 3 simplifications (iterate later):
 *   - No persistent retry queue. Network failures log + drop. v1.1 adds a
 *     `.push-queue.jsonl` drain.
 *   - No batch INSERT. One snapshot = one INSERT.
 *   - Best-effort: any failure short-circuits without surfacing to the
 *     build caller. The local snapshot is the source of truth; cloud is
 *     a sync target.
 *
 * Known concurrency gap (codex P1, accepted for v1.1):
 *   The codebase table has no UNIQUE constraint on the identity key. SELECT
 *   + INSERT is therefore NOT atomic — two writers that both observe "no
 *   row" can both insert. Mitigations in place:
 *     1. The Stop / SessionEnd auto-build path acquires a cross-process
 *        build lock (src/graph/build-lock.ts) keyed by repo, serializing
 *        the most common concurrent caller.
 *     2. Post-INSERT this function re-SELECTs and returns
 *        `inserted-with-duplicate-race` if >1 row is found, making the
 *        race visible rather than silent.
 *   The proper fix (server-side UNIQUE on the 6-column identity key) lands
 *   in v1.1 once the Deeplake schema API supports it.
 *
 * Privacy: push only happens when `loadConfig()` returns auth credentials.
 * No auth → silent no-op (the user wasn't logged in; they didn't opt in).
 * Disable explicitly via `HIVEMIND_GRAPH_PUSH=0` in env.
 */

import { createHash } from "node:crypto";

import { loadConfig, type Config } from "../config.js";
import { resolveDirConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import type { GraphSnapshot } from "./types.js";

export type PushOutcome =
  | { kind: "skipped-no-auth" }
  | { kind: "skipped-no-commit" }
  | { kind: "skipped-disabled" }
  | { kind: "skipped-collect-disabled" }
  | { kind: "inserted"; commitSha: string }
  | { kind: "inserted-with-duplicate-race"; commitSha: string; rowCount: number }
  | { kind: "already-current"; commitSha: string }
  | { kind: "drift"; commitSha: string; localSha256: string; cloudSha256: string }
  | { kind: "error"; message: string };

export interface PushDeps {
  /** Override for tests; defaults to loadConfig(). Returns null when no auth. */
  loadConfig?: () => Config | null;
  /** Override for tests; defaults to constructing a real DeeplakeApi. */
  makeApi?: (config: Config) => DeeplakeApi;
  /** Working directory for `.hivemind` resolution; defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Push a single snapshot. Returns the outcome — callers log it but should
 * NOT block on this (push is best-effort; local snapshot is the truth).
 */
export async function pushSnapshot(
  snapshot: GraphSnapshot,
  worktreeId: string,
  deps: PushDeps = {},
): Promise<PushOutcome> {
  if (process.env.HIVEMIND_GRAPH_PUSH === "0") {
    return { kind: "skipped-disabled" };
  }
  const base = (deps.loadConfig ?? loadConfig)();
  if (base === null) {
    return { kind: "skipped-no-auth" };
  }
  // Per-directory `.hivemind`: skip the graph push where the repo opts out,
  // and route to the configured org/workspace otherwise. Use the resolved
  // build cwd (threaded from `runBuildCommand`), NOT process.cwd(), so
  // `hivemind graph build --cwd ../repo` resolves the right tree's `.hivemind`.
  const dirRes = resolveDirConfig(base, deps.cwd ?? process.cwd());
  if (!dirRes.collect) {
    return { kind: "skipped-collect-disabled" };
  }
  const config = dirRes.config;
  const commitSha = snapshot.graph.commit_sha;
  if (commitSha === null) {
    // CodeRabbit Minor: distinct outcome for "no commit context" — the
    // user shouldn't be told to log in when the real reason is just
    // "not in a git repo". runBuildCommand handles this case separately.
    return { kind: "skipped-no-commit" };
  }
  const api = (deps.makeApi ?? defaultMakeApi)(config);

  try {
    await api.ensureCodebaseTable(config.codebaseTableName);
  } catch (err) {
    return errorOutcome("ensureCodebaseTable", err);
  }

  // Compute snapshot_sha256 the same way as snapshot.ts: canonical JSON over
  // the stable fields only (excludes observation).
  const snapshotSha256 = computeSnapshotSha256(snapshot);

  // SELECT existing row for this identity key.
  const tableId = sqlIdent(config.codebaseTableName);
  const repoSlug = snapshot.graph.repo_key;
  const userId = config.userName;
  const selectSql =
    `SELECT snapshot_sha256 FROM "${tableId}" WHERE ` +
    `org_id = '${sqlStr(config.orgId)}' AND ` +
    `workspace_id = '${sqlStr(config.workspaceId)}' AND ` +
    `repo_slug = '${sqlStr(repoSlug)}' AND ` +
    `user_id = '${sqlStr(userId)}' AND ` +
    `worktree_id = '${sqlStr(worktreeId)}' AND ` +
    `commit_sha = '${sqlStr(commitSha)}'`;

  let existing: Record<string, unknown>[];
  try {
    existing = await api.query(selectSql);
  } catch (err) {
    return errorOutcome("SELECT existing", err);
  }

  if (existing.length > 0) {
    const cloudSha = String(existing[0]!.snapshot_sha256 ?? "");
    if (cloudSha === snapshotSha256) {
      return { kind: "already-current", commitSha };
    }
    // Drift: same commit, different content. Don't overwrite.
    return {
      kind: "drift",
      commitSha,
      localSha256: snapshotSha256,
      cloudSha256: cloudSha,
    };
  }

  // INSERT a fresh row. snapshot_jsonb stores the canonical bytes — same
  // as what writeSnapshot writes to disk, ensuring server-side consumers
  // see byte-identical content to local readers.
  const canonical = canonicalJSON(snapshot);
  const observation = snapshot.observation;
  const insertSql =
    `INSERT INTO "${tableId}" (` +
    "org_id, workspace_id, repo_slug, user_id, worktree_id, commit_sha, " +
    "parent_sha, branch, ts, pushed_by, " +
    "snapshot_sha256, snapshot_jsonb, node_count, edge_count, " +
    "generator, generator_version, schema_version" +
    `) VALUES (` +
    `'${sqlStr(config.orgId)}', ` +
    `'${sqlStr(config.workspaceId)}', ` +
    `'${sqlStr(repoSlug)}', ` +
    `'${sqlStr(userId)}', ` +
    `'${sqlStr(worktreeId)}', ` +
    `'${sqlStr(commitSha)}', ` +
    `'', ` + // parent_sha intentionally empty — v1.1 populates from `git rev-parse HEAD~1`. NEVER reuse commit_sha here; consumers rely on this column reflecting the true parent.
    `'${sqlStr(observation.branch ?? "")}', ` +
    `'${sqlStr(observation.ts)}', ` +
    `'${sqlStr(userId)}', ` +
    `'${sqlStr(snapshotSha256)}', ` +
    `'${sqlStr(canonical)}', ` +
    `${snapshot.nodes.length}, ` +
    `${snapshot.links.length}, ` +
    `'${sqlStr(snapshot.graph.generator)}', ` +
    `'${sqlStr(observation.generator_version)}', ` +
    `${snapshot.graph.schema_version})`;

  try {
    await api.query(insertSql);
  } catch (err) {
    return errorOutcome("INSERT", err);
  }

  // Post-INSERT verification: the codebase table has no UNIQUE constraint on
  // the identity key (Deeplake doesn't expose one in this schema), so a
  // concurrent writer that also passed the SELECT-empty check could have
  // inserted a duplicate row. Re-SELECT and report if >1 row exists.
  // This does NOT prevent the race — it makes it observable. The proper
  // fix is a server-side UNIQUE constraint (v1.1 follow-up).
  try {
    const verify = await api.query(selectSql);
    if (verify.length > 1) {
      return { kind: "inserted-with-duplicate-race", commitSha, rowCount: verify.length };
    }
  } catch {
    // Verification failure does not affect the INSERT outcome — the row is
    // committed regardless. Log nothing here; the next push will re-check.
  }
  return { kind: "inserted", commitSha };
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

function errorOutcome(stage: string, err: unknown): PushOutcome {
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", message: `${stage}: ${message}` };
}

/**
 * Mirror of computeSnapshotSha256 from snapshot.ts — kept local to avoid a
 * cross-module dep that would pull writeSnapshot's I/O into the push path.
 * Both functions MUST produce identical bytes for the same input; covered
 * by tests/shared/graph/push.test.ts.
 */
function computeSnapshotSha256(snapshot: GraphSnapshot): string {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links,
  };
  return createHash("sha256").update(canonicalJSON(stable)).digest("hex");
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}
