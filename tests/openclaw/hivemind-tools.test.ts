import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests for the agent-facing tools registered by the openclaw
 * hivemind plugin:
 *   - hivemind_search / hivemind_read / hivemind_index (read-side)
 *   - hivemind_goal_add / hivemind_kpi_add          (write-side, team-shared
 *     goals + KPIs — openclaw can't intercept Write tool calls so it must
 *     expose explicit tools instead of the VFS Path A used by claude-code /
 *     codex; see PR #193 body, section "runtime intercept scope").
 *
 * Tests mock DeeplakeApi at the SQL-query boundary and assert that:
 *   1. read-side queries target BOTH memory + sessions tables
 *   2. write-side INSERTs into the goal/kpi tables under the expected shape
 */

const queryMock = vi.fn();
const listTablesMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const ensureTableMock = vi.fn();
const ensureGoalsTableMock = vi.fn();
const ensureKpisTableMock = vi.fn();
const loadConfigMock = vi.fn();
const loadCredsMock = vi.fn();
const handleGraphVfsMock = vi.fn();

vi.mock("../../src/graph/vfs-handler.js", () => ({
  handleGraphVfs: (...args: unknown[]) => handleGraphVfsMock(...args),
}));

vi.mock("../../src/config.js", () => ({ loadConfig: () => loadConfigMock() }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: () => loadCredsMock(),
  saveCredentials: vi.fn(),
  // openclaw's getApi() calls requestAuth() when loadConfig() returns null;
  // requestAuth uses requestDeviceCode().verification_uri_complete, so return
  // a stub shape rather than undefined to keep the auth path from crashing
  // the test ahead of the tool's "Not logged in" early-return.
  requestDeviceCode: vi.fn().mockResolvedValue({
    device_code: "dc",
    user_code: "uc",
    verification_uri: "http://example/auth",
    verification_uri_complete: "http://example/auth?code=uc",
    expires_in: 600,
    interval: 5,
  }),
  pollForToken: vi.fn().mockResolvedValue(null),
  listOrgs: vi.fn().mockResolvedValue([]),
  switchOrg: vi.fn(),
  listWorkspaces: vi.fn().mockResolvedValue([]),
  switchWorkspace: vi.fn(),
  healDriftedOrgToken: async (creds: unknown) => creds,
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    query(sql: string) { return queryMock(sql); }
    listTables() { return listTablesMock(); }
    ensureSessionsTable(n: string) { return ensureSessionsTableMock(n); }
    ensureTable() { return ensureTableMock(); }
    ensureGoalsTable(n: string) { return ensureGoalsTableMock(n); }
    ensureKpisTable(n: string) { return ensureKpisTableMock(n); }
  },
}));

type MockTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string | undefined,
    rawParams: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
};

async function loadPluginWithTools() {
  vi.resetModules();
  const mod = await import("../../harnesses/openclaw/src/index.js");
  const plugin = mod.default as { register: (api: any) => void };
  const tools: MockTool[] = [];
  const mockApi = {
    logger: { info: vi.fn(), error: vi.fn() },
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: (tool: MockTool) => { tools.push(tool); },
    registerMemoryCorpusSupplement: vi.fn(),
  };
  plugin.register(mockApi);
  return { plugin, tools, mockApi };
}

beforeEach(() => {
  queryMock.mockReset();
  handleGraphVfsMock.mockReset().mockReturnValue({ kind: "ok", body: "graph hit" });
  listTablesMock.mockReset().mockResolvedValue(["memory", "sessions"]);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  ensureTableMock.mockReset().mockResolvedValue(undefined);
  ensureGoalsTableMock.mockReset().mockResolvedValue(undefined);
  ensureKpisTableMock.mockReset().mockResolvedValue(undefined);
  loadCredsMock.mockReset().mockReturnValue({
    token: "tok", orgId: "o", orgName: "acme", userName: "alice",
  });
  loadConfigMock.mockReset().mockReturnValue({
    token: "tok",
    orgId: "o",
    orgName: "acme",
    userName: "alice",
    workspaceId: "hivemind",
    apiUrl: "http://example",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    goalsTableName: "hivemind_goals_test",
    kpisTableName: "hivemind_kpis_test",
    memoryPath: "/tmp/mem",
  });
});

