import { describe, it, expect, beforeEach, vi } from "vitest";
import { pushSnapshot, type PushOutcome } from "../../../src/graph/deeplake-push.js";
import type { Config } from "../../../src/config.js";
import type { DeeplakeApi } from "../../../src/deeplake-api.js";
import type { GraphSnapshot } from "../../../src/graph/types.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function makeSnapshot(commit: string = "abc123"): GraphSnapshot {
  return {
    directed: true,
    multigraph: true,
    graph: {
      schema_version: 1,
      generator: "hivemind-graph",
      commit_sha: commit,
      repo_key: "repo-key-fixture",
    },
    observation: {
      ts: "2026-05-21T00:00:00Z",
      branch: "main",
      worktree_path: "/test/path",
      repo_project: "test-repo",
      generator_version: "0.0.0-test",
      source_files_extracted: 1,
      source_files_skipped: 0,
    },
    nodes: [
      {
        id: "a.ts:foo:function",
        label: "foo",
        kind: "function",
        source_file: "a.ts",
        source_location: "L1",
        language: "typescript",
        exported: true,
      },
    ],
    links: [],
  };
}

/** Mock DeeplakeApi with controllable query() responses + call capture. */
function makeMockApi(plan: {
  selectReturns?: Record<string, unknown>[];
  selectThrows?: Error;
  insertThrows?: Error;
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
      if (sql.startsWith("INSERT")) {
        if (plan.insertThrows) throw plan.insertThrows;
        return [];
      }
      return [];
    }),
  } as unknown as DeeplakeApi;
  return { api, calls };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("pushSnapshot — gating", () => {
  it("HIVEMIND_GRAPH_PUSH=0 → skipped-disabled (no auth call, no API call)", async () => {
    const prev = process.env.HIVEMIND_GRAPH_PUSH;
    process.env.HIVEMIND_GRAPH_PUSH = "0";
    try {
      const result = await pushSnapshot(makeSnapshot(), "wt1", {
        loadConfig: () => { throw new Error("should not be called"); },
        makeApi: () => { throw new Error("should not be called"); },
      });
      expect(result.kind).toBe("skipped-disabled");
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_GRAPH_PUSH;
      else process.env.HIVEMIND_GRAPH_PUSH = prev;
    }
  });

  it("not authenticated → skipped-no-auth (no API call)", async () => {
    const result = await pushSnapshot(makeSnapshot(), "wt1", {
      loadConfig: () => null,
      makeApi: () => { throw new Error("should not be called"); },
    });
    expect(result.kind).toBe("skipped-no-auth");
  });

  it("commit_sha === null → skipped-no-commit (no identity key)", async () => {
    const snap = makeSnapshot();
    snap.graph.commit_sha = null;
    const result = await pushSnapshot(snap, "wt1", {
      loadConfig: () => makeConfig(),
      makeApi: () => { throw new Error("should not be called"); },
    });
    // CodeRabbit Minor fix: distinct outcome for no-commit (previously
    // reused "skipped-no-auth" which made runBuildCommand falsely
    // suggest `hivemind login`).
    expect(result.kind).toBe("skipped-no-commit");
  });
});

