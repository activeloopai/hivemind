import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pullSnapshot } from "../../../src/graph/deeplake-pull.js";
import type { Config } from "../../../src/config.js";
import type { DeeplakeApi } from "../../../src/deeplake-api.js";
import { writeLastBuild, readLastBuild } from "../../../src/graph/last-build.js";
import { canonicalSnapshot, computeSnapshotSha256, repoDir } from "../../../src/graph/snapshot.js";
import type { GraphSnapshot } from "../../../src/graph/types.js";
import { deriveProjectKey } from "../../../src/utils/repo-identity.js";

/** Mirror of workTreeIdFor in src/commands/graph.ts and elsewhere. */
function worktreeIdFromCwd(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function makeConfig(): Config {
  return {
    token: "tok",
    orgId: "test-org",
    orgName: "test",
    userName: "alice",
    workspaceId: "default",
    apiUrl: "https://api.example",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    rulesTableName: "hivemind_rules",
    goalsTableName: "hivemind_goals",
    kpisTableName: "hivemind_kpis",
    docsTableName: "hivemind_docs",
    codebaseTableName: "codebase_test",
    memoryPath: "/tmp/mem",
  };
}

/**
 * Realistic snapshot fixture — built through the SAME functions push uses
 * (canonicalSnapshot / computeSnapshotSha256, see src/graph/snapshot.ts).
 *
 * Critical: the payload INCLUDES `observation`, but the sha256 column EXCLUDES
 * it by contract (computeSnapshotSha256 hashes only the stable fields). The
 * earlier fixture omitted `observation` entirely and hashed the raw payload
 * bytes — that hid the production bug where pull was comparing the column
 * value (stable-only hash) against a hash of the full payload (which always
 * included observation), causing every real cloud row to be rejected as
 * "snapshot_sha256 mismatch".
 */
const FIXTURE_SNAPSHOT: GraphSnapshot = {
  directed: true,
  multigraph: true,
  graph: {
    schema_version: 1,
    generator: "hivemind-graph",
    commit_sha: "head1234abcd",
    repo_key: "k",
  },
  observation: {
    ts: "2026-06-02T00:00:00.000Z",
    branch: "main",
    worktree_path: "/tmp/wt-fixture",
    repo_project: "test",
    generator_version: "0.0.0-test",
    source_files_extracted: 1,
    source_files_skipped: 0,
  },
  nodes: [{
    id: "a.ts:foo:function",
    label: "foo",
    kind: "function",
    source_file: "a.ts",
    source_location: "L1",
    language: "typescript",
    exported: false,
  }],
  links: [],
};

const CLOUD_PAYLOAD = canonicalSnapshot(FIXTURE_SNAPSHOT);
const CLOUD_PAYLOAD_SHA = computeSnapshotSha256(FIXTURE_SNAPSHOT);

/**
 * Mock DeeplakeApi: captures every SQL string and returns a configured row
 * (or empty / throws) for SELECT, no-op for everything else.
 */
function makeMockApi(plan: {
  selectReturns?: Record<string, unknown>[];
  selectThrows?: Error;
  ensureThrows?: Error;
}): { api: DeeplakeApi; calls: { ensure: string[]; queries: string[] } } {
  const calls = { ensure: [] as string[], queries: [] as string[] };
  const api = {
    ensureCodebaseTable: vi.fn(async (name: string) => {
      calls.ensure.push(name);
      if (plan.ensureThrows) throw plan.ensureThrows;
    }),
    query: vi.fn(async (sql: string) => {
      calls.queries.push(sql);
      if (sql.startsWith("SELECT")) {
        if (plan.selectThrows) throw plan.selectThrows;
        return plan.selectReturns ?? [];
      }
      return [];
    }),
  } as unknown as DeeplakeApi;
  return { api, calls };
}

describe("pullSnapshot — gating", () => {
  let tmpCwd: string;

  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), "pull-gating-"));
  });
  afterEach(() => {
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
  });

  it("HIVEMIND_GRAPH_PULL=0 → skipped-disabled (no auth call, no api call)", async () => {
    const prev = process.env.HIVEMIND_GRAPH_PULL;
    process.env.HIVEMIND_GRAPH_PULL = "0";
    try {
      const result = await pullSnapshot(tmpCwd, {
        loadConfig: () => { throw new Error("must not be called"); },
        makeApi: () => { throw new Error("must not be called"); },
        readHead: () => { throw new Error("must not be called"); },
      });
      expect(result.kind).toBe("skipped-disabled");
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_GRAPH_PULL;
      else process.env.HIVEMIND_GRAPH_PULL = prev;
    }
  });

  it("no auth → skipped-no-auth", async () => {
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: () => null,
      makeApi: () => { throw new Error("must not be called"); },
      readHead: () => { throw new Error("must not be called"); },
    });
    expect(result.kind).toBe("skipped-no-auth");
  });

  it("git rev-parse HEAD fails → skipped-no-head", async () => {
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => null, // simulates "not in a git repo"
      makeApi: () => { throw new Error("must not be called"); },
    });
    expect(result.kind).toBe("skipped-no-head");
  });
});