describe("openclaw hivemind tools — registration", () => {
  it("registers read-side + write-side + graph hivemind tools when host exposes registerTool", async () => {
    const { tools } = await loadPluginWithTools();
    expect(tools.map(t => t.name).sort()).toEqual([
      "hivemind_goal_add",
      "hivemind_graph_neighborhood",
      "hivemind_graph_search",
      "hivemind_index",
      "hivemind_kpi_add",
      "hivemind_read",
      "hivemind_search",
    ]);
  });

  it("skips tool registration when host does not expose registerTool", async () => {
    vi.resetModules();
    const mod = await import("../../harnesses/openclaw/src/index.js");
    const plugin = mod.default as { register: (api: any) => void };
    let threw: unknown = null;
    try {
      plugin.register({
        logger: { info: vi.fn(), error: vi.fn() },
        on: vi.fn(),
        registerCommand: vi.fn(),
        // registerTool intentionally omitted
      });
    } catch (e) { threw = e; }
    expect(threw).toBeNull();
  });

  it("ensures BOTH memory and sessions tables exist on first API connect", async () => {
    // Regression: on an empty org/workspace, only ensureSessionsTable was being
    // called, so auto-recall and the three agent tools 400'd with
    // `relation "memory" does not exist` on the first query. The fix calls
    // ensureTable() alongside ensureSessionsTable() during getApi() init.
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    await search.execute("call-init", { query: "anything" });
    expect(ensureTableMock).toHaveBeenCalledTimes(1);
    expect(ensureSessionsTableMock).toHaveBeenCalledTimes(1);
  });

  it("injects SKILL.md body as prependSystemContext via before_prompt_build hook", async () => {
    // Openclaw's skill loader only injects <available_skills> (name +
    // description + location), not the body. Our openclaw agent has no
    // generic file-read tool, so the skill body never reaches the model
    // unless we prepend it ourselves. Verified by reading
    // ext/openclaw/src/agents/system-prompt.ts buildSkillsSection and
    // skills/skill-contract.ts formatSkillsForPrompt.
    (globalThis as any).__HIVEMIND_SKILL__ = "TEST_SKILL_BODY_CONTENT";
    (globalThis as any).__HIVEMIND_GRAPH_SKILL__ = "TEST_GRAPH_SKILL_BODY";
    try {
      vi.resetModules();
      const mod = await import("../../harnesses/openclaw/src/index.js");
      const plugin = mod.default as { register: (api: any) => void };
      const onMock = vi.fn();
      plugin.register({
        logger: { info: vi.fn(), error: vi.fn() },
        on: onMock,
        registerCommand: vi.fn(),
        registerTool: vi.fn(),
        registerMemoryCorpusSupplement: vi.fn(),
      });
      const registration = onMock.mock.calls.find(c => c[0] === "before_prompt_build");
      expect(registration).toBeDefined();
      const result = await registration![1]({});
      expect(result.prependSystemContext).toContain("TEST_SKILL_BODY_CONTENT");
      expect(result.prependSystemContext).toContain("<hivemind-skill>");
      expect(result.prependSystemContext).toContain("TEST_GRAPH_SKILL_BODY");
      expect(result.prependSystemContext).toContain("<hivemind-graph-skill>");
    } finally {
      delete (globalThis as any).__HIVEMIND_SKILL__;
      delete (globalThis as any).__HIVEMIND_GRAPH_SKILL__;
    }
  });

  it("registers memoryCorpusSupplement when host exposes it", async () => {
    const supplementMock = vi.fn();
    vi.resetModules();
    const mod = await import("../../harnesses/openclaw/src/index.js");
    const plugin = mod.default as { register: (api: any) => void };
    plugin.register({
      logger: { info: vi.fn(), error: vi.fn() },
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      registerMemoryCorpusSupplement: supplementMock,
    });
    expect(supplementMock).toHaveBeenCalledTimes(1);
    const arg = supplementMock.mock.calls[0][0];
    expect(typeof arg.search).toBe("function");
    expect(typeof arg.get).toBe("function");
  });
});

