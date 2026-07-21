import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CLI handler tests for `hivemind rules`. The handler is thin — argparse
 * + dispatch into the rules module — so we mock both `loadConfig` and
 * `DeeplakeApi`. `ensureRulesTable` and `query` are vi.fn so individual
 * tests can scope the assertion to "what SQL did the handler cause to be
 * sent?"
 */

const ensureRulesTableMock = vi.fn();
const queryMock = vi.fn();
const knownTablesOrNullMock = vi.fn();

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(
      _token: string,
      _apiUrl: string,
      _orgId: string,
      _workspaceId: string,
      _tableName: string,
    ) { /* nothing */ }
    ensureRulesTable(name: string) { return ensureRulesTableMock(name); }
    query(sql: string) { return queryMock(sql); }
    knownTablesOrNull() { return knownTablesOrNullMock(); }
  },
}));

vi.mock("../../src/cli/version.js", () => ({
  getVersion: () => "0.7.99",
}));

import { runRulesCommand } from "../../src/commands/rules.js";
import { loadConfig } from "../../src/config.js";
const loadConfigMock = loadConfig as unknown as ReturnType<typeof vi.fn>;

const VALID_CONFIG = {
  token: "tok",
  orgId: "org",
  orgName: "OrgName",
  userName: "alice@activeloop.ai",
  workspaceId: "ws",
  apiUrl: "https://api",
  tableName: "memory",
  sessionsTableName: "sessions",
  skillsTableName: "skills",
  rulesTableName: "hivemind_rules",
  memoryPath: "/tmp/mem",
};

