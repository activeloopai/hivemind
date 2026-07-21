import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Direct source-level tests for src/hooks/session-start.ts. The hook
 * orchestrates: credential load, userName backfill, table+placeholder
 * setup, version check + auto-update, and the additionalContext output.
 *
 * Mocks: readStdin, loadCredentials/saveCredentials, loadConfig,
 * DeeplakeApi, global.fetch, child_process.execSync, and the two
 * node:fs helpers used by the cache-cleanup path (readdirSync, rmSync).
 */

const stdinMock = vi.fn();
const loadCredsMock = vi.fn();
const saveCredsMock = vi.fn();
const loadConfigMock = vi.fn();
const debugLogMock = vi.fn();
const ensureTableMock = vi.fn();
const ensureSessionsTableMock = vi.fn();
const queryMock = vi.fn();
const knownTablesMock = vi.fn();
const autoUpdateMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: any[]) => stdinMock(...a) }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: (...a: any[]) => loadCredsMock(...a),
  saveCredentials: (...a: any[]) => saveCredsMock(...a),
  healDriftedOrgToken: async (creds: unknown) => creds,
}));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: any[]) => loadConfigMock(...a) }));
vi.mock("../../src/utils/debug.js", () => ({
  log: (_t: string, msg: string) => debugLogMock(msg),
  utcTimestamp: () => "2026-04-17 00:00:00 UTC",
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    ensureTable() { return ensureTableMock(); }
    ensureSessionsTable(t: string) { return ensureSessionsTableMock(t); }
    query(sql: string) { return queryMock(sql); }
    async knownTablesOrNull() { return knownTablesMock(); }
  },
}));
// (SkillOpt is no longer invoked from SessionStart — it's event-driven via
// PreToolUse/UserPromptSubmit — so skillopt-trigger is not mocked here anymore.)
// autoUpdate mocked at the boundary (CLAUDE.md rule 5) — the helper
// itself is exhaustively tested in autoupdate.test.ts. Here we only
// assert the hook *called* it with the right agent id and *didn't*
// re-introduce the legacy execSync/snapshot/marketplace path.
vi.mock("../../src/hooks/shared/autoupdate.js", () => ({
  autoUpdate: (...a: any[]) => autoUpdateMock(...a),
}));

// getInstalledVersion mocked so we can drive the "version notice" branch
// in additionalContext deterministically (returns a value vs null). The
// real implementation walks the fs and would always return the repo's
// package.json version, leaving the null branch uncovered.
const getInstalledVersionMock = vi.fn();
vi.mock("../../src/utils/version-check.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/version-check.js")>();
  return { ...actual, getInstalledVersion: (...a: unknown[]) => getInstalledVersionMock(...a) };
});

// countLocalManifestEntries mocked so we can drive the three branches of
// the not-logged-in `localMinedNote` ternary (0 → empty, 1 → "1 local skill",
// N>1 → "N local skills") without depending on the developer's real
// ~/.claude/hivemind/local-mined.json.
const countLocalManifestEntriesMock = vi.fn();
vi.mock("../../src/skillify/local-manifest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skillify/local-manifest.js")>();
  return {
    ...actual,
    countLocalManifestEntries: (...a: unknown[]) => countLocalManifestEntriesMock(...a),
  };
});

// maybeAutoMineLocal mocked so the un-authed branch's both outcomes are
// reachable without doing real file IO. Real call returns
// `triggered: false, reason: "no-claude-sessions"` in the test env, which
// leaves the `triggered === true` branch on session-start.ts:145
// uncovered — a coverage gap CI's branch threshold (≥90%) flags.
const maybeAutoMineLocalMock = vi.fn();
vi.mock("../../src/skillify/spawn-mine-local-worker.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/skillify/spawn-mine-local-worker.js")>();
  return {
    ...actual,
    maybeAutoMineLocal: (...a: unknown[]) => maybeAutoMineLocalMock(...a),
  };
});

let stdoutLines: string[] = [];
const stdoutSpy = vi.spyOn(process.stdout, "write");