describe("pullSnapshot — SELECT shape (cross-worktree pull identity)", () => {
  let tmpCwd: string;
  beforeEach(() => { tmpCwd = mkdtempSync(join(tmpdir(), "pull-where-")); });
  afterEach(() => { try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {} });

  it("SELECT has 5-key WHERE — NO worktree_id (codex P0: cross-worktree pull)", async () => {
    const { api, calls } = makeMockApi({ selectReturns: [] });
    await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    const select = calls.queries.find((q) => q.startsWith("SELECT"))!;
    expect(select).toContain("org_id = 'test-org'");
    expect(select).toContain("workspace_id = 'default'");
    expect(select).toContain("user_id = 'alice'");
    expect(select).toContain("commit_sha = 'head1234abcd'");
    expect(select).toContain("ORDER BY ts DESC LIMIT 1");
    // Critical: NO worktree_id in WHERE — otherwise pull can't find rows
    // written by other worktrees of the same project.
    expect(select).not.toMatch(/worktree_id\s*=/);
  });

  it("targets the configured table name (codebase_test in this fixture)", async () => {
    const { api, calls } = makeMockApi({ selectReturns: [] });
    await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(calls.queries[0]).toContain('"codebase_test"');
    expect(calls.ensure).toEqual(["codebase_test"]);
  });
});

