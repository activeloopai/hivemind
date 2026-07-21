import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Direct source-level tests for src/hooks/capture.ts. The module runs
 * main() at import time; each scenario resets the registry and imports
 * fresh. Mocks: readStdin, loadConfig, DeeplakeApi, spawn-wiki-worker,
 * summary-state. Everything else (SQL assembly, entry shape, meta
 * merging, JSON escaping) runs for real.
 *
 * Coverage target: each event-type branch (prompt / tool / assistant /
 * unknown), the CAPTURE guard, the table-missing retry, the unrelated
 * error re-throw, and every leg of the periodic-trigger helper
 * (threshold not met / met + lock free / met + lock held / spawn
 * throws / outer catch).
 */

const stdinMock = vi.fn();
const loadConfigMock = vi.fn();
const spawnMock = vi.fn();
const wikiLogMock = vi.fn();
const tryAcquireLockMock = vi.fn();
const releaseLockMock = vi.fn();
const bumpTotalCountMock = vi.fn();
const loadTriggerConfigMock = vi.fn();
const shouldTriggerMock = vi.fn();
const ensureSessionOwnerMock = vi.fn();
const debugLogMock = vi.fn();
const queryMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const apiCtorMock = vi.fn();
const appendSessionEventMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: any[]) => stdinMock(...a) }));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: any[]) => loadConfigMock(...a) }));
vi.mock("../../src/hooks/spawn-wiki-worker.js", () => ({
  spawnWikiWorker: (...a: any[]) => spawnMock(...a),
  wikiLog: (...a: any[]) => wikiLogMock(...a),
  bundleDirFromImportMeta: () => "/fake/bundle",
}));
vi.mock("../../src/hooks/summary-state.js", () => ({
  tryAcquireLock: (...a: any[]) => tryAcquireLockMock(...a),
  releaseLock: (...a: any[]) => releaseLockMock(...a),
  bumpTotalCount: (...a: any[]) => bumpTotalCountMock(...a),
  loadTriggerConfig: (...a: any[]) => loadTriggerConfigMock(...a),
  shouldTrigger: (...a: any[]) => shouldTriggerMock(...a),
  ensureSessionOwner: (...a: any[]) => ensureSessionOwnerMock(...a),
}));
vi.mock("../../src/utils/debug.js", () => ({
  log: (_tag: string, msg: string) => debugLogMock(msg),
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(...args: any[]) { apiCtorMock(...args); }
    query(sql: string) { return queryMock(sql); }
    ensureSessionsTable(t: string) { return ensureSessionsTableMock(t); }
  },
}));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    embed(_text: string, _kind?: string) { return Promise.resolve(null); }
    warmup() { return Promise.resolve(false); }
  },
}));
vi.mock("../../src/hooks/session-event-cache.js", () => ({
  appendSessionEvent: (...a: any[]) => appendSessionEventMock(...a),
}));

async function runHook(env: Record<string, string | undefined> = {}): Promise<void> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  delete process.env.HIVEMIND_CAPTURE;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  await import("../../src/hooks/capture.js");
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
    session_id: "sid-1",
    cwd: "/workspaces/proj",
    hook_event_name: "UserPromptSubmit",
    prompt: "hello",
  });
  loadConfigMock.mockReset().mockReturnValue(validConfig);
  spawnMock.mockReset();
  wikiLogMock.mockReset();
  tryAcquireLockMock.mockReset().mockReturnValue(true);
  releaseLockMock.mockReset();
  bumpTotalCountMock.mockReset().mockReturnValue({
    lastSummaryAt: Date.now(), lastSummaryCount: 0, totalCount: 1,
  });
  loadTriggerConfigMock.mockReset().mockReturnValue({ everyNMessages: 50, everyHours: 2 });
  shouldTriggerMock.mockReset().mockReturnValue(false);
  debugLogMock.mockReset();
  queryMock.mockReset().mockResolvedValue([]);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  apiCtorMock.mockReset();
  appendSessionEventMock.mockReset();
});

afterEach(() => { vi.restoreAllMocks(); });

