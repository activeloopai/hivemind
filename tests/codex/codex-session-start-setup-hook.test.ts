import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Source-level tests for src/hooks/codex/session-start-setup.ts. The
 * codex async setup hook does the same work as its claude-code
 * counterpart (table setup, placeholder, version check + autoupdate)
 * but with a different autoupdate strategy — it runs a shell pipeline
 * that git clones the release tag into the codex plugin cache.
 *
 * Mocks: readStdin, loadCredentials/saveCredentials, loadConfig,
 * DeeplakeApi (ensureTable, ensureSessionsTable, query), global.fetch,
 * child_process.execSync.
 */

const stdinMock = vi.fn();
const loadCredsMock = vi.fn();
const saveCredsMock = vi.fn();
const loadConfigMock = vi.fn();
const debugLogMock = vi.fn();
const ensureTableMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const queryMock = vi.fn();
const autoUpdateMock = vi.fn();
const spawnDetachedMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: any[]) => stdinMock(...a) }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: (...a: any[]) => loadCredsMock(...a),
  saveCredentials: (...a: any[]) => saveCredsMock(...a),
}));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: any[]) => loadConfigMock(...a) }));
vi.mock("../../src/utils/debug.js", () => ({
  log: (_t: string, msg: string) => debugLogMock(msg),
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    ensureTable() { return ensureTableMock(); }
    ensureSessionsTable(t: string) { return ensureSessionsTableMock(t); }
    query(sql: string) { return queryMock(sql); }
  },
}));
// autoUpdate mocked at the boundary (CLAUDE.md rule 5) — exhaustive
// helper-internal coverage lives in autoupdate.test.ts. Here we only
// verify the codex hook calls it with agent: "codex" and that the
// legacy git-clone tag flow is gone.
vi.mock("../../src/hooks/shared/autoupdate.js", () => ({
  autoUpdate: (...a: any[]) => autoUpdateMock(...a),
}));
// The hook no longer provisions graph-deps inline: a cold npm install +
// native compile can exceed the ~120s hook timeout, so it spawns a DETACHED
// worker via spawnDetachedNodeWorker. Mock that boundary and assert the hook
// spawns graph-deps-worker.js (and BEFORE the credentials gate).
vi.mock("../../src/utils/spawn-detached.js", () => ({
  spawnDetachedNodeWorker: (...a: any[]) => spawnDetachedMock(...a),
}));

async function runHook(env: Record<string, string | undefined> = {}): Promise<void> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  delete process.env.HIVEMIND_CAPTURE;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  await import("../../src/hooks/codex/session-start-setup.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

const validConfig = {
  token: "t", orgId: "o", orgName: "acme", workspaceId: "default",
  userName: "alice", apiUrl: "http://example", tableName: "memory",
  sessionsTableName: "sessions",
};

beforeEach(() => {
  stdinMock.mockReset().mockResolvedValue({
    session_id: "sid-1", cwd: "/workspaces/proj",
    hook_event_name: "SessionStart", model: "gpt-5",
  });
  loadCredsMock.mockReset().mockReturnValue({
    token: "tok", orgId: "o", orgName: "acme", userName: "alice",
  });
  saveCredsMock.mockReset();
  loadConfigMock.mockReset().mockReturnValue(validConfig);
  debugLogMock.mockReset();
  ensureTableMock.mockReset().mockResolvedValue(undefined);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]); // placeholder SELECT → empty, INSERT will follow
  autoUpdateMock.mockReset().mockResolvedValue(undefined);
  spawnDetachedMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("codex session-start-setup hook — guards", () => {
  it("returns when HIVEMIND_WIKI_WORKER=1", async () => {
    await runHook({ HIVEMIND_WIKI_WORKER: "1" });
    expect(stdinMock).not.toHaveBeenCalled();
  });

  it("returns when no credentials are loaded", async () => {
    loadCredsMock.mockReturnValue(null);
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith("no credentials");
    expect(ensureTableMock).not.toHaveBeenCalled();
  });
});

describe("codex session-start-setup hook — graph-deps provisioning (detached worker)", () => {
  const spawnedGraphDeps = () =>
    spawnDetachedMock.mock.calls.find(([p]) => typeof p === "string" && p.endsWith("graph-deps-worker.js"));

  it("spawns the graph-deps worker detached once on the happy path (NOT inline)", async () => {
    await runHook();
    expect(spawnedGraphDeps()).toBeDefined();
  });

  it("spawns graph-deps even when there are NO credentials (local, login-independent)", async () => {
    loadCredsMock.mockReturnValue(null);
    await runHook();
    // The worker spawn must fire BEFORE the credentials early-return.
    expect(spawnedGraphDeps()).toBeDefined();
    expect(debugLogMock).toHaveBeenCalledWith("no credentials");
  });

  it("spawns the graph-deps worker BEFORE loadCredentials (ordering)", async () => {
    let graphAt = -1;
    let credsAt = -1;
    let counter = 0;
    spawnDetachedMock.mockImplementation((p: string) => { if (p.endsWith("graph-deps-worker.js")) graphAt = counter++; });
    loadCredsMock.mockImplementation(() => { credsAt = counter++; return { token: "tok", userName: "alice" }; });
    await runHook();
    expect(graphAt).toBeGreaterThanOrEqual(0);
    expect(credsAt).toBeGreaterThanOrEqual(0);
    expect(graphAt).toBeLessThan(credsAt);
  });

  it("the detached spawn does not block the rest of the hook (table setup still runs)", async () => {
    await runHook();
    expect(spawnedGraphDeps()).toBeDefined();
    expect(ensureTableMock).toHaveBeenCalled();
  });
});

describe("codex session-start-setup hook — userName backfill", () => {
  it("backfills userName when missing and saves creds", async () => {
    loadCredsMock.mockReturnValue({ token: "tok", orgId: "o", orgName: "acme" });
    await runHook();
    expect(saveCredsMock).toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringMatching(/^backfilled userName: /),
    );
  });

  it("does not save when userName present", async () => {
    await runHook();
    expect(saveCredsMock).not.toHaveBeenCalled();
  });
});