describe("pullSnapshot — outcome resolution", () => {
  let tmpCwd: string;
  let baseDir: string;

  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), "pull-outcome-"));
    const { key } = deriveProjectKey(tmpCwd);
    baseDir = repoDir(key);
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });
  afterEach(() => {
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  it("no rows in cloud → no-cloud-row", async () => {
    const { api } = makeMockApi({ selectReturns: [] });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("no-cloud-row");
    if (result.kind === "no-cloud-row") expect(result.commitSha).toBe("head1234abcd");
  });

  it("local sha256 matches cloud sha256 → up-to-date (NO files written)", async () => {
    mkdirSync(baseDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: 1_000_000,
      commit_sha: "head1234abcd",
      // Local sha MUST match cloud sha (which now MUST match the real
      // hash of CLOUD_PAYLOAD per the post-CodeRabbit validation).
      snapshot_sha256: CLOUD_PAYLOAD_SHA,
      node_count: 1,
      edge_count: 0,
    });
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: "2026-05-21T00:00:00Z",
        node_count: 1, edge_count: 0,
        worktree_id: "remote-wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("up-to-date");
    // No snapshot file created (we didn't write anything)
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(false);
  });

  it("local ts > cloud ts → local-newer (NO overwrite)", async () => {
    mkdirSync(baseDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: 2_000_000_000_000,  // year 2033 in epoch ms
      commit_sha: "head1234abcd",
      snapshot_sha256: "different-local-sha",
      node_count: 1,
      edge_count: 0,
    });
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        // Cloud sha matches payload (post-CodeRabbit validation gate);
        // the divergence we care about for this test is LOCAL vs CLOUD,
        // and local was set to a different sha above.
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: "2026-01-01T00:00:00Z",  // older than local
        node_count: 1, edge_count: 0,
        worktree_id: "remote-wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("local-newer");
    if (result.kind === "local-newer") {
      expect(result.commitSha).toBe("head1234abcd");
      expect(result.localTs).toBe(2_000_000_000_000);
      expect(result.cloudTs).toBeLessThan(result.localTs);
    }
    // No file written
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(false);
  });

  it("local missing → pulls (creates snapshot file + sidecars + history entry)", async () => {
    const cloudSha = CLOUD_PAYLOAD_SHA;
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: cloudSha,
        ts: 1_700_000_000_000,
        node_count: 1, edge_count: 0,
        branch: "main",
        generator_version: "0.0.0-test",
        worktree_id: "remote-wt-abcdef",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
    if (result.kind === "pulled") {
      expect(result.commitSha).toBe("head1234abcd");
      expect(result.snapshotSha256).toBe(cloudSha);
      expect(result.bytes).toBeGreaterThan(0);
      expect(result.cloudTs).toBe(1_700_000_000_000);
    }
    // Snapshot file IS the cloud payload, byte-identical
    const snapshotPath = join(baseDir, "snapshots", "head1234abcd.json");
    expect(existsSync(snapshotPath)).toBe(true);
    expect(readFileSync(snapshotPath, "utf8")).toBe(CLOUD_PAYLOAD);
    // latest-commit.txt updated (now per-worktree, under worktrees/<id>/)
    const wt = worktreeIdFromCwd(tmpCwd);
    expect(readFileSync(join(baseDir, "worktrees", wt, "latest-commit.txt"), "utf8").trim()).toBe("head1234abcd");
    // .last-build.json mirrors cloud metadata (per-worktree)
    const lb = readLastBuild(baseDir, wt);
    expect(lb).not.toBeNull();
    expect(lb!.commit_sha).toBe("head1234abcd");
    expect(lb!.snapshot_sha256).toBe(cloudSha);
    expect(lb!.ts).toBe(1_700_000_000_000);
    expect(lb!.node_count).toBe(1);
    expect(lb!.edge_count).toBe(0);
    // history.jsonl has a "pull" trigger entry
    const historyText = readFileSync(join(baseDir, "history.jsonl"), "utf8");
    const lastLine = historyText.trim().split("\n").pop()!;
    const parsed = JSON.parse(lastLine);
    expect(parsed.trigger).toBe("pull");
    expect(parsed.commit_sha).toBe("head1234abcd");
  });

  it("codex P1 regression: local sidecar points at a DIFFERENT commit → ignored, pull proceeds", async () => {
    // Scenario from codex review:
    //   1. User built commit B locally (ts=2_000_000_000_000)
    //   2. User checked out commit A (older)
    //   3. HEAD = A. snapshots/A.json doesn't exist locally.
    //   4. Cloud has commit A at ts=1_000_000_000_000 (older than local's
    //      record for B, but A is what we're asking about)
    // Buggy old behavior: local.ts > cloud.ts → "local-newer", refuse to
    // pull, leave A unavailable.
    // Fixed behavior: local.commit_sha (B) != head (A) → ignore the local
    // sidecar's ts entirely, fall through to pull.
    mkdirSync(baseDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: 2_000_000_000_000,
      commit_sha: "different-commit-B",
      snapshot_sha256: "sha-for-B",
      node_count: 1,
      edge_count: 0,
    });
    const cloudSha = CLOUD_PAYLOAD_SHA;
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: cloudSha,
        ts: 1_000_000_000_000,
        node_count: 7, edge_count: 3,
        worktree_id: "remote-wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd", // HEAD = A, NOT B
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
    // After pull: snapshot file for A exists, last-build now points at A
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(true);
    const lb = readLastBuild(baseDir, worktreeIdFromCwd(tmpCwd));
    expect(lb!.commit_sha).toBe("head1234abcd");
    expect(lb!.snapshot_sha256).toBe(cloudSha);
  });

  it("local sha256 matches cloud sha256 but for a DIFFERENT commit → pull anyway", async () => {
    // Defensive: sha collisions across different commits would be astronomic
    // but the gate must be commit-keyed, not sha-keyed. If local says "I have
    // sha X for commit B" and cloud says "commit A has sha X" — those are
    // unrelated facts; we should still pull A.
    mkdirSync(baseDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: 1_000_000,
      commit_sha: "commit-B",
      snapshot_sha256: "a".repeat(64),
      node_count: 1,
      edge_count: 0,
    });
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        // Cloud sha must match payload bytes (CodeRabbit validation gate).
        // The "collision" we model is between this cloud sha and a local
        // sha that happens to be identical — the test asserts that the
        // commit_sha mismatch, NOT the sha equality, governs the gate.
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: 2_000_000,
        node_count: 7, edge_count: 3,
        worktree_id: "remote-wt",
      }],
    });
    // Make local sha "collide" with cloud sha for the collision-scenario
    // (we model the impossible case to assert the gate isn't sha-keyed).
    writeLastBuild(baseDir, {
      ts: 1_000_000,
      commit_sha: "commit-B",
      snapshot_sha256: CLOUD_PAYLOAD_SHA,
      node_count: 1,
      edge_count: 0,
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "commit-A", // != local.commit_sha
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
  });

  it("local present but cloud has newer ts → pulls (overwrites local)", async () => {
    mkdirSync(baseDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: 1_000_000_000_000,
      commit_sha: "head1234abcd",
      snapshot_sha256: "old-local-sha",
      node_count: 99,
      edge_count: 99,
    });
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: 2_000_000_000_000, // newer
        node_count: 5, edge_count: 7,
        worktree_id: "remote-wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
    // .last-build.json now reflects cloud state (per-worktree path)
    const lb = readLastBuild(baseDir, worktreeIdFromCwd(tmpCwd));
    expect(lb!.ts).toBe(2_000_000_000_000);
    expect(lb!.snapshot_sha256).toBe(CLOUD_PAYLOAD_SHA);
    expect(lb!.node_count).toBe(5);
  });
});