describe("capture hook — guard", () => {
  it("returns without touching stdin when HIVEMIND_CAPTURE=false", async () => {
    await runHook({ HIVEMIND_CAPTURE: "false" });
    expect(stdinMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValue(null);
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith("no config");
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("capture hook — per-directory .hivemind", () => {
  let hmDir: string;

  afterEach(() => {
    if (hmDir) rmSync(hmDir, { recursive: true, force: true });
  });

  function withHivemind(body: Record<string, unknown>): void {
    hmDir = mkdtempSync(join(tmpdir(), "capture-hivemind-"));
    writeFileSync(join(hmDir, ".hivemind"), JSON.stringify(body));
    stdinMock.mockResolvedValue({
      session_id: "sid-1",
      cwd: hmDir,
      hook_event_name: "UserPromptSubmit",
      prompt: "hello",
    });
  }

  it("collect:false writes nothing for this directory", async () => {
    withHivemind({ collect: false });
    await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
    expect(queryMock).not.toHaveBeenCalled();
    expect(apiCtorMock).not.toHaveBeenCalled();
  });

  it("a routing .hivemind constructs the API against the routed org/workspace", async () => {
    withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
    await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
    expect(queryMock).toHaveBeenCalledTimes(1);
    // DeeplakeApi(token, apiUrl, orgId, workspaceId, table)
    const args = apiCtorMock.mock.calls[0];
    expect(args[2]).toBe("routed-org");
    expect(args[3]).toBe("routed-ws");
  });

  it("env HIVEMIND_ORG_ID overrides the routed org (env > file)", async () => {
    withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
    loadConfigMock.mockReturnValue({ ...validConfig, orgId: "env-org", orgName: "env-org" });
    await runHook({ HIVEMIND_ORG_ID: "env-org", HIVEMIND_WORKSPACE_ID: undefined });
    const args = apiCtorMock.mock.calls[0];
    expect(args[2]).toBe("env-org"); // env wins for org
    expect(args[3]).toBe("routed-ws"); // workspace still routes
  });

  it("resolves against process.cwd() when the hook passes an empty cwd", async () => {
    // Exercises resolveCaptureConfig's `cwd || process.cwd()` fallback. The
    // repo root has no `.hivemind`, so capture proceeds against the global org.
    stdinMock.mockResolvedValue({
      session_id: "sid-1", cwd: "", hook_event_name: "UserPromptSubmit", prompt: "hello",
    });
    await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
    expect(queryMock).toHaveBeenCalledTimes(1);
    // The skip log (if it fired) prints the resolved cwd, never a bare "?".
    expect(debugLogMock).not.toHaveBeenCalledWith(expect.stringContaining("cwd=? "));
  });
});

describe("capture hook — event-type branches", () => {
  it("user_message: INSERT contains prompt content", async () => {
    await runHook();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO "sessions"/);
    expect(sql).toContain('"type":"user_message"');
    expect(sql).toContain('"content":"hello"');
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringMatching(/^user session=sid-1$/));
    // The same normalized line is mirrored into the local per-session cache so
    // the wiki-worker never has to re-`SELECT` the fat message column.
    expect(appendSessionEventMock).toHaveBeenCalledTimes(1);
    const [cachedSid, cachedLine] = appendSessionEventMock.mock.calls[0];
    expect(cachedSid).toBe("sid-1");
    expect(JSON.parse(cachedLine)).toMatchObject({ type: "user_message", content: "hello" });
  });

  it("does NOT append to the local cache when the INSERT fails", async () => {
    // A failed INSERT re-throws before the append — the cache must not diverge
    // from the DB by recording an event that was never persisted.
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    queryMock.mockReset().mockRejectedValue(new Error("random SQL boom"));
    await runHook();
    expect(appendSessionEventMock).not.toHaveBeenCalled();
  });

  it("tool_call: INSERT contains tool_name + serialized input/response", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-2",
      cwd: "/p",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "tu-1",
      tool_input: { command: "ls" },
      tool_response: { stdout: "file" },
    });
    await runHook();
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('"type":"tool_call"');
    expect(sql).toContain('"tool_name":"Bash"');
    expect(sql).toContain('tool_input');
    expect(sql).toContain('tool_response');
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringMatching(/^tool=Bash session=sid-2$/));
  });

  it("tool_call: masks secrets in the tool input/response before insert + embed", async () => {
    // Split literal so GitHub push protection doesn't flag this fixture.
    const secretToken = "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const secretPw = "s3cr3tP4ssword";
    stdinMock.mockResolvedValue({
      session_id: "sid-secret",
      cwd: "/p",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "tu-2",
      tool_input: { command: `git remote set-url origin https://${secretToken}@github.com/o/r` },
      tool_response: { stdout: `PGPASSWORD=${secretPw} psql -h db` },
    });
    await runHook();
    const sql = queryMock.mock.calls[0][0] as string;
    // Neither the raw token nor the password reaches the stored row...
    expect(sql).not.toContain(secretToken);
    expect(sql).not.toContain(secretPw);
    // ...but the masked, type-hinted form is present. capture.ts derives the
    // embedding from this same redacted `line`, so the secret is never embedded.
    expect(sql).toContain("ghp_********");
    expect(sql).toContain("PGPASSWORD=********");
  });

  it("assistant_message without agent_transcript_path", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-3",
      cwd: "/p",
      hook_event_name: "Stop",
      last_assistant_message: "reply text",
    });
    await runHook();
    // The Stop path re-reads the (here: absent) transcript across a bounded
    // backoff before inserting unenriched — wait for the INSERT, not a tick.
    await vi.waitFor(() => expect(queryMock).toHaveBeenCalled(), { timeout: 2000 });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('"type":"assistant_message"');
    expect(sql).toContain('"content":"reply text"');
    expect(sql).not.toContain("agent_transcript_path");
  });

  it("assistant_message WITH agent_transcript_path", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-4",
      cwd: "/p",
      hook_event_name: "SubagentStop",
      last_assistant_message: "sub reply",
      agent_transcript_path: "/tmp/agent.jsonl",
    });
    await runHook();
    await vi.waitFor(() => expect(queryMock).toHaveBeenCalled(), { timeout: 2000 });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('"agent_transcript_path":"/tmp/agent.jsonl"');
  });

  it("unknown event: skipped, no INSERT", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-x", cwd: "/p", hook_event_name: "WeirdHook",
      // no prompt, no tool_name, no last_assistant_message
    });
    await runHook();
    expect(queryMock).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith("unknown event, skipping");
  });
});