describe("hivemind_search", () => {
  it("issues a UNION ALL query across memory and sessions tables", async () => {
    queryMock.mockResolvedValue([
      { path: "/summaries/alice.md", content: "Levon is building the plugin", source_order: 0, creation_date: "2026-04-22" },
      { path: "/sessions/bob/abc.jsonl", content: "talked about Levon's PR", source_order: 1, creation_date: "2026-04-22" },
    ]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    const result = await search.execute("call-1", { query: "Levon" });

    expect(queryMock).toHaveBeenCalled();
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain('FROM "memory"');
    expect(sql).toContain('FROM "sessions"');
    expect(sql).toContain("UNION ALL");

    const text = result.content[0].text;
    expect(text).toContain("/summaries/alice.md");
    expect(text).toContain("/sessions/bob/abc.jsonl");
    expect((result.details as { hits: number }).hits).toBe(2);
  });

  it("uses multi-word OR filter when query has multiple tokens", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    await search.execute("call-2", { query: "Levon accuracy locomo" });
    const sql = queryMock.mock.calls[0][0];
    // multi-word LIKE clauses on both memory.summary::text AND sessions.message::text
    expect(sql).toMatch(/summary::text ILIKE '%levon%'/i);
    expect(sql).toMatch(/summary::text ILIKE '%accuracy%'/i);
    expect(sql).toMatch(/summary::text ILIKE '%locomo%'/i);
    expect(sql).toMatch(/message::text ILIKE '%levon%'/i);
    expect(sql).toMatch(/message::text ILIKE '%accuracy%'/i);
    expect(sql).toMatch(/message::text ILIKE '%locomo%'/i);
  });

  it("scopes to targetPath when path arg is provided", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    await search.execute("call-3", { query: "levon", path: "/summaries/" });
    const sql = queryMock.mock.calls[0][0];
    // builder emits an equality clause for the dir itself plus a LIKE for children
    expect(sql).toContain("path = '/summaries'");
    expect(sql).toContain("path LIKE '/summaries/%'");
  });

  it("returns 'No memory matches' on empty result set", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    const result = await search.execute("call-4", { query: "definitely-not-a-word" });
    expect(result.content[0].text).toContain("No memory matches");
  });

  it("returns a friendly error when DeeplakeApi throws", async () => {
    queryMock.mockRejectedValue(new Error("network down"));
    const { tools, mockApi } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    const result = await search.execute("call-5", { query: "x" });
    expect(result.content[0].text).toMatch(/Search failed/);
    expect(mockApi.logger.error).toHaveBeenCalled();
  });

  it("regex=true with non-literal pattern post-filters rows in memory", async () => {
    // `\d+` has no extractable literal prefilter and no alternation literals,
    // so buildGrepSearchOptions falls through to contentScanOnly with empty
    // filterPatterns and the SQL returns up-to-limit rows unfiltered. The
    // tool must still only hand back rows that actually match the regex.
    queryMock.mockResolvedValue([
      { path: "/summaries/has-digits.md", content: "ran 42 tests today", source_order: 0, creation_date: "" },
      { path: "/summaries/no-digits.md", content: "only letters here", source_order: 0, creation_date: "" },
      { path: "/sessions/x/y.jsonl", content: "version 1.2.3 shipped", source_order: 1, creation_date: "" },
    ]);
    const { tools } = await loadPluginWithTools();
    const search = tools.find(t => t.name === "hivemind_search")!;
    const result = await search.execute("call-regex", { query: "\\d+", regex: true });

    const text = result.content[0].text;
    expect(text).toContain("/summaries/has-digits.md");
    expect(text).toContain("/sessions/x/y.jsonl");
    expect(text).not.toContain("/summaries/no-digits.md");
    expect((result.details as { hits: number }).hits).toBe(2);
  });
});

describe("hivemind_read", () => {
  it("fetches content via the virtual-table read path (queries both tables)", async () => {
    queryMock.mockResolvedValue([
      { path: "/summaries/alice.md", content: "# session summary", source_order: 0 },
    ]);
    const { tools } = await loadPluginWithTools();
    const read = tools.find(t => t.name === "hivemind_read")!;
    const result = await read.execute("call-6", { path: "/summaries/alice.md" });

    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain('FROM "memory"');
    expect(sql).toContain('FROM "sessions"');
    expect(result.content[0].text).toBe("# session summary");
  });

  it("returns 'No content' when the path does not exist", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const read = tools.find(t => t.name === "hivemind_read")!;
    const result = await read.execute("call-7", { path: "/summaries/missing.md" });
    expect(result.content[0].text).toMatch(/No content/);
  });
});

