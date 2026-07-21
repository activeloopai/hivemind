import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stdinMock = vi.fn();
const loadConfigMock = vi.fn();
const loadCredentialsMock = vi.fn();
const debugLogMock = vi.fn();
const queryMock = vi.fn();
const ensureTableMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const consoleLogMock = vi.fn();
const getInstalledVersionMock = vi.fn();
const autoUpdateMock = vi.fn();
const localManifestMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: unknown[]) => stdinMock(...a) }));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: unknown[]) => loadConfigMock(...a) }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: (...a: unknown[]) => loadCredentialsMock(...a),
  healDriftedOrgToken: async (creds: unknown) => creds,
}));
vi.mock("../../src/utils/debug.js", () => ({ log: (_tag: string, msg: string) => debugLogMock(msg) }));
vi.mock("../../src/utils/version-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/version-check.js")>();
  return { ...actual, getInstalledVersion: (...a: unknown[]) => getInstalledVersionMock(...a) };
});
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    query(sql: string) { return queryMock(sql); }
    ensureTable() { return ensureTableMock(); }
    ensureSessionsTable(t: string) { return ensureSessionsTableMock(t); }
    async knownTablesOrNull() { return null; }
  },
}));
// autoUpdate mocked at the boundary — exhaustively tested in
// autoupdate.test.ts. Cursor's session-start just needs to fire it
// once with agent: "cursor".
vi.mock("../../src/hooks/shared/autoupdate.js", () => ({
  autoUpdate: (...a: unknown[]) => autoUpdateMock(...a),
}));
vi.mock("../../src/skillify/local-manifest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skillify/local-manifest.js")>();
  return {
    ...actual,
    countLocalManifestEntries: (...a: unknown[]) => localManifestMock(...a),
  };
});

const validConfig = {
  token: "t", apiUrl: "http://example", orgId: "o", orgName: "acme",
  workspaceId: "default", userName: "alice",
  tableName: "memory", sessionsTableName: "sessions",
  // T6 fields — needed so the renderer's sqlIdent doesn't render
  // FROM "undefined" when the mock loadConfig is consulted.
  rulesTableName: "hivemind_rules",
  goalsTableName: "hivemind_goals",
  skillsTableName: "skills",
};

async function runHook(env: Record<string, string | undefined> = {}): Promise<void> {
  delete process.env.HIVEMIND_CAPTURE;
  delete process.env.HIVEMIND_WIKI_WORKER;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  await import("../../src/hooks/cursor/session-start.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  stdinMock.mockReset().mockResolvedValue({ session_id: "sid-1", workspace_roots: ["/tmp/proj"] });
  loadConfigMock.mockReset().mockReturnValue(validConfig);
  loadCredentialsMock.mockReset().mockReturnValue({ token: "t", orgName: "acme", workspaceId: "default" });
  debugLogMock.mockReset();
  queryMock.mockReset().mockResolvedValue([]);
  ensureTableMock.mockReset().mockResolvedValue(undefined);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  consoleLogMock.mockReset();
  getInstalledVersionMock.mockReset().mockReturnValue("0.7.0");
  autoUpdateMock.mockReset().mockResolvedValue(undefined);
  localManifestMock.mockReset().mockReturnValue(0);
  vi.spyOn(console, "log").mockImplementation(((s: string) => { consoleLogMock(s); }) as any);
  // Disable auto-pull during this test: autoPullSkills would otherwise issue
  // a third SQL query (against `skills`) through the same DeeplakeApi mock,
  // breaking call-count assertions. The auto-pull module's behaviour is
  // covered exhaustively in skillify-auto-pull.test.ts, so the hook tests
  // never need it active.
  process.env.HIVEMIND_AUTOPULL_DISABLED = "1";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HIVEMIND_AUTOPULL_DISABLED;
});

describe("cursor session-start hook — guards", () => {
  it("HIVEMIND_WIKI_WORKER=1 → no stdin read, no console output", async () => {
    await runHook({ HIVEMIND_WIKI_WORKER: "1" });
    expect(stdinMock).not.toHaveBeenCalled();
    expect(consoleLogMock).not.toHaveBeenCalled();
  });
});