describe("pullSnapshot — error paths", () => {
  let tmpCwd: string;
  let baseDir: string;
  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), "pull-errors-"));
    const { key } = deriveProjectKey(tmpCwd);
    baseDir = repoDir(key);
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });
  afterEach(() => {
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  it("ensureCodebaseTable throws → error outcome (no files written)", async () => {
    const { api } = makeMockApi({ ensureThrows: new Error("table create failed") });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("ensureCodebaseTable");
      expect(result.message).toContain("table create failed");
    }
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(false);
  });

  it("SELECT throws → error outcome (no files written)", async () => {
    const { api } = makeMockApi({ selectThrows: new Error("network 503") });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(false);
  });

  // CodeRabbit: a cloud snapshot_jsonb holding the literal string "null"
  // JSON.parses to `null`. Without the non-object guard, `null.nodes` throws
  // TypeError (uncaught) instead of returning the documented error outcome.
  it("snapshot_jsonb is the string 'null' → error outcome (no throw, no files)", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: "null",
        snapshot_sha256: "whatever",
        ts: "2026-05-21T00:00:00Z",
        node_count: 0, edge_count: 0,
        worktree_id: "remote-wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toContain("snapshot not an object");
    expect(existsSync(join(baseDir, "snapshots", "head1234abcd.json"))).toBe(false);
  });
});

describe("pullSnapshot — ts coercion", () => {
  let tmpCwd: string;
  beforeEach(() => { tmpCwd = mkdtempSync(join(tmpdir(), "pull-ts-")); });
  afterEach(() => { try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {} });

  it("ISO string ts → parsed as epoch ms", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: "2026-05-21T00:00:00.000Z",
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
    if (result.kind === "pulled") {
      // Date.parse("2026-05-21T00:00:00.000Z") === 1779408000000
      expect(result.cloudTs).toBe(Date.parse("2026-05-21T00:00:00.000Z"));
    }
  });

  it("epoch ms number ts → kept as-is", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: 1_700_000_000_000,
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    // CodeRabbit Minor: assert outcome kind FIRST so a non-pulled result
    // doesn't silently pass the conditional cloudTs check.
    expect(result.kind).toBe("pulled");
    if (result.kind === "pulled") expect(result.cloudTs).toBe(1_700_000_000_000);
  });

  it("epoch seconds number → coerced to ms (× 1000)", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: 1_700_000_000, // 10-digit = seconds
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    // CodeRabbit Minor: assert outcome kind FIRST so a non-pulled result
    // doesn't silently pass the conditional cloudTs check.
    expect(result.kind).toBe("pulled");
    if (result.kind === "pulled") expect(result.cloudTs).toBe(1_700_000_000_000);
  });

  it("unparseable ts → treated as 0, still pulls", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA,
        ts: "not-a-date",
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("pulled");
    if (result.kind === "pulled") expect(result.cloudTs).toBe(0);
  });
});