describe("hivemind_index", () => {
  it("builds the memory index from both summary and session rows", async () => {
    queryMock
      // First call (inside readVirtualPathContents) looks for /index.md in both tables → empty.
      .mockResolvedValueOnce([])
      // Then the /index.md fallback path issues two queries for the index build.
      .mockResolvedValueOnce([
        { path: "/summaries/alice/abc.md", project: "openclaw-coexist", description: "Debugging hivemind coexistence", creation_date: "2026-04-22T12:00:00Z", last_update_date: "2026-04-22T12:30:00Z" },
      ])
      .mockResolvedValueOnce([
        { path: "/sessions/alice/alice_o_ws_xyz.jsonl", description: "Telegram session", creation_date: "2026-04-22T12:00:00Z", last_update_date: "2026-04-22T12:30:00Z" },
      ]);
    const { tools } = await loadPluginWithTools();
    const index = tools.find(t => t.name === "hivemind_index")!;
    const result = await index.execute(undefined, {});
    const text = result.content[0].text;
    expect(text).toContain("# Session Index");
    expect(text).toContain("## memory");
    expect(text).toContain("## sessions");
    expect(text).toContain("[abc](summaries/alice/abc.md)");
    expect(text).toContain("[alice_o_ws_xyz.jsonl](sessions/alice/alice_o_ws_xyz.jsonl)");
  });
});

describe("hivemind_goal_add (Path C — write-side via registered tool)", () => {
  it("INSERTs into the configured goals table with owner from config + opened status", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const goalAdd = tools.find(t => t.name === "hivemind_goal_add")!;
    const result = await goalAdd.execute("call-goal-1", { text: "ship the goals feature" });

    expect(ensureGoalsTableMock).toHaveBeenCalledWith("hivemind_goals_test");
    // ensure exactly one INSERT was issued; no chatty pre-SELECT or post-UPDATE
    const goalInserts = queryMock.mock.calls.filter(c => /INSERT INTO "hivemind_goals_test"/.test(c[0]));
    expect(goalInserts).toHaveLength(1);
    const sql = goalInserts[0][0] as string;

    // shape — must include the per-row uuid + goal_id + owner + status + content +
    // version + created_at + updated_at + agent + plugin_version columns in that order
    expect(sql).toMatch(/INSERT INTO "hivemind_goals_test" \(id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version\)/);
    // owner is the userName from the config mock
    expect(sql).toContain("'alice'");
    // status is hardcoded to 'opened' for new goals
    expect(sql).toContain("'opened'");
    // agent literal must be 'openclaw' so per-agent attribution works
    expect(sql).toContain("'openclaw'");
    // content must be E-prefixed (postgres escape-string literal — see CLI parity)
    expect(sql).toMatch(/E'ship the goals feature'/);

    // result echoes the generated goal_id back to the agent so it can use it
    // in a follow-up hivemind_kpi_add call
    const text = result.content[0].text;
    expect(text).toContain("Goal created");
    expect(text).toContain("owner: alice");
    expect((result.details as { goal_id: string }).goal_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns a friendly error and logs when the INSERT throws (e.g. table unreachable)", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));
    const { tools, mockApi } = await loadPluginWithTools();
    const goalAdd = tools.find(t => t.name === "hivemind_goal_add")!;
    const result = await goalAdd.execute("call-goal-2", { text: "broken goal" });
    expect(result.content[0].text).toMatch(/Goal add failed: connection refused/);
    expect(mockApi.logger.error).toHaveBeenCalled();
  });

  it("returns 'Not logged in' (no INSERT) when getApi() yields null because config is missing", async () => {
    loadConfigMock.mockReturnValue(null);
    const { tools } = await loadPluginWithTools();
    const goalAdd = tools.find(t => t.name === "hivemind_goal_add")!;
    const result = await goalAdd.execute("call-goal-3", { text: "x" });
    expect(result.content[0].text).toMatch(/Not logged in/);
    expect(queryMock).not.toHaveBeenCalled();
    expect(ensureGoalsTableMock).not.toHaveBeenCalled();
  });

  it("safely escapes single quotes in the goal text (SQL injection guard)", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const goalAdd = tools.find(t => t.name === "hivemind_goal_add")!;
    await goalAdd.execute("call-goal-4", { text: "Levon's goal" });
    const sql = (queryMock.mock.calls.find(c => /INSERT INTO/.test(c[0]))![0]) as string;
    // sqlStr() doubles the single quote: 'Levon''s goal'
    expect(sql).toContain("E'Levon''s goal'");
  });
});