async function runHook(env: Record<string, string | undefined> = {}): Promise<string | null> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  delete process.env.HIVEMIND_CAPTURE;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  stdoutLines = [];
  stdoutSpy.mockImplementation((chunk: any) => { stdoutLines.push(String(chunk)); return true; });
  vi.resetModules();
  // Intercept console.log which session-start.ts uses for the JSON emit
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
  // T6 fields — needed so the renderer's sqlIdent doesn't render
  // FROM "undefined" when the mock loadConfig is consulted.
  rulesTableName: "hivemind_rules",
  goalsTableName: "hivemind_goals",
  skillsTableName: "skills",
};

let cacheTmp: string;

beforeEach(() => {
  cacheTmp = mkdtempSync(join(tmpdir(), "session-start-test-"));
  stdinMock.mockReset().mockResolvedValue({ session_id: "sid-1", cwd: "/workspaces/proj" });
  loadCredsMock.mockReset().mockReturnValue({
    token: "tok", orgId: "o", orgName: "acme", userName: "alice", workspaceId: "default",
  });
  saveCredsMock.mockReset();
  loadConfigMock.mockReset().mockReturnValue(validConfig);
  debugLogMock.mockReset();
  ensureTableMock.mockReset().mockResolvedValue(undefined);
  ensureSessionsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]); // "no existing summary"
  // Default: untrusted table list (null) → renderer SELECTs unconditionally.
  // The "trusted list" test below overrides to exercise the gating predicate.
  knownTablesMock.mockReset().mockResolvedValue(null);
  autoUpdateMock.mockReset().mockResolvedValue(undefined);
  getInstalledVersionMock.mockReset().mockReturnValue("9.9.9");
  // Default: no manifest → 0 mined skills. Individual tests override.
  // The hook's model-visible additionalContext NEVER renders insight
  // prose (security invariant — see local-mined-banner.ts docstring),
  // so we don't need a getLatestInsightEntry mock here.
  countLocalManifestEntriesMock.mockReset().mockReturnValue(0);
  // Default: auto-mine guards trip (no claude sessions) — matches the
  // common test scenario where the developer's HOME has no local
  // sessions visible to the test runner.
  maybeAutoMineLocalMock.mockReset().mockReturnValue({ triggered: false, reason: "no-claude-sessions" });
  // Disable auto-pull during this test: autoPullSkills would otherwise issue
  // an extra SQL query (against `skills`) through the same DeeplakeApi mock,
  // breaking the placeholder-branching call-count assertions. The auto-pull
  // module's behaviour is covered exhaustively in skillify-auto-pull.test.ts.
  process.env.HIVEMIND_AUTOPULL_DISABLED = "1";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HIVEMIND_AUTOPULL_DISABLED;
  try { rmSync(cacheTmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ═══ Guard + credential branches ═══════════════════════════════════════════

describe("session-start hook — guards", () => {
  it("returns immediately when HIVEMIND_WIKI_WORKER=1", async () => {
    const out = await runHook({ HIVEMIND_WIKI_WORKER: "1" });
    expect(stdinMock).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });

  it("emits additionalContext with the not-logged-in warning when no creds", async () => {
    loadCredsMock.mockReturnValue(null);
    const out = await runHook();
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("Not logged in to Deeplake");
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("no credentials found"),
    );
  });

  it("emits the logged-in context when creds are present", async () => {
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("Logged in to Deeplake as org: acme");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("workspace: default");
  });

  it("falls back to orgId when orgName is missing", async () => {
    // The banner reflects the effective (resolved) config; real loadConfig
    // sets orgName = orgId when creds lack an orgName, so drive that here.
    loadCredsMock.mockReturnValue({
      token: "t", orgId: "org-uuid", userName: "u", workspaceId: "default",
    });
    loadConfigMock.mockReturnValue({ ...validConfig, orgId: "org-uuid", orgName: undefined });
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("Logged in to Deeplake as org: org-uuid");
  });

  describe("per-directory .hivemind wiring", () => {
    let hmDir: string;

    afterEach(() => {
      if (hmDir) rmSync(hmDir, { recursive: true, force: true });
    });

    function withHivemind(body: Record<string, unknown>): void {
      hmDir = mkdtempSync(join(tmpdir(), "session-start-hivemind-"));
      writeFileSync(join(hmDir, ".hivemind"), JSON.stringify(body));
      stdinMock.mockResolvedValue({ session_id: "sid-1", cwd: hmDir });
    }

    it("a routing .hivemind sends the placeholder to the routed org and discloses it in the banner", async () => {
      withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
      const out = await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
      const ctx = JSON.parse(out!).hookSpecificOutput.additionalContext;
      expect(ctx).toContain("org: routed-org (workspace: routed-ws)");
      expect(ctx).toContain("routed by");
      // Capture still happens (routed, not opted out) → tables ensured.
      expect(ensureTableMock).toHaveBeenCalled();
    });

    it("collect:false skips the placeholder/table setup and says capture is disabled", async () => {
      withHivemind({ collect: false });
      const out = await runHook({ HIVEMIND_ORG_ID: undefined, HIVEMIND_WORKSPACE_ID: undefined });
      const ctx = JSON.parse(out!).hookSpecificOutput.additionalContext;
      expect(ctx).toContain("capture is disabled for this directory");
      // No capture → no DDL and no placeholder INSERT for this directory.
      expect(ensureTableMock).not.toHaveBeenCalled();
      expect(ensureSessionsTableMock).not.toHaveBeenCalled();
    });

    it("env HIVEMIND_ORG_ID overrides a routing .hivemind (env > file)", async () => {
      withHivemind({ orgId: "routed-org", workspaceId: "routed-ws" });
      // base already reflects the env-pinned org (loadConfig folds it in).
      loadConfigMock.mockReturnValue({ ...validConfig, orgId: "env-org", orgName: "env-org" });
      loadCredsMock.mockReturnValue({
        token: "tok", orgId: "env-org", orgName: "env-org", userName: "alice", workspaceId: "default",
      });
      const out = await runHook({ HIVEMIND_ORG_ID: "env-org", HIVEMIND_WORKSPACE_ID: undefined });
      const ctx = JSON.parse(out!).hookSpecificOutput.additionalContext;
      expect(ctx).toContain("org: env-org");
      expect(ctx).not.toContain("routed-org");
      // workspace isn't env-pinned, so the file still routes it.
      expect(ctx).toContain("workspace: routed-ws");
    });
  });

  it("backfills userName via node:os when credentials lack one", async () => {
    loadCredsMock.mockReturnValue({
      token: "t", orgId: "o", orgName: "acme", workspaceId: "default",
    });
    await runHook();
    expect(saveCredsMock).toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringMatching(/^backfilled and persisted userName: /),
    );
  });
});

