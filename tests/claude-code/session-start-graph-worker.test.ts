import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Direct tests for the graph-worker gate in src/hooks/session-start.ts:247-249:
 *
 *     if (creds?.token) spawnGraphPullWorker(input.cwd ?? process.cwd(), __bundleDir);
 *     const graphLine = graphContextLine(input.cwd ?? process.cwd());
 *     const graphNote = graphLine ?? "";
 *
 * Same mock-the-module-boundary pattern used by session-start-hook.test.ts
 * (CLAUDE.md rule 2). Branches we need direct coverage on:
 *
 *   creds-gate (logical AND on creds?.token):
 *     A. creds with token  → spawnGraphPullWorker IS called, with (cwd, bundleDir)
 *     B. creds null        → spawnGraphPullWorker is NOT called
 *
 *   graph-context-line append (?? "" fallback):
 *     C. graphContextLine returns a string → string is appended to additionalContext
 *     D. graphContextLine returns null     → no graph line appears in context
 *
 *   cwd derivation:
 *     E. input.cwd missing → process.cwd() is forwarded to BOTH the spawn and the line builder
 *
 * spawn-pull-worker.ts already has its own unit tests covering env-disable,
 * detach semantics, ENOENT handling, etc. These tests target ONLY the call
 * site in session-start.ts — that the gate fires correctly and that the
 * graph line gets appended to the inject.
 */

// ── Module boundary mocks ───────────────────────────────────────────────────

const stdinMock = vi.fn();
const loadCredsMock = vi.fn();
const saveCredsMock = vi.fn();
const loadConfigMock = vi.fn();
const debugLogMock = vi.fn();
const ensureTableMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const queryMock = vi.fn();
const autoUpdateMock = vi.fn();
const spawnGraphPullWorkerMock = vi.fn();
const graphContextLineMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: any[]) => stdinMock(...a) }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: (...a: any[]) => loadCredsMock(...a),
  saveCredentials: (...a: any[]) => saveCredsMock(...a),
  healDriftedOrgToken: async (creds: unknown) => creds,
  resolveWorkspaceOverride: async (creds: unknown) => ({ creds }),
}));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: any[]) => loadConfigMock(...a) }));
vi.mock("../../src/utils/debug.js", () => ({
  log: (_t: string, msg: string) => debugLogMock(msg),
  utcTimestamp: () => "2026-05-22 00:00:00 UTC",
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    ensureTable() { return ensureTableMock(); }
    ensureSessionsTable(t: string) { return ensureSessionsTableMock(t); }
    query(sql: string) { return queryMock(sql); }
  },
}));
vi.mock("../../src/hooks/shared/autoupdate.js", () => ({
  autoUpdate: (...a: any[]) => autoUpdateMock(...a),
}));
const getInstalledVersionMock = vi.fn();
vi.mock("../../src/utils/version-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/version-check.js")>();
  return { ...actual, getInstalledVersion: (...a: unknown[]) => getInstalledVersionMock(...a) };
});
const countLocalManifestEntriesMock = vi.fn();
vi.mock("../../src/skillify/local-manifest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skillify/local-manifest.js")>();
  return {
    ...actual,
    countLocalManifestEntries: (...a: unknown[]) => countLocalManifestEntriesMock(...a),
  };
});
const maybeAutoMineLocalMock = vi.fn();
vi.mock("../../src/skillify/spawn-mine-local-worker.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skillify/spawn-mine-local-worker.js")>();
  return {
    ...actual,
    maybeAutoMineLocal: (...a: unknown[]) => maybeAutoMineLocalMock(...a),
  };
});

// THE mocks under test: the two graph entry points the hook calls.
vi.mock("../../src/graph/spawn-pull-worker.js", () => ({
  spawnGraphPullWorker: (...a: any[]) => spawnGraphPullWorkerMock(...a),
}));
vi.mock("../../src/graph/session-context.js", () => ({
  graphContextLine: (...a: any[]) => graphContextLineMock(...a),
}));

const stdoutSpy = vi.spyOn(process.stdout, "write");

async function runHook(env: Record<string, string | undefined> = {}): Promise<string | null> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  delete process.env.HIVEMIND_CAPTURE;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  stdoutSpy.mockImplementation(() => true);
  vi.resetModules();
  const originalLog = console.log;
  const collected: string[] = [];
  console.log = (...args: any[]) => { collected.push(args.join(" ")); };
  try {
    await import("../../src/hooks/session-start.js");
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    return collected.join("\n") || null;
  } finally {
    console.log = originalLog;
  }
}

const validConfig = {
  token: "t", orgId: "o", orgName: "acme", workspaceId: "default",
  userName: "alice", apiUrl: "http://example", tableName: "memory",
  sessionsTableName: "sessions",
};

let cacheTmp: string;