describe("cursor session-start hook — placeholder creation", () => {
  it("calls ensureTable + ensureSessionsTable + INSERT when no placeholder exists", async () => {
    queryMock.mockResolvedValueOnce([]); // SELECT path returns empty (no placeholder yet)
    queryMock.mockResolvedValueOnce([]); // INSERT
    await runHook();
    expect(ensureTableMock).toHaveBeenCalledTimes(1);
    expect(ensureSessionsTableMock).toHaveBeenCalledTimes(1);
    // 2 placeholder + 1 renderer (rules only) = 3.
    expect(queryMock).toHaveBeenCalledTimes(4);
    const insertSql = queryMock.mock.calls[1][0] as string;
    expect(insertSql).toMatch(/INSERT INTO "memory"/);
    expect(insertSql).toContain("'cursor'");
    expect(insertSql).toContain("/summaries/alice/sid-1.md");
  });

  it("skips INSERT when placeholder already exists", async () => {
    queryMock.mockResolvedValueOnce([{ path: "/summaries/alice/sid-1.md" }]);
    await runHook();
    // 1 placeholder SELECT + 1 renderer (rules only) = 2.
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("HIVEMIND_CAPTURE=false: no placeholder, no DDL ensure, but renderer still runs (codex P2 pass 2 + pass 4)", async () => {
    // HIVEMIND_CAPTURE=false means full read-only mode. ensureTable
    // and ensureSessionsTable are DDL writes (create/heal), so they
    // are gated together with the placeholder INSERT. The renderer
    // is read-only and runs unconditionally.
    await runHook({ HIVEMIND_CAPTURE: "false" });
    expect(ensureTableMock).not.toHaveBeenCalled();
    expect(ensureSessionsTableMock).not.toHaveBeenCalled();
    // 2 renderer SELECTs (rules + goals).
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT .* FROM "hivemind_rules"/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^SELECT .* FROM "hivemind_goals"/);
  });

  it("skips placeholder when no token in credentials", async () => {
    loadCredentialsMock.mockReturnValue(null);
    await runHook();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("placeholder DB error is swallowed and logged (does not crash the hook)", async () => {
    queryMock.mockRejectedValue(new Error("network down"));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("placeholder failed"));
    // additional_context is still emitted to stdout.
    expect(consoleLogMock).toHaveBeenCalled();
  });
});

describe("cursor session-start hook — additional_context payload", () => {
  it("logged-in branch: includes 'Logged in to Deeplake' line plus the version notice", async () => {
    await runHook();
    const json = consoleLogMock.mock.calls[0][0] as string;
    const payload = JSON.parse(json);
    expect(payload.additional_context).toContain("DEEPLAKE MEMORY");
    expect(payload.additional_context).toContain("Logged in to Deeplake as org: acme");
    expect(payload.additional_context).toContain("Hivemind v0.7.0");
  });

  it("not-logged-in branch: tells the user to run `hivemind login`", async () => {
    loadCredentialsMock.mockReturnValue(null);
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).toContain("Not logged in to Deeplake");
    // Inject text uses the bare `hivemind <sub>` form (requires npm bin in PATH).
    expect(payload.additional_context).toContain("hivemind login");
  });

  it("falls back to orgId in the org-line when orgName is missing", async () => {
    loadCredentialsMock.mockReturnValue({ token: "t", orgId: "o-99" });
    loadConfigMock.mockReturnValue({ ...validConfig, orgId: "o-99", orgName: undefined });
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).toContain("org: o-99");
  });

  it("omits the version notice when getInstalledVersion returns null", async () => {
    getInstalledVersionMock.mockReturnValue(null);
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).not.toContain("Hivemind v");
  });

  it("uses conversation_id as the session id when session_id is missing", async () => {
    stdinMock.mockResolvedValue({ conversation_id: "conv-only", workspace_roots: ["/p"] });
    await runHook();
    const insertSql = queryMock.mock.calls[1]?.[0] as string;
    expect(insertSql ?? "").toContain("/summaries/alice/conv-only.md");
  });

  it("synthesises a 'cursor-<ts>' session id when neither session_id nor conversation_id are present", async () => {
    stdinMock.mockResolvedValue({ workspace_roots: ["/p"] });
    await runHook();
    const insertSql = queryMock.mock.calls[1]?.[0] as string;
    expect(insertSql ?? "").toMatch(/\/summaries\/alice\/cursor-\d+\.md/);
  });

  it("readStdin throwing → top-level catch arrow logs 'fatal' and exits 0", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    stdinMock.mockRejectedValue(new Error("stdin gone"));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("fatal: stdin gone"));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe("cursor session-start hook — local mined skills note", () => {
  it("not logged in + 1 mined skill → singular 'skill'", async () => {
    localManifestMock.mockReturnValue(1);
    loadCredentialsMock.mockReturnValue(null);
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).toContain("1 local skill from");
    expect(payload.additional_context).not.toContain("1 local skills");
  });

  it("not logged in + 7 mined skills → plural 'skills'", async () => {
    localManifestMock.mockReturnValue(7);
    loadCredentialsMock.mockReturnValue(null);
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).toContain("7 local skills from");
  });

  it("logged in + N mined → no skills note in payload", async () => {
    localManifestMock.mockReturnValue(4);
    await runHook();
    const payload = JSON.parse(consoleLogMock.mock.calls[0][0] as string);
    expect(payload.additional_context).not.toContain("4 local skills");
  });

  it("resolveCwd falls back to process.cwd() when workspace_roots is empty array", async () => {
    // Covers the `Array.isArray(roots) && roots.length > 0 && typeof roots[0] === 'string'`
    // falsy path: array IS an array but empty → fallback.
    stdinMock.mockResolvedValue({ session_id: "sid-empty", workspace_roots: [] });
    await runHook();
    expect(consoleLogMock).toHaveBeenCalled();
  });

  it("logs 'triggered (background)' when auto-mine actually fires (not skipped)", async () => {
    // Covers the `auto.triggered ?` truthy ternary branch on line 134.
    loadCredentialsMock.mockReturnValue(null);
    vi.doMock("../../src/skillify/spawn-mine-local-worker.js", () => ({
      maybeAutoMineLocal: () => ({ triggered: true, reason: "spawned" }),
    }));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("auto-mine: triggered"));
  });
});