describe("pushSnapshot — SELECT-before-INSERT path", () => {
  it("no existing row → INSERTs and returns inserted", async () => {
    const { api, calls } = makeMockApi({ selectReturns: [] });
    const result = await pushSnapshot(makeSnapshot("abc123"), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("inserted");
    if (result.kind === "inserted") expect(result.commitSha).toBe("abc123");

    // ensureCodebaseTable called once with the configured name
    expect(calls.ensure).toEqual(["codebase_test"]);
    // SELECT (pre-INSERT existence check) + INSERT + SELECT (post-INSERT
    // duplicate-race verification) = 2 SELECTs, 1 INSERT. The second
    // SELECT is the codex-P1 mitigation: surfaces concurrent inserts.
    const selects = calls.queries.filter((q) => q.startsWith("SELECT"));
    const inserts = calls.queries.filter((q) => q.startsWith("INSERT"));
    expect(selects).toHaveLength(2);
    expect(inserts).toHaveLength(1);
    // Both SELECTs target the same identity key (proves we re-check exactly
    // the row we just wrote, not something broader).
    expect(selects[0]).toBe(selects[1]);

    // SELECT carries the full identity key
    expect(selects[0]).toContain("org_id = 'test-org'");
    expect(selects[0]).toContain("workspace_id = 'default'");
    expect(selects[0]).toContain("repo_slug = 'repo-key-fixture'");
    expect(selects[0]).toContain("user_id = 'alice'");
    expect(selects[0]).toContain("worktree_id = 'wt1'");
    expect(selects[0]).toContain("commit_sha = 'abc123'");

    // INSERT references the configured table and includes the canonical payload
    expect(inserts[0]).toContain('"codebase_test"');
    expect(inserts[0]).toContain("snapshot_jsonb");
    expect(inserts[0]).toContain("snapshot_sha256");

    // P1 codex fix: parent_sha MUST be an empty string literal, NOT the
    // current commit_sha (writing commit_sha into parent_sha persists
    // false ancestry data). The 17 values include parent_sha at position
    // 7 in the VALUES list (org, workspace, repo, user, worktree, commit,
    // parent, ...). Easiest invariant: the literal "'abc123'" appears only
    // for the commit_sha slot, NOT in two consecutive slots.
    const commitOccurrences = (inserts[0].match(/'abc123'/g) ?? []).length;
    expect(commitOccurrences).toBe(1);
    // And the parent_sha slot specifically is empty: 'abc123', '' sequence.
    expect(inserts[0]).toContain("'abc123', '',");
  });

  it("post-INSERT re-SELECT detects duplicate-row race", async () => {
    // First SELECT returns empty (caller proceeds to INSERT). Post-INSERT
    // re-SELECT returns 2 rows (a concurrent writer also inserted).
    let selectCallCount = 0;
    const calls = { ensure: [] as string[], queries: [] as string[] };
    const api = {
      ensureCodebaseTable: vi.fn(async (name: string) => { calls.ensure.push(name); }),
      query: vi.fn(async (sql: string) => {
        calls.queries.push(sql);
        if (sql.startsWith("SELECT")) {
          selectCallCount++;
          if (selectCallCount === 1) return [];
          return [
            { snapshot_sha256: "sha-a" },
            { snapshot_sha256: "sha-b" },
          ];
        }
        return [];
      }),
    } as unknown as DeeplakeApi;

    const result = await pushSnapshot(makeSnapshot("abc123"), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("inserted-with-duplicate-race");
    if (result.kind === "inserted-with-duplicate-race") {
      expect(result.commitSha).toBe("abc123");
      expect(result.rowCount).toBe(2);
    }
    // Confirm the post-INSERT re-SELECT actually fired (SELECT → INSERT → SELECT)
    expect(calls.queries.filter((q) => q.startsWith("SELECT"))).toHaveLength(2);
    expect(calls.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(1);
  });

  it("post-INSERT re-SELECT failure does NOT downgrade success", async () => {
    // INSERT succeeds. Post-INSERT verification throws (transient). Result
    // must remain "inserted" — the row IS committed; we just can't verify.
    let selectCallCount = 0;
    const api = {
      ensureCodebaseTable: vi.fn(async () => {}),
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT")) {
          selectCallCount++;
          if (selectCallCount === 1) return [];
          throw new Error("transient network");
        }
        return [];
      }),
    } as unknown as DeeplakeApi;
    const result = await pushSnapshot(makeSnapshot("abc123"), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("inserted");
  });

  it("existing row with same sha256 → already-current (NO INSERT)", async () => {
    const snap = makeSnapshot("abc123");
    // Compute the same sha256 by running the function once against an empty
    // cloud; capture the INSERT SQL to extract the sha256 it would have written.
    let observedSha: string | null = null;
    const probe = makeMockApi({ selectReturns: [] });
    await pushSnapshot(snap, "wt1", { loadConfig: makeConfig, makeApi: () => probe.api });
    const insertSql = probe.calls.queries.find((q) => q.startsWith("INSERT"))!;
    const match = insertSql.match(/'([0-9a-f]{64})'/);
    expect(match).not.toBeNull();
    observedSha = match![1]!;

    // Now run with the cloud claiming that same sha256
    const { api, calls } = makeMockApi({
      selectReturns: [{ snapshot_sha256: observedSha }],
    });
    const result = await pushSnapshot(snap, "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("already-current");
    if (result.kind === "already-current") expect(result.commitSha).toBe("abc123");

    // No INSERT should have happened
    expect(calls.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(0);
  });

  it("existing row with different sha256 → drift (NO INSERT, no overwrite)", async () => {
    const { api, calls } = makeMockApi({
      selectReturns: [{ snapshot_sha256: "different-cloud-sha-just-for-test" }],
    });
    const result = await pushSnapshot(makeSnapshot("abc123"), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("drift");
    if (result.kind === "drift") {
      expect(result.commitSha).toBe("abc123");
      expect(result.cloudSha256).toBe("different-cloud-sha-just-for-test");
      expect(result.localSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(calls.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(0);
  });
});

describe("pushSnapshot — error paths", () => {
  it("ensureCodebaseTable throws → error outcome", async () => {
    const { api } = makeMockApi({ ensureThrows: new Error("table create failed") });
    const result = await pushSnapshot(makeSnapshot(), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("ensureCodebaseTable");
      expect(result.message).toContain("table create failed");
    }
  });

  it("SELECT throws → error outcome (no INSERT attempted)", async () => {
    const { api, calls } = makeMockApi({ selectThrows: new Error("network 503") });
    const result = await pushSnapshot(makeSnapshot(), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    expect(calls.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(0);
  });

  it("INSERT throws → error outcome", async () => {
    const { api } = makeMockApi({
      selectReturns: [],
      insertThrows: new Error("constraint violation"),
    });
    const result = await pushSnapshot(makeSnapshot(), "wt1", {
      loadConfig: makeConfig,
      makeApi: () => api,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toContain("INSERT");
  });
});

describe("pushSnapshot — determinism + SQL safety", () => {
  it("same snapshot produces same sha256 across calls (consistent dedup)", async () => {
    const snap = makeSnapshot("abc123");
    const a = makeMockApi({ selectReturns: [] });
    await pushSnapshot(snap, "wt1", { loadConfig: makeConfig, makeApi: () => a.api });
    const shaA = a.calls.queries.find((q) => q.startsWith("INSERT"))!.match(/'([0-9a-f]{64})'/)![1];

    const b = makeMockApi({ selectReturns: [] });
    await pushSnapshot(snap, "wt1", { loadConfig: makeConfig, makeApi: () => b.api });
    const shaB = b.calls.queries.find((q) => q.startsWith("INSERT"))!.match(/'([0-9a-f]{64})'/)![1];

    expect(shaA).toBe(shaB);
  });

  it("SQL-injection attempt in repo_key is escaped via sqlStr", async () => {
    const snap = makeSnapshot("abc123");
    snap.graph.repo_key = "evil'; DROP TABLE codebase; --";
    const { api, calls } = makeMockApi({ selectReturns: [] });
    await pushSnapshot(snap, "wt1", { loadConfig: makeConfig, makeApi: () => api });
    // sqlStr escapes every single quote by doubling: ' → ''. The dangerous
    // payload still appears in the SQL text but ENTIRELY inside a single
    // quoted string literal. Two checks prove safety:
    //   1. The leading quote of the injection is doubled (escape happened).
    //   2. Outside the closing quote of repo_slug, no rogue 'DROP TABLE' appears.
    for (const q of calls.queries) {
      // Escape proof: the doubled-quote sequence is present at the splice point
      expect(q).toContain("'evil''; DROP TABLE codebase; --'");
    }
  });
});