// ═══ Table setup + placeholder ═════════════════════════════════════════════

describe("session-start hook — placeholder branching", () => {
  it("creates placeholder when summary does not exist (query returns [])", async () => {
    await runHook();
    expect(ensureTableMock).toHaveBeenCalled();
    expect(ensureSessionsTableMock).toHaveBeenCalledWith("sessions");
    // 1 SELECT (existing-summary check) + 1 INSERT (placeholder)
    // + 2 renderer SELECTs (listRules + listOpenGoals) = 4 queries.
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT path FROM/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^INSERT INTO/);
    expect(queryMock.mock.calls[2][0]).toMatch(/^SELECT .* FROM "hivemind_rules"/);
    expect(queryMock.mock.calls[3][0]).toMatch(/^SELECT .* FROM "hivemind_goals"/);
    expect(debugLogMock).toHaveBeenCalledWith("placeholder created");
  });

  it("skips placeholder INSERT when summary already exists (resumed session)", async () => {
    queryMock.mockResolvedValueOnce([{ path: "/summaries/alice/sid-1.md" }]);
    await runHook();
    // 1 placeholder SELECT (returns row, no INSERT) + 2 renderer SELECTs
    // (rules + goals) = 3 queries.
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("non-empty rules block is appended to additionalContext", async () => {
    // The default tests use queryMock-returns-[] which produces an
    // empty rulesBlock and exercises the "false" branch of the
    // additionalContext ternary. This test populates rules so the
    // renderer returns content and the "true" branch (concat) fires.
    const rule = {
      id: "row-1", rule_id: "rule-1", text: "no DROP TABLE on prod",
      scope: "team", status: "active", assigned_by: "alice@activeloop.ai",
      version: 1, created_at: "2026-05-20T10:00:00Z",
      agent: "manual", plugin_version: "0.7.99",
    };
    queryMock.mockResolvedValueOnce([]);     // placeholder SELECT
    queryMock.mockResolvedValueOnce([]);     // placeholder INSERT
    queryMock.mockResolvedValueOnce([rule]); // renderer rules
    queryMock.mockResolvedValueOnce([]);     // renderer goals (empty)
    const out = await runHook();
    expect(out).toBeTruthy();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("HIVEMIND RULES");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("no DROP TABLE on prod");
  });

  it("gates the renderer SELECTs on the cached table list when trusted", async () => {
    // ensureTable above warms the table cache; knownTablesOrNull then returns
    // a trusted, non-null list so the renderer can skip SELECTs for absent
    // tables (avoids a 42P01 on every SessionStart). Both present here → both
    // rules + goals SELECTs still fire, exercising the tableExists predicate.
    knownTablesMock.mockResolvedValue(["hivemind_rules", "hivemind_goals"]);
    const rule = {
      id: "row-1", rule_id: "rule-1", text: "no DROP TABLE on prod",
      scope: "team", status: "active", assigned_by: "alice@activeloop.ai",
      version: 1, created_at: "2026-05-20T10:00:00Z",
      agent: "manual", plugin_version: "0.7.99",
    };
    queryMock.mockResolvedValueOnce([]);     // placeholder SELECT
    queryMock.mockResolvedValueOnce([]);     // placeholder INSERT
    queryMock.mockResolvedValueOnce([rule]); // renderer rules
    queryMock.mockResolvedValueOnce([]);     // renderer goals (empty)
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("no DROP TABLE on prod");
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("skips the renderer SELECTs when the trusted table list omits rules + goals", async () => {
    // Fresh workspace: knownTablesOrNull returns [] → the renderer fires no
    // SELECT. Only the placeholder SELECT + INSERT run.
    knownTablesMock.mockResolvedValue([]);
    await runHook();
    // placeholder SELECT + placeholder INSERT = 2 (renderer fires no SELECT
    // when no tables are trusted).
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT path FROM/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^INSERT INTO/);
  });

  it("HIVEMIND_CAPTURE=false: no placeholder, no DDL (ensure), but renderer still runs", async () => {
    await runHook({ HIVEMIND_CAPTURE: "false" });
    // ensureTable + ensureSessionsTable are DDL writes (create/heal),
    // so they're gated on captureEnabled along with the placeholder
    // INSERT. The renderer runs unconditionally because it's read-only.
    expect(ensureTableMock).not.toHaveBeenCalled();
    expect(ensureSessionsTableMock).not.toHaveBeenCalled();
    // 2 renderer SELECTs (rules + goals). Both tables are lazy-created
    // by their respective CLI / VFS write paths; SessionStart never
    // DDL-touches them.
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT .* FROM "hivemind_rules"/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^SELECT .* FROM "hivemind_goals"/);
    expect(debugLogMock).toHaveBeenCalledWith(
      "placeholder + schema ensure skipped (HIVEMIND_CAPTURE=false)",
    );
  });

  // (SkillOpt is no longer fired from SessionStart — it's event-driven now via
  // PreToolUse/UserPromptSubmit — so the old weekly-trigger branch tests were removed.)

  it("swallows placeholder errors and logs via both loggers", async () => {
    ensureTableMock.mockRejectedValue(new Error("table boom"));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(
      expect.stringContaining("placeholder failed: table boom"),
    );
  });

  it("skips setup when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValue(null);
    await runHook();
    expect(ensureTableMock).not.toHaveBeenCalled();
  });

  it("skips setup when session_id is empty", async () => {
    stdinMock.mockResolvedValue({ session_id: "", cwd: "/x" });
    await runHook();
    expect(ensureTableMock).not.toHaveBeenCalled();
  });
});