describe("capture hook — INSERT fallback + error paths", () => {
  it("creates the sessions table and retries when table is missing", async () => {
    queryMock
      .mockRejectedValueOnce(new Error('relation "sessions" does not exist'))
      .mockResolvedValueOnce([]);
    await runHook();
    expect(ensureSessionsTableMock).toHaveBeenCalledWith("sessions");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(debugLogMock).toHaveBeenCalledWith("table missing, creating and retrying");
  });

  it("creates the sessions table when the API returns 'permission denied'", async () => {
    queryMock
      .mockRejectedValueOnce(new Error("permission denied for relation sessions"))
      .mockResolvedValueOnce([]);
    await runHook();
    expect(ensureSessionsTableMock).toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("re-throws unrelated errors (caught by main().catch)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    queryMock.mockRejectedValue(new Error("random SQL boom"));
    await runHook();
    // The outer catch wraps the throw into the fatal log and exits.
    expect(debugLogMock).toHaveBeenCalledWith("fatal: random SQL boom");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe("capture hook — periodic trigger helper", () => {
  it("does nothing when HIVEMIND_WIKI_WORKER=1 (nested worker)", async () => {
    await runHook({ HIVEMIND_WIKI_WORKER: "1" });
    // The inner call is bypassed — but CAPTURE is also computed at load,
    // so with WIKI_WORKER=1 the capture itself still runs (CAPTURE default
    // is true). We just assert bumpTotalCount was NOT called.
    expect(bumpTotalCountMock).not.toHaveBeenCalled();
  });

  it("does not spawn when shouldTrigger returns false", async () => {
    shouldTriggerMock.mockReturnValue(false);
    await runHook();
    expect(bumpTotalCountMock).toHaveBeenCalledTimes(1);
    expect(tryAcquireLockMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("spawns the wiki worker when shouldTrigger=true and lock acquired", async () => {
    shouldTriggerMock.mockReturnValue(true);
    bumpTotalCountMock.mockReturnValue({
      lastSummaryAt: 0, lastSummaryCount: 0, totalCount: 10,
    });
    await runHook();
    expect(tryAcquireLockMock).toHaveBeenCalledWith("sid-1");
    expect(wikiLogMock).toHaveBeenCalledWith(
      expect.stringMatching(/^Periodic: threshold hit \(total=10,/),
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][0]).toMatchObject({ sessionId: "sid-1", reason: "Periodic" });
  });

  it("logs 'periodic trigger suppressed' when the lock is already held", async () => {
    shouldTriggerMock.mockReturnValue(true);
    tryAcquireLockMock.mockReturnValue(false);
    await runHook();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("periodic trigger suppressed (lock held)"),
    );
  });

  it("releases the lock if spawnWikiWorker throws", async () => {
    shouldTriggerMock.mockReturnValue(true);
    spawnMock.mockImplementation(() => { throw new Error("spawn failed"); });
    await runHook();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-1");
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("periodic trigger error: spawn failed"),
    );
  });

  it("still swallows the error when releaseLock ALSO throws", async () => {
    shouldTriggerMock.mockReturnValue(true);
    spawnMock.mockImplementation(() => { throw new Error("spawn failed"); });
    releaseLockMock.mockImplementation(() => { throw new Error("release failed"); });
    await runHook();
    // We should still see the outer periodic-trigger error log — the
    // release throw is deliberately swallowed.
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("periodic trigger error: spawn failed"),
    );
  });

  it("catches errors thrown by bumpTotalCount itself (outer try)", async () => {
    bumpTotalCountMock.mockImplementation(() => { throw new Error("bump boom"); });
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("periodic trigger error: bump boom"),
    );
  });
});

describe("capture hook — defensive fallback branches", () => {
  it("falls back to 'default' workspace when config.workspaceId is undefined", async () => {
    loadConfigMock.mockReturnValue({ ...validConfig, workspaceId: undefined });
    await runHook();
    const sql = queryMock.mock.calls[0][0] as string;
    // sessionPath uses workspace; with undefined it should land on 'default'
    expect(sql).toContain("alice_acme_default_sid-1.jsonl");
  });

  it("projectName falls back to 'unknown' when cwd is undefined", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-cwd", hook_event_name: "UserPromptSubmit", prompt: "x",
    });
    await runHook();
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'unknown'");
  });

  it("hook_event_name defaults to empty string when missing", async () => {
    stdinMock.mockResolvedValue({
      session_id: "sid-no-evt", cwd: "/p", prompt: "hi",
      // no hook_event_name
    });
    await runHook();
    const sql = queryMock.mock.calls[0][0] as string;
    // description column (hook_event_name ?? '') should land as ''
    // It appears between the projectName and the author — we just
    // assert the INSERT still went through.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sql).toMatch(/'[^']*', 'claude_code'/);
  });
});