describe("cursor session-start hook — per-directory .hivemind", () => {
  let hmDir: string;
  afterEach(() => { if (hmDir) rmSync(hmDir, { recursive: true, force: true }); });

  function withHivemind(body: Record<string, unknown>): void {
    hmDir = mkdtempSync(join(tmpdir(), "cursor-hivemind-"));
    writeFileSync(join(hmDir, ".hivemind"), JSON.stringify(body));
    stdinMock.mockResolvedValue({ session_id: "sid-1", workspace_roots: [hmDir] });
  }

  function banner(): string {
    return JSON.parse(consoleLogMock.mock.calls[0][0] as string).additional_context;
  }

  it("a routing .hivemind discloses the routed org/workspace in the banner", async () => {
    withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
    await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
    expect(banner()).toContain("org: routed-org (workspace: routed-ws)");
    expect(banner()).toContain("routed by");
    expect(ensureTableMock).toHaveBeenCalled();
  });

  it("collect:false skips table setup and says capture is disabled", async () => {
    withHivemind({ collect: false });
    await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
    expect(banner()).toContain("capture is disabled for this directory");
    expect(ensureTableMock).not.toHaveBeenCalled();
    expect(ensureSessionsTableMock).not.toHaveBeenCalled();
  });

  it("env HIVEMIND_ORG_ID overrides a routing .hivemind (env > file)", async () => {
    withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
    loadConfigMock.mockReturnValue({ ...validConfig, orgId: "env-org", orgName: "env-org" });
    await runHook({ HIVEMIND_ORG_ID: "env-org", HIVEMIND_WORKSPACE_ID: undefined });
    expect(banner()).toContain("org: env-org");
    expect(banner()).not.toContain("routed-org");
    expect(banner()).toContain("workspace: routed-ws");
  });
});