let logged: string[] = [];
let erred: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = [];
  erred = [];
  ensureRulesTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]);
  // Default: table-existence lookup is "unknown" (null), so list falls through
  // to the SELECT-then-catch path — the behavior the existing tests assert.
  // Tests that exercise the skip-on-missing gate override this per-case.
  knownTablesOrNullMock.mockReset().mockResolvedValue(null);
  loadConfigMock.mockReset().mockReturnValue(VALID_CONFIG);
  logSpy = vi.spyOn(console, "log").mockImplementation((...a: any[]) => { logged.push(a.join(" ")); });
  errSpy = vi.spyOn(console, "error").mockImplementation((...a: any[]) => { erred.push(a.join(" ")); });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code ?? 0}__`);
  }) as any);
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

function expectExit(code: number, fn: () => unknown): Promise<void> {
  return expect(fn).rejects.toThrow(new RegExp(`__EXIT_${code}__`));
}

// ── help / no-arg / unknown subcommand ──────────────────────────────────────

describe("runRulesCommand — help & unknown sub", () => {
  it("prints usage with no subcommand", async () => {
    await runRulesCommand([]);
    expect(logged.some(l => l.includes("hivemind rules — manage team-wide rules"))).toBe(true);
    // no api call when only printing usage
    expect(ensureRulesTableMock).not.toHaveBeenCalled();
  });

  it("prints usage with --help", async () => {
    await runRulesCommand(["--help"]);
    expect(logged.some(l => l.includes("hivemind rules add"))).toBe(true);
  });

  it("exits 1 on unknown subcommand", async () => {
    await expectExit(1, () => runRulesCommand(["wat"]));
    expect(erred.some(l => l.includes("Unknown rules subcommand: wat"))).toBe(true);
  });
});

// ── login gating ────────────────────────────────────────────────────────────

describe("runRulesCommand — requires login", () => {
  it("exits 2 with a clear message when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValueOnce(null);
    await expectExit(2, () => runRulesCommand(["list"]));
    expect(erred.some(l => l.includes("Not logged in"))).toBe(true);
    expect(ensureRulesTableMock).not.toHaveBeenCalled();
  });
});

// ── add ─────────────────────────────────────────────────────────────────────

describe("runRulesCommand — add", () => {
  it("INSERTs a v1 row and prints a confirmation with the rule_id", async () => {
    await runRulesCommand(["add", "no DROP TABLE on prod creds"]);

    expect(ensureRulesTableMock).toHaveBeenCalledTimes(1);
    expect(ensureRulesTableMock).toHaveBeenCalledWith("hivemind_rules");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toMatch(/^INSERT INTO "hivemind_rules"/);
    expect(sql).toContain(`E'no DROP TABLE on prod creds'`);
    expect(sql).toContain("'alice@activeloop.ai'");
    expect(sql).toContain("'0.7.99'");
    // confirmation line includes the v1 marker
    expect(logged.some(l => /Added rule .* \(v1\)\./.test(l))).toBe(true);
  });

  it("accepts --scope team explicitly", async () => {
    await runRulesCommand(["add", "x", "--scope", "team"]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain("'team'");
  });

  it("rejects --scope me with a clear error", async () => {
    await expectExit(1, () => runRulesCommand(["add", "x", "--scope", "me"]));
    expect(erred.some(l => l.includes("'team' only in v1"))).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("exits 1 when text is missing", async () => {
    await expectExit(1, () => runRulesCommand(["add"]));
    expect(erred.some(l => l.includes("Missing rule text"))).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("does NOT swallow the flag value when text is in a positional slot", async () => {
    // Regression guard: `rules add "x" --scope team` — when the user
    // puts the text first and flags last, stripKnownFlags must not eat
    // the text as if it were a flag value.
    await runRulesCommand(["add", "x", "--scope=team"]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain(`E'x'`);
  });
});

// ── list ────────────────────────────────────────────────────────────────────

describe("runRulesCommand — list", () => {
  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "row-1",
      rule_id: "rule-aaaa-bbbb",
      text: "no DROP TABLE",
      scope: "team",
      status: "active",
      assigned_by: "alice@activeloop.ai",
      version: 1,
      created_at: "2026-05-20T10:00:00Z",
      agent: "manual",
      plugin_version: "0.7.99",
      ...overrides,
    };
  }

  it("renders active rules by default with full rule_id (so copy-paste into edit/done works)", async () => {
    queryMock.mockResolvedValueOnce([fakeRow()]);
    await runRulesCommand(["list"]);
    // List exercises a single SELECT (no per-rule SELECTs)
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT .* FROM "hivemind_rules" ORDER BY version DESC/);
    expect(logged.some(l => l.includes("[active]"))).toBe(true);
    // The FULL rule_id must appear — edit/done do an exact-match SELECT,
    // so a truncated id displayed here would fail to round-trip. Codex
    // review on S2 surfaced this regression risk; lock it in.
    expect(logged.some(l => l.includes("rule-aaaa-bbbb"))).toBe(true);
    expect(logged.some(l => l.includes("v1"))).toBe(true);
    expect(logged.some(l => l.includes("no DROP TABLE"))).toBe(true);
  });

  it("listed rule_id round-trips into edit (no truncation regression)", async () => {
    // E2E-style: list a row, capture the displayed id, then call edit
    // with that exact string. Both subcommands must agree on the id
    // shape — otherwise users get "Rule not found" when copy-pasting.
    const row = fakeRow({ rule_id: "11111111-2222-3333-4444-555555555555" });
    queryMock.mockResolvedValueOnce([row]);    // list SELECT
    queryMock.mockResolvedValueOnce([row]);    // edit's getRuleLatest SELECT
    queryMock.mockResolvedValueOnce([]);       // edit's INSERT

    await runRulesCommand(["list"]);
    // Pull the id out of the rendered row using a UUID regex — this is
    // exactly what a user would do by eye / clipboard.
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    const displayedRow = logged.find(l => l.startsWith("[active]"));
    const displayedId = displayedRow?.match(uuidRe)?.[0];
    expect(displayedId).toBe(row.rule_id);

    // Use the displayed id in edit and verify the SELECT lookup matches.
    await runRulesCommand(["edit", displayedId!, "tightened"]);
    const editSelectSql = queryMock.mock.calls[1][0];
    expect(editSelectSql).toContain(`rule_id = '${row.rule_id}'`);
    expect(erred).toEqual([]);
  });

  it("prints empty-state message when no rules match", async () => {
    queryMock.mockResolvedValueOnce([]);
    await runRulesCommand(["list"]);
    expect(logged.some(l => l.includes("(no rules with status=active)"))).toBe(true);
  });

  it("skips the SELECT and shows empty state when the rules table doesn't exist", async () => {
    // Regression: an org that has only ever run `rules list` has no
    // hivemind_rules table. The handler must NOT fire the doomed SELECT —
    // that logs a 42P01 server-side and can surface to the user as a bare
    // "fetch failed" through the streaming query path. A table-existence
    // lookup that returns a list WITHOUT the rules table short-circuits.
    knownTablesOrNullMock.mockResolvedValueOnce(["memory", "sessions"]);
    await runRulesCommand(["list"]);
    expect(queryMock).not.toHaveBeenCalled();
    expect(logged.some(l => l.includes("(no rules with status=active)"))).toBe(true);
  });

  it("still SELECTs when the table-existence lookup confirms the table exists", async () => {
    knownTablesOrNullMock.mockResolvedValueOnce(["memory", "hivemind_rules"]);
    queryMock.mockResolvedValueOnce([fakeRow()]);
    await runRulesCommand(["list"]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(logged.some(l => l.includes("[active]"))).toBe(true);
  });

  it("falls back to SELECT-then-catch when the table lookup is untrustworthy (null)", async () => {
    // A transient lookup failure (null) must NOT be read as "no table" —
    // otherwise a network blip would hide rules that really exist. Fall
    // through to the SELECT, which here returns a real row.
    knownTablesOrNullMock.mockResolvedValueOnce(null);
    queryMock.mockResolvedValueOnce([fakeRow()]);
    await runRulesCommand(["list"]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(logged.some(l => l.includes("rule-aaaa-bbbb"))).toBe(true);
  });

  it("honors --status done", async () => {
    queryMock.mockResolvedValueOnce([
      fakeRow({ rule_id: "A", status: "active" }),
      fakeRow({ rule_id: "B", status: "done" }),
    ]);
    await runRulesCommand(["list", "--status", "done"]);
    expect(logged.some(l => l.includes("[done]"))).toBe(true);
    expect(logged.every(l => !l.includes("[active]") || !l.startsWith("[active]"))).toBe(true);
  });

  it("rejects invalid --status values", async () => {
    await expectExit(1, () => runRulesCommand(["list", "--status", "pending"]));
    expect(erred.some(l => l.includes("Invalid --status"))).toBe(true);
  });

  it("rejects invalid --limit values (non-numeric)", async () => {
    await expectExit(1, () => runRulesCommand(["list", "--limit", "lots"]));
    expect(erred.some(l => l.includes("Invalid --limit"))).toBe(true);
  });

  it("rejects non-positive --limit", async () => {
    await expectExit(1, () => runRulesCommand(["list", "--limit", "0"]));
    expect(erred.some(l => l.includes("Invalid --limit"))).toBe(true);
  });

  it("honors --limit", async () => {
    queryMock.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => fakeRow({
        rule_id: `rule-${i}`,
        version: 1,
        created_at: `2026-05-20T10:${String(i).padStart(2, "0")}:00Z`,
      })),
    );
    await runRulesCommand(["list", "--limit", "3"]);
    // 3 rule rows + 0 footer rows = 3 logs
    const rowLines = logged.filter(l => l.startsWith("[active]") || l.startsWith("[done]"));
    expect(rowLines).toHaveLength(3);
  });
});

// ── edit ────────────────────────────────────────────────────────────────────

describe("runRulesCommand — edit", () => {
  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "row-1",
      rule_id: "rule-aaaa-bbbb",
      text: "old text",
      scope: "team",
      status: "active",
      assigned_by: "alice@activeloop.ai",
      version: 2,
      created_at: "2026-05-20T10:00:00Z",
      agent: "manual",
      plugin_version: "0.7.99",
      ...overrides,
    };
  }

  it("SELECTs previous, INSERTs a v+1 row with the new text", async () => {
    queryMock.mockResolvedValueOnce([fakeRow()]);
    queryMock.mockResolvedValueOnce([]); // INSERT response
    await runRulesCommand(["edit", "rule-aaaa-bbbb", "tightened text"]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT/);
    expect(queryMock.mock.calls[1][0]).toMatch(/^INSERT INTO "hivemind_rules"/);
    expect(queryMock.mock.calls[1][0]).toContain(`E'tightened text'`);
    expect(queryMock.mock.calls[1][0]).toContain(", 3, ");
    expect(logged.some(l => l.includes("Edited rule rule-aaaa-bbbb → v3"))).toBe(true);
  });

  it("exits 1 with a clear error when arguments are missing", async () => {
    await expectExit(1, () => runRulesCommand(["edit"]));
    await expectExit(1, () => runRulesCommand(["edit", "rule-aaaa-bbbb"]));
    expect(erred.some(l => l.includes("Usage: hivemind rules edit"))).toBe(true);
  });

  it("exits 1 when the rule does not exist", async () => {
    // SELECT returns empty, editRule throws "Rule not found"
    queryMock.mockResolvedValueOnce([]);
    await expectExit(1, () => runRulesCommand(["edit", "missing", "new text"]));
    expect(erred.some(l => l.includes("Edit failed: Rule not found: missing"))).toBe(true);
    // No INSERT — only the SELECT was issued.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

// ── done ────────────────────────────────────────────────────────────────────

describe("runRulesCommand — done", () => {
  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "row-1",
      rule_id: "rule-active",
      text: "still useful",
      scope: "team",
      status: "active",
      assigned_by: "alice@activeloop.ai",
      version: 4,
      created_at: "2026-05-20T10:00:00Z",
      agent: "manual",
      plugin_version: "0.7.99",
      ...overrides,
    };
  }

  it("INSERTs v+1 with status='done' and preserves prior text", async () => {
    queryMock.mockResolvedValueOnce([fakeRow()]);
    queryMock.mockResolvedValueOnce([]);
    await runRulesCommand(["done", "rule-active"]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertSql = queryMock.mock.calls[1][0];
    expect(insertSql).toContain("'done'");
    expect(insertSql).toContain(`E'still useful'`);
    expect(insertSql).toContain(", 5, ");
    expect(logged.some(l => l.includes("Marked rule rule-active done (v5)"))).toBe(true);
  });

  it("exits 1 when rule_id arg is missing", async () => {
    await expectExit(1, () => runRulesCommand(["done"]));
    expect(erred.some(l => l.includes("Usage: hivemind rules done"))).toBe(true);
  });
});

// ── ensureRulesTable wiring ─────────────────────────────────────────────────

describe("runRulesCommand — schema bootstrap", () => {
  it("calls ensureRulesTable exactly once on a WRITE invocation (codex legacy audit: read-only no longer ensures)", async () => {
    await runRulesCommand(["add", "rule"]);
    expect(ensureRulesTableMock).toHaveBeenCalledTimes(1);
    expect(ensureRulesTableMock).toHaveBeenCalledWith("hivemind_rules");
  });

  it("does NOT call ensureRulesTable on `list` (read-only — codex legacy audit P2)", async () => {
    loadConfigMock.mockReturnValueOnce({ ...VALID_CONFIG, rulesTableName: "rules_test" });
    await runRulesCommand(["list"]);
    // list is read-only → no DDL writes.
    expect(ensureRulesTableMock).not.toHaveBeenCalled();
  });

  it("calls ensureRulesTable on `add` (write — DDL needed)", async () => {
    await runRulesCommand(["add", "some rule text"]);
    expect(ensureRulesTableMock).toHaveBeenCalledTimes(1);
    expect(ensureRulesTableMock).toHaveBeenCalledWith("hivemind_rules");
  });

  it("`list` against MISSING table shows empty state (legacy users)", async () => {
    queryMock.mockReset().mockRejectedValueOnce(new Error(`Table does not exist: relation "hivemind_rules" does not exist`));
    await runRulesCommand(["list"]);
    expect(logged.some(l => l.includes("(no rules with status=active)"))).toBe(true);
    expect(ensureRulesTableMock).not.toHaveBeenCalled();
  });
});