describe("hivemind_kpi_add (Path C — write-side via registered tool)", () => {
  it("INSERTs into the configured KPIs table with content carrying name/target/unit", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const kpiAdd = tools.find(t => t.name === "hivemind_kpi_add")!;
    const result = await kpiAdd.execute("call-kpi-1", {
      goal_id: "11111111-2222-3333-4444-555555555555",
      kpi_id: "k-prs",
      target: 5,
      unit: "PRs",
      name: "Pull requests shipped",
    });

    expect(ensureKpisTableMock).toHaveBeenCalledWith("hivemind_kpis_test");
    const kpiInserts = queryMock.mock.calls.filter(c => /INSERT INTO "hivemind_kpis_test"/.test(c[0]));
    expect(kpiInserts).toHaveLength(1);
    const sql = kpiInserts[0][0] as string;

    expect(sql).toMatch(/INSERT INTO "hivemind_kpis_test" \(id, goal_id, kpi_id, content, version, created_at, updated_at, agent, plugin_version\)/);
    expect(sql).toContain("'11111111-2222-3333-4444-555555555555'");
    expect(sql).toContain("'k-prs'");
    expect(sql).toContain("'openclaw'");
    // content is a markdown body with target/current/unit lines — the source
    // builds it with real "\n" characters via template literals, so the SQL
    // text contains literal newlines (NOT backslash-n escape sequences).
    expect(sql).toContain("Pull requests shipped\n\n- target: 5\n- current: 0\n- unit: PRs");

    expect(result.content[0].text).toContain("KPI added");
    expect(result.content[0].text).toContain("target: 5 PRs");
  });

  it("defaults the human-readable name to kpi_id when name is omitted", async () => {
    queryMock.mockResolvedValue([]);
    const { tools } = await loadPluginWithTools();
    const kpiAdd = tools.find(t => t.name === "hivemind_kpi_add")!;
    await kpiAdd.execute("call-kpi-2", {
      goal_id: "abc", kpi_id: "k-noname", target: 1, unit: "count",
    });
    const sql = (queryMock.mock.calls.find(c => /INSERT INTO/.test(c[0]))![0]) as string;
    expect(sql).toContain("k-noname\n\n- target: 1\n- current: 0\n- unit: count");
  });

  it("returns a friendly error and logs when the INSERT throws", async () => {
    queryMock.mockRejectedValue(new Error("table missing"));
    const { tools, mockApi } = await loadPluginWithTools();
    const kpiAdd = tools.find(t => t.name === "hivemind_kpi_add")!;
    const result = await kpiAdd.execute("call-kpi-3", {
      goal_id: "g", kpi_id: "k", target: 1, unit: "x",
    });
    expect(result.content[0].text).toMatch(/KPI add failed: table missing/);
    expect(mockApi.logger.error).toHaveBeenCalled();
  });

  it("returns 'Not logged in' (no INSERT) when config is missing", async () => {
    loadConfigMock.mockReturnValue(null);
    const { tools } = await loadPluginWithTools();
    const kpiAdd = tools.find(t => t.name === "hivemind_kpi_add")!;
    const result = await kpiAdd.execute("call-kpi-4", {
      goal_id: "g", kpi_id: "k", target: 1, unit: "x",
    });
    expect(result.content[0].text).toMatch(/Not logged in/);
    expect(queryMock).not.toHaveBeenCalled();
    expect(ensureKpisTableMock).not.toHaveBeenCalled();
  });
});

describe("hivemind_graph_search", () => {
  it("queries graph/query/<pattern> via handleGraphVfs", async () => {
    const { tools } = await loadPluginWithTools();
    const graphSearch = tools.find(t => t.name === "hivemind_graph_search")!;
    const result = await graphSearch.execute("call-g1", { pattern: "pushSnapshot" });
    expect(handleGraphVfsMock).toHaveBeenCalledWith("query/pushSnapshot", expect.any(String));
    expect(result.content[0].text).toBe("graph hit");
  });
});

describe("hivemind_graph_neighborhood", () => {
  it("queries graph/neighborhood/<file> via handleGraphVfs", async () => {
    const { tools } = await loadPluginWithTools();
    const graphNb = tools.find(t => t.name === "hivemind_graph_neighborhood")!;
    const result = await graphNb.execute("call-g2", { file: "src/hooks/capture.ts" });
    expect(handleGraphVfsMock).toHaveBeenCalledWith(
      "neighborhood/src/hooks/capture.ts",
      expect.any(String),
    );
    expect(result.content[0].text).toBe("graph hit");
  });
});