// ═══ Centralized autoupdate ═════════════════════════════════════════════════

describe("session-start hook — centralized autoupdate", () => {
  // The autoUpdate helper itself is exhaustively tested in autoupdate.test.ts.
  // Here we only verify the hook wires it up correctly.

  it("invokes autoUpdate exactly once with agent: 'claude'", async () => {
    await runHook();
    expect(autoUpdateMock).toHaveBeenCalledTimes(1);
    expect(autoUpdateMock.mock.calls[0][1]).toEqual({ agent: "claude" });
  });

  it("passes the loaded creds (so the helper can read creds.autoupdate)", async () => {
    const creds = { token: "tok", orgId: "o", orgName: "acme", userName: "alice", workspaceId: "default" };
    loadCredsMock.mockReturnValue(creds);
    await runHook();
    expect(autoUpdateMock.mock.calls[0][0]).toEqual(creds);
  });

  it("passes null creds through (the helper short-circuits on it)", async () => {
    loadCredsMock.mockReturnValue(null);
    await runHook();
    expect(autoUpdateMock).toHaveBeenCalledTimes(1);
    expect(autoUpdateMock.mock.calls[0][0]).toBeNull();
  });

  // (autoUpdate-internal failure modes — network down, missing binary,
  // unknown subcommand — are exhaustively covered in autoupdate.test.ts.
  // The contract for the hook is "best-effort; never block session
  // start"; the helper itself enforces that by swallowing all errors.)
});

