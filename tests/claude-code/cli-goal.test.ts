import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CLI handler tests for `hivemind goal`.
 *
 * Path B (CLI) is the only goal-write path that cursor / hermes / pi can
 * reach (their plugin hooks can't rewrite Write tool calls — see
 * src/commands/goal.ts header), so any regression in argparse, "not
 * logged in" gating, SQL shape, or escaping silently breaks team-wide
 * goal visibility from those three agents.
 *
 * Mocks DeeplakeApi at the network boundary (per CLAUDE.md testing
 * philosophy) so every test captures the exact SQL the CLI would send.
 *
 * Coverage: goal.ts in trunk was at 1.8% / 0% functions pre-PR #193.
 */

const ensureGoalsTableMock = vi.fn();
const queryMock = vi.fn();

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
    ensureGoalsTable(name: string) { return ensureGoalsTableMock(name); }
    query(sql: string) { return queryMock(sql); }
  },
}));

import { runGoalCommand } from "../../src/commands/goal.js";
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
  goalsTableName: "hivemind_goals_test",
  memoryPath: "/tmp/mem",
};

let stdout: string[] = [];
let stderr: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdout = [];
  stderr = [];
  ensureGoalsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]);
  loadConfigMock.mockReset().mockReturnValue(VALID_CONFIG);
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as any);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as any);
  // process.exit must throw so async functions stop on the first exit() —
  // catch in tests with expectExit(). Mirrors tests/claude-code/cli-rules.test.ts.
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code ?? 0}__`);
  }) as any);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

function expectExit(code: number, fn: () => unknown): Promise<void> {
  return expect(fn).rejects.toThrow(new RegExp(`__EXIT_${code}__`));
}

// Concatenated stdout/stderr for substring matching, since each .write call
// is one entry in the array but the CLI doesn't guarantee one entry per line.
const allOut = () => stdout.join("");
const allErr = () => stderr.join("");

// ── help / no-arg / unknown ─────────────────────────────────────────────────

describe("runGoalCommand — help & unknown sub", () => {
  it("prints goal usage with no subcommand", async () => {
    await runGoalCommand([]);
    expect(allOut()).toContain("hivemind goal — manage team goals");
    expect(ensureGoalsTableMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("prints goal usage with --help", async () => {
    await runGoalCommand(["--help"]);
    expect(allOut()).toContain("hivemind goal add");
  });

  it("exits 1 on unknown subcommand", async () => {
    await expectExit(1, () => runGoalCommand(["wat"]));
    expect(allErr()).toContain("unknown goal subcommand: wat");
  });
});

// ── login gating ────────────────────────────────────────────────────────────

describe("runGoalCommand — requires login", () => {
  it("exits 1 with a 'not logged in' message when loadConfig returns null", async () => {
    loadConfigMock.mockReturnValue(null);
    await expectExit(1, () => runGoalCommand(["add", "ship it"]));
    expect(allErr()).toMatch(/not logged in/i);
    // critical: no DDL, no query when un-authed (would 401 + leak the
    // attempt across orgs if it slipped through)
    expect(ensureGoalsTableMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("list also gates on login", async () => {
    loadConfigMock.mockReturnValue(null);
    await expectExit(1, () => runGoalCommand(["list"]));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("done also gates on login", async () => {
    loadConfigMock.mockReturnValue(null);
    await expectExit(1, () => runGoalCommand(["done", "abc"]));
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── goal add ────────────────────────────────────────────────────────────────

describe("runGoalCommand — add", () => {
  it("issues exactly one INSERT into the configured goals table, with v=1 + opened + manual agent", async () => {
    await runGoalCommand(["add", "ship the goals feature"]);
    expect(ensureGoalsTableMock).toHaveBeenCalledExactlyOnceWith("hivemind_goals_test");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/^INSERT INTO "hivemind_goals_test" \(id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version\)/);
    expect(sql).toContain("'opened'");
    expect(sql).toContain("'alice@activeloop.ai'");
    expect(sql).toContain("'manual'");
    expect(sql).toContain("E'ship the goals feature'");
    expect(sql).toContain(", 1, ");
    // emits the goal_id (UUID v4) to stdout so the agent can pipe it
    expect(allOut().trim()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("joins multiple positional args into one text (shell word-splitting fallback)", async () => {
    await runGoalCommand(["add", "ship", "the", "goals"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("E'ship the goals'");
  });

  it("exits 1 when text is missing", async () => {
    await expectExit(1, () => runGoalCommand(["add"]));
    expect(allErr()).toContain("usage: hivemind goal add");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("exits 1 when text is whitespace-only (no row inserted)", async () => {
    await expectExit(1, () => runGoalCommand(["add", "   "]));
    expect(allErr()).toContain("usage: hivemind goal add");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("escapes single quotes in the goal text (SQL injection guard)", async () => {
    await runGoalCommand(["add", "Levon's first goal"]);
    const sql = queryMock.mock.calls[0][0] as string;
    // sqlStr() doubles the single quote: 'Levon''s first goal'
    expect(sql).toContain("E'Levon''s first goal'");
  });
});

// ── goal add --agent (capture provenance) ───────────────────────────────────

describe("runGoalCommand — add --agent (capture provenance)", () => {
  it("default provenance stays 'manual' when --agent is absent", async () => {
    await runGoalCommand(["add", "a plain goal"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'manual'");
    expect(sql).not.toContain("'capture'");
  });

  it("`--agent capture` stamps the agent column as 'capture', not 'manual'", async () => {
    await runGoalCommand(["add", "--agent", "capture", "Add rate-limiting to webhook handler"]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'capture'");
    // the literal must not also carry the default
    expect(sql).not.toMatch(/'manual', ''\)$/);
    expect(sql).toContain("E'Add rate-limiting to webhook handler'");
  });

  it("parses --agent regardless of position relative to the text", async () => {
    await runGoalCommand(["add", "park this", "--agent", "capture"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("'capture'");
    // flag is stripped out of the text, not joined into it
    expect(sql).toContain("E'park this'");
    expect(sql).not.toContain("--agent");
  });

  it("preserves a multi-line body passed as a single arg (the capture context package)", async () => {
    const body = "Add rate-limiting to webhook handler\n\nStart here: add a per-IP token bucket\nFiles: src/webhook/handler.ts";
    await runGoalCommand(["add", "--agent", "capture", body]);
    const sql = queryMock.mock.calls[0][0] as string;
    // newlines survive as real characters into the E'...' content literal
    // (sqlStr strips other control chars but preserves \n), so a single
    // quoted multi-line arg is enough to store the whole context package.
    expect(sql).toContain("Start here: add a per-IP token bucket\nFiles: src/webhook/handler.ts");
  });

  it("rejects an unknown --agent value (no INSERT issued — guards the SQL literal)", async () => {
    await expectExit(1, () => runGoalCommand(["add", "--agent", "robert'); DROP TABLE", "x"]));
    expect(allErr()).toContain("invalid --agent");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects --agent with no value (no INSERT issued)", async () => {
    await expectExit(1, () => runGoalCommand(["add", "x", "--agent"]));
    expect(allErr()).toContain("--agent requires a value");
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── goal list ───────────────────────────────────────────────────────────────

describe("runGoalCommand — list", () => {
  it("default scope is --mine: WHERE owner = current_user, no all-clause", async () => {
    queryMock.mockResolvedValueOnce([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: "first goal\nbody" },
    ]);
    await runGoalCommand(["list"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`WHERE owner = 'alice@activeloop.ai'`);
    expect(sql).toContain('FROM "hivemind_goals_test"');
    expect(sql).toContain("ORDER BY created_at DESC LIMIT 50");
    // tab-separated row: goal_id\towner\tstatus\tfirst-line-of-content
    expect(allOut()).toContain("g1\talice@activeloop.ai\topened\tfirst goal\n");
  });

  it("--all drops the WHERE owner filter so every team member's goal shows", async () => {
    queryMock.mockResolvedValueOnce([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: "mine" },
      { goal_id: "g2", owner: "bob@activeloop.ai", status: "closed", content: "his" },
    ]);
    await runGoalCommand(["list", "--all"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).not.toContain("WHERE owner");
    // both rows
    expect(allOut()).toContain("g1\t");
    expect(allOut()).toContain("g2\t");
  });

  it("prints '(no goals)' on empty result", async () => {
    queryMock.mockResolvedValueOnce([]);
    await runGoalCommand(["list"]);
    expect(allOut()).toContain("(no goals)");
  });

  it("trims the content to the first line so multi-line goals don't break the TSV", async () => {
    queryMock.mockResolvedValueOnce([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: "short summary\nlong\nbody here" },
    ]);
    await runGoalCommand(["list"]);
    expect(allOut()).toContain("\tshort summary\n");
    expect(allOut()).not.toContain("long");
  });

  it("exits 1 with the API error message on query failure", async () => {
    queryMock.mockRejectedValueOnce(new Error("net down"));
    await expectExit(1, () => runGoalCommand(["list"]));
    expect(allErr()).toContain("hivemind goal list: net down");
  });
});

// ── goal get (full context package for resume) ──────────────────────────────

describe("runGoalCommand — get", () => {
  it("prints the FULL multi-line content (not just the first line) for the latest version", async () => {
    const pkg = "Add rate-limiting to webhook handler\n\nStart here: per-IP token bucket\nFiles: src/webhook/handler.ts";
    queryMock.mockResolvedValueOnce([{ content: pkg }]);
    await runGoalCommand(["get", "g-uuid"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/^SELECT content FROM "hivemind_goals_test"/);
    expect(sql).toContain(`WHERE goal_id = 'g-uuid'`);
    // latest version wins so a re-saved package isn't served stale
    expect(sql).toContain("ORDER BY version DESC, created_at DESC LIMIT 1");
    // whole body reaches stdout — this is what resume transfers into the session
    expect(allOut()).toContain(pkg);
    expect(allOut()).toContain("Files: src/webhook/handler.ts");
  });

  it("exits 1 when the goal_id is unknown (no body to transfer)", async () => {
    queryMock.mockResolvedValueOnce([]);
    await expectExit(1, () => runGoalCommand(["get", "missing"]));
    expect(allErr()).toContain("goal not found: missing");
  });

  it("exits 1 with usage when goal_id is missing", async () => {
    await expectExit(1, () => runGoalCommand(["get"]));
    expect(allErr()).toContain("usage: hivemind goal get");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("gates on login", async () => {
    loadConfigMock.mockReturnValue(null);
    await expectExit(1, () => runGoalCommand(["get", "g-uuid"]));
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── goal done / progress ────────────────────────────────────────────────────

describe("runGoalCommand — done & progress", () => {
  it("`done` UPDATEs status=closed by goal_id", async () => {
    await runGoalCommand(["done", "11111111-2222-3333-4444-555555555555"]);
    // Heals the schema first so a preexisting table without `updated_at` can't fail.
    expect(ensureGoalsTableMock).toHaveBeenCalledExactlyOnceWith("hivemind_goals_test");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/^UPDATE "hivemind_goals_test" SET status = 'closed'/);
    expect(sql).toContain(`WHERE goal_id = '11111111-2222-3333-4444-555555555555'`);
    expect(allOut()).toContain("11111111-2222-3333-4444-555555555555 -> closed");
  });

  it("`progress` accepts opened / in_progress / closed", async () => {
    await runGoalCommand(["progress", "abc", "in_progress"]);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`SET status = 'in_progress'`);
    expect(sql).toContain(`WHERE goal_id = 'abc'`);
  });

  it("`progress` rejects any other status (no UPDATE issued)", async () => {
    await expectExit(1, () => runGoalCommand(["progress", "abc", "frozen"]));
    expect(allErr()).toContain("invalid status: frozen");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("`done` without an id prints usage + exits 1", async () => {
    await expectExit(1, () => runGoalCommand(["done"]));
    expect(allErr()).toContain("usage: hivemind goal done");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("`progress` without a status prints usage + exits 1", async () => {
    await expectExit(1, () => runGoalCommand(["progress", "abc"]));
    expect(allErr()).toContain("usage: hivemind goal progress");
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── negative SQL patterns: UPDATE coalescing guard ──────────────────────────

describe("goal CLI — does NOT issue back-to-back UPDATEs on the same row", () => {
  // Backend coalesces two rapid UPDATEs against the same row, silently
  // dropping one (see CLAUDE.md "UPDATE coalescing" note). The CLI must
  // never split a single logical mutation into two UPDATEs.
  it("`goal done` issues at most one UPDATE", async () => {
    await runGoalCommand(["done", "abc"]);
    const updates = queryMock.mock.calls.filter(c => /^UPDATE\b/.test(c[0]));
    expect(updates).toHaveLength(1);
  });
});