beforeEach(() => {
  cacheTmp = mkdtempSync(join(tmpdir(), "session-start-graph-test-"));
  stdinMock.mockReset().mockResolvedValue({ session_id: "sid-graph", cwd: "/repos/myproject" });
  loadCredsMock.mockReset().mockReturnValue({
    token: "tok", orgId: "o", orgName: "acme", userName: "alice", workspaceId: "default",
  });
  saveCredsMock.mockReset();
  loadConfigMock.mockReset().mockReturnValue(validConfig);
  debugLogMock.mockReset();
  ensureTableMock.mockReset().mockResolvedValue(undefined);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]);
  autoUpdateMock.mockReset().mockResolvedValue(undefined);
  getInstalledVersionMock.mockReset().mockReturnValue("9.9.9");
  countLocalManifestEntriesMock.mockReset().mockReturnValue(0);
  maybeAutoMineLocalMock.mockReset().mockReturnValue({ triggered: false, reason: "no-claude-sessions" });
  // Default: no graph in this repo
  spawnGraphPullWorkerMock.mockReset();
  graphContextLineMock.mockReset().mockReturnValue(null);
  process.env.HIVEMIND_AUTOPULL_DISABLED = "1";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HIVEMIND_AUTOPULL_DISABLED;
  try { rmSync(cacheTmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ═══ Creds gate ═══════════════════════════════════════════════════════════

describe("session-start — graph-worker creds gate", () => {
  it("creds with token → spawnGraphPullWorker IS called exactly once with (cwd, bundleDir)", async () => {
    await runHook();
    expect(spawnGraphPullWorkerMock).toHaveBeenCalledTimes(1);
    const [cwdArg, bundleDirArg] = spawnGraphPullWorkerMock.mock.calls[0];
    expect(cwdArg).toBe("/repos/myproject");
    // __bundleDir is derived inside session-start.ts; assert it's a non-empty string.
    // Real value during vitest = the src/hooks/ path. We don't pin the exact value,
    // only that the hook passed SOMETHING through (the spawn helper itself owns the
    // bundle-resolution contract — covered in spawn-pull-worker.test.ts).
    expect(typeof bundleDirArg).toBe("string");
    expect((bundleDirArg as string).length).toBeGreaterThan(0);
  });

  it("creds null → spawnGraphPullWorker is NEVER called", async () => {
    loadCredsMock.mockReturnValue(null);
    await runHook();
    expect(spawnGraphPullWorkerMock).not.toHaveBeenCalled();
  });

  it("creds with empty token → spawnGraphPullWorker is NEVER called (falsy guard)", async () => {
    loadCredsMock.mockReturnValue({
      token: "", orgId: "o", orgName: "acme", userName: "alice", workspaceId: "default",
    });
    await runHook();
    expect(spawnGraphPullWorkerMock).not.toHaveBeenCalled();
  });
});

// ═══ graphContextLine append ══════════════════════════════════════════════

describe("session-start — graphContextLine append", () => {
  it("graphContextLine returns a string → appended to additionalContext", async () => {
    graphContextLineMock.mockReturnValue("\n\n📊 codebase graph: 42 nodes, 17 edges (commit abcdef0)");
    const out = await runHook();
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("📊 codebase graph: 42 nodes");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("commit abcdef0");
  });

  it("graphContextLine returns null → no graph note appears in additionalContext", async () => {
    graphContextLineMock.mockReturnValue(null);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain("codebase graph");
  });

  it("graphContextLine is always called with the resolved cwd", async () => {
    await runHook();
    expect(graphContextLineMock).toHaveBeenCalledTimes(1);
    expect(graphContextLineMock).toHaveBeenCalledWith("/repos/myproject");
  });

  it("graph line is appended AFTER the auth banner (order: context + auth + graph)", async () => {
    graphContextLineMock.mockReturnValue("\n\nGRAPH_LINE_MARKER");
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext as string;
    const authIdx = ctx.indexOf("Logged in to Deeplake");
    const graphIdx = ctx.indexOf("GRAPH_LINE_MARKER");
    expect(authIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(authIdx);
  });
});

// ═══ cwd derivation ═══════════════════════════════════════════════════════

describe("session-start — cwd fallback to process.cwd()", () => {
  it("input.cwd missing → both spawn and line builder receive process.cwd()", async () => {
    stdinMock.mockResolvedValue({ session_id: "sid-no-cwd" });
    const pcwd = process.cwd();
    await runHook();
    expect(spawnGraphPullWorkerMock).toHaveBeenCalledWith(pcwd, expect.any(String));
    expect(graphContextLineMock).toHaveBeenCalledWith(pcwd);
  });

  it("input.cwd empty string → still forwarded to spawn (empty cwd is the hook's contract)", async () => {
    // Empty string IS a valid cwd value (the ?? fallback only fires on undefined/null).
    // Document this with a test so a future refactor that "fixes" it to fall back on
    // empty is forced to make a deliberate decision.
    stdinMock.mockResolvedValue({ session_id: "sid-empty-cwd", cwd: "" });
    await runHook();
    expect(spawnGraphPullWorkerMock).toHaveBeenCalledWith("", expect.any(String));
    expect(graphContextLineMock).toHaveBeenCalledWith("");
  });
});