// ═══ Negative-pattern guard: legacy paths must NOT re-appear ════════════════

describe("session-start hook — legacy autoupdate paths are gone", () => {
  // Catches a regression where someone re-introduces the legacy paths.
  // After centralization, the hook MUST go through the autoUpdate helper
  // exclusively (which we mock above) — no direct execSync, no direct
  // fetch against GitHub raw `package.json`.
  //
  // We can't `vi.spyOn(childProcess, "execSync")` directly because of an
  // ESM namespace-immutability limit in vitest:
  //   https://vitest.dev/guide/browser/#limitations
  // The fetch-spy below provides the load-bearing negative check: the
  // legacy autoupdate flow ALWAYS started with a `fetch(githubraw)`, so
  // if no fetch fires, the legacy probe is gone, and by construction the
  // marketplace `claude plugin update` execSync that was gated on the
  // probe result can't fire either.

  it("does not call fetch from session-start (legacy GitHub raw probe)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("should not be called"));
    await runHook();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(autoUpdateMock).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ═══ Fatal catch ════════════════════════════════════════════════════════════

describe("session-start hook — fatal catch", () => {
  it("catches a stdin throw and exits 0", async () => {
    stdinMock.mockRejectedValue(new Error("bad stdin"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await runHook();
    await new Promise(r => setImmediate(r));
    expect(debugLogMock).toHaveBeenCalledWith("fatal: bad stdin");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// Additional branch coverage — context-shape edge cases that survived
// the autoupdate centralization (the hook still composes additionalContext
// from creds + version stamp, just without the legacy update plumbing).
describe("session-start hook — context shape edge cases", () => {
  it("includes version notice when getInstalledVersion returns a value", async () => {
    getInstalledVersionMock.mockReturnValue("0.7.4");
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("✅ Hivemind v0.7.4");
  });

  it("omits version notice when getInstalledVersion returns null", async () => {
    getInstalledVersionMock.mockReturnValue(null);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain("Hivemind v");
  });


  it("workspaceId missing on creds falls back to 'default' in context", async () => {
    loadCredsMock.mockReturnValue({
      token: "t", orgId: "o", orgName: "acme", userName: "alice",
      // workspaceId omitted
    });
    const out = await runHook();
    const parsed = JSON.parse(out!);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("workspace: default");
  });

  // ── Not-logged-in localMinedNote ternary branches ───────────────────────────
  // Three branches in src/hooks/session-start.ts ~line 216:
  //   1. localMined === 0  → note is empty, no mention of skills
  //   2. localMined === 1  → singular "1 local skill from past..."
  //   3. localMined  >  1  → plural "N local skills from past..."

  it("omits the mined-skills note in the not-logged-in branch when manifest is empty", async () => {
    loadCredsMock.mockReturnValue(null);
    countLocalManifestEntriesMock.mockReturnValue(0);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Not logged in to Deeplake");
    // The localMinedNote has a unique phrase that only appears in the
    // count-driven note, not in the static skillify command list.
    expect(ctx).not.toContain("live in ~/.claude/skills");
    expect(ctx).not.toContain("local skill from past");
    expect(ctx).not.toContain("local skills from past");
  });

  it("uses SINGULAR noun in the not-logged-in note when exactly 1 skill is mined", async () => {
    loadCredsMock.mockReturnValue(null);
    countLocalManifestEntriesMock.mockReturnValue(1);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("1 local skill from past");
    expect(ctx).not.toContain("1 local skills from past");
    expect(ctx).toContain("hivemind login");
  });

  it("uses PLURAL noun in the not-logged-in note when more than 1 skill is mined", async () => {
    loadCredsMock.mockReturnValue(null);
    countLocalManifestEntriesMock.mockReturnValue(5);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("5 local skills from past");
    expect(ctx).toContain("hivemind login");
  });

  it("logs `auto-mine: triggered (background)` when maybeAutoMineLocal returns triggered=true", async () => {
    // Coverage guard for the ternary on src/hooks/session-start.ts:145.
    // The "triggered=true" branch is what runs on real fresh-install
    // flows — a coverage gap there means the path the conversion play
    // depends on isn't asserted.
    loadCredsMock.mockReturnValue(null);
    maybeAutoMineLocalMock.mockReturnValueOnce({ triggered: true });
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith("auto-mine: triggered (background)");
  });

  it("MUST NOT render insight prose in additionalContext, even when manifest is full (security invariant)", async () => {
    // Codex P1 regression guard: the hook's model-visible
    // additionalContext channel must never carry LLM-derived insight
    // strings. session-start.js used to call getLatestInsightEntry()
    // and feed the gate's prose into additionalContext, which is a
    // prompt-injection vector. The rich insight banner now lives
    // exclusively on the user-visible systemMessage channel via the
    // notifications rule. Test by simulating a populated manifest
    // and asserting the count surface fires, not the insight one.
    loadCredsMock.mockReturnValue(null);
    countLocalManifestEntriesMock.mockReturnValue(7);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("7 local skills from past");
    expect(ctx).toContain("hivemind login");
    // Negative patterns — these are exactly what the user-visible
    // notifications-rule branch renders. If any of them slip into
    // additionalContext, the prompt-injection vector is back.
    expect(ctx).not.toContain("found a pattern");
    expect(ctx).not.toContain("📌");
    expect(ctx).not.toContain("✨");
    expect(ctx).not.toContain("Minted skill");
    expect(ctx).not.toContain("claude -p '/");
  });

  it("does NOT append the mined-skills note when user is logged in (even with manifest present)", async () => {
    // Logged-in users see the welcomeRule notification instead; the
    // session-start hook itself must NOT inline the skill count in the
    // logged-in `additionalContext` (would duplicate the wow-effect CTA).
    countLocalManifestEntriesMock.mockReturnValue(5);
    const out = await runHook();
    const parsed = JSON.parse(out!);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Logged in to Deeplake");
    // Same unique-phrase test as the manifest-empty branch — checks the
    // count-driven note is absent without false-matching the static
    // skillify command list.
    expect(ctx).not.toContain("live in ~/.claude/skills");
    expect(ctx).not.toContain("local skills from past");
  });
});