describe("codex session-start-setup hook — placeholder branching", () => {
  it("creates placeholder when none exists (SELECT returns [] → INSERT)", async () => {
    await runHook();
    expect(ensureTableMock).toHaveBeenCalled();
    expect(ensureSessionsTableMock).toHaveBeenCalledWith("sessions");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT path FROM/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^INSERT INTO/);
    expect(queryMock.mock.calls[1][0]).toContain("'codex'");
    expect(debugLogMock).toHaveBeenCalledWith("setup complete");
  });

  it("skips INSERT on resumed session (SELECT returns a row)", async () => {
    queryMock.mockResolvedValueOnce([{ path: "/summaries/alice/sid-1.md" }]);
    await runHook();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("skips all backend setup when HIVEMIND_CAPTURE=false", async () => {
    // Setup writes (ensure DDL + placeholder) are gated on captureEnabled &&
    // collect, matching the claude hook — nothing touches the backend.
    await runHook({ HIVEMIND_CAPTURE: "false" });
    expect(ensureTableMock).not.toHaveBeenCalled();
    expect(ensureSessionsTableMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("swallows setup errors and logs them", async () => {
    ensureTableMock.mockRejectedValue(new Error("table boom"));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("setup failed: table boom"),
    );
  });

  it("skips setup when session_id is empty", async () => {
    stdinMock.mockResolvedValue({
      session_id: "", cwd: "/x", hook_event_name: "SessionStart", model: "m",
    });
    await runHook();
    expect(ensureTableMock).not.toHaveBeenCalled();
  });

  it("skips setup when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValue(null);
    await runHook();
    expect(ensureTableMock).not.toHaveBeenCalled();
  });
});

describe("codex session-start-setup hook — centralized autoupdate", () => {
  it("invokes autoUpdate exactly once with agent: 'codex' and the running bundleDir", async () => {
    await runHook();
    expect(autoUpdateMock).toHaveBeenCalledTimes(1);
    const opts = autoUpdateMock.mock.calls[0][1];
    expect(opts.agent).toBe("codex");
    // bundleDir must be threaded so the Codex-managed guard can detect a
    // plugin-directory install and skip the npm self-update there. It is
    // dirname(fileURLToPath(import.meta.url)) of session-start-setup, so it
    // ends with hooks/codex — assert the suffix to catch wrong-dir regressions.
    expect(opts.bundleDir).toMatch(/[\\/]hooks[\\/]codex$/);
  });

  it("passes the loaded creds (so the helper can read creds.autoupdate)", async () => {
    const creds = { token: "tok", orgId: "o", orgName: "acme", userName: "alice" };
    loadCredsMock.mockReturnValue(creds);
    await runHook();
    // The helper sees the creds object (possibly with userName backfilled
    // — codex' setup also writes userName before calling autoUpdate).
    const passedCreds = autoUpdateMock.mock.calls[0][0];
    expect(passedCreds.token).toBe("tok");
    expect(passedCreds.orgId).toBe("o");
  });
});

describe("codex session-start-setup hook — legacy autoupdate paths are gone", () => {
  // node:child_process.execSync can't be hot-spied (non-configurable),
  // so we use fetch as the proxy: the legacy autoupdate flow ALWAYS
  // started with `fetch(githubraw)`. If fetch isn't called, the legacy
  // probe is gone, and by construction the git-clone pipeline can't
  // fire (it was gated on the fetch result).
  it("does not call fetch (legacy GitHub-raw version probe)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("should not be called"));
    await runHook();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("codex session-start-setup hook — fatal catch", () => {
  it("catches stdin throw and exits 0", async () => {
    stdinMock.mockRejectedValue(new Error("stdin boom"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await runHook();
    await new Promise(r => setImmediate(r));
    expect(debugLogMock).toHaveBeenCalledWith("fatal: stdin boom");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// (Version-helper edge cases — fetch failure, missing version field,
// unsafe tag rejection, isNewer comparison — are tested at the layer
// they belong to: src/cli/update.ts (registry fetch) and the autoupdate
// helper itself, not in the per-agent hook.)