describe("pullSnapshot — hash verification (regression: stable vs full payload)", () => {
  let tmpCwd: string;

  beforeEach(() => {
    tmpCwd = mkdtempSync(join(tmpdir(), "pull-hashverify-"));
  });
  afterEach(() => {
    try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
  });

  // Documents the divergence the bug fix targets: by contract the column
  // value is the *stable-field* hash (observation excluded) while the
  // payload bytes intentionally include observation. Confirming both
  // numerically here keeps the regression honest — a future "fix" that
  // collapses the two would change one of these and the test fails.
  it("column sha (stable fields) != raw-payload sha (full bytes)", () => {
    const stable = computeSnapshotSha256(FIXTURE_SNAPSHOT);
    const fullPayloadHash = createHash("sha256").update(CLOUD_PAYLOAD).digest("hex");
    expect(stable).not.toBe(fullPayloadHash);
    // CLOUD_PAYLOAD_SHA in the fixture mirrors push: it MUST be the stable hash.
    expect(CLOUD_PAYLOAD_SHA).toBe(stable);
  });

  it("accepts a row whose column sha is the stable-field hash (the real push contract)", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: CLOUD_PAYLOAD,
        snapshot_sha256: CLOUD_PAYLOAD_SHA, // stable-field hash, as push writes
        ts: 1_700_000_000_000,
        node_count: 1, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    // BEFORE the fix this returned `error` with "snapshot_sha256 mismatch"
    // because pull was hashing the full payload and comparing to the
    // column's stable-only hash.
    expect(result.kind).toBe("pulled");
  });

  it("rejects a tampered payload whose stable fields don't match the claimed sha", async () => {
    // Same column value, but the payload has been altered (extra node added
    // post-push). The stable-field hash of the parsed payload won't match
    // the column → pull must refuse rather than persist a corrupt snapshot.
    const tampered: GraphSnapshot = {
      ...FIXTURE_SNAPSHOT,
      nodes: [
        ...FIXTURE_SNAPSHOT.nodes,
        {
          id: "a.ts:bar:function",
          label: "bar",
          kind: "function",
          source_file: "a.ts",
          source_location: "L2",
          language: "typescript",
          exported: false,
        },
      ],
    };
    const tamperedPayload = canonicalSnapshot(tampered);
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: tamperedPayload,
        snapshot_sha256: CLOUD_PAYLOAD_SHA, // claims the ORIGINAL sha
        ts: 1_700_000_000_000,
        node_count: 1, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/snapshot_sha256 mismatch/);
    }
  });

  it("rejects a payload that doesn't parse as JSON", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: "{not valid json",
        snapshot_sha256: "a".repeat(64),
        ts: 1_700_000_000_000,
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/parse cloud snapshot/);
    }
  });

  it("rejects a payload that parses but is missing nodes/links arrays", async () => {
    const { api } = makeMockApi({
      selectReturns: [{
        snapshot_jsonb: JSON.stringify({ directed: true, multigraph: true, graph: {}, observation: {} }),
        snapshot_sha256: "a".repeat(64),
        ts: 1_700_000_000_000,
        node_count: 0, edge_count: 0,
        worktree_id: "wt",
      }],
    });
    const result = await pullSnapshot(tmpCwd, {
      loadConfig: makeConfig,
      readHead: () => "head1234abcd",
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/missing nodes\/links/);
    }
  });
});
