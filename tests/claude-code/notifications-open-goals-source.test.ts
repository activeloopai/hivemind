import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `src/notifications/sources/open-goals.ts` — the
 * SessionStart banner source that surfaces a user's open goals.
 *
 * The source reads from the dedicated `hivemind_goals` table via the
 * shared DeeplakeApi client. We mock at the network seam (the class's
 * `query` method) and capture the exact SQL the banner caused, so any
 * regression in:
 *   - SQL injection escaping of `creds.userName`
 *   - the canonical owner-form matching that tolerates short vs
 *     full-email forms without admitting substring collisions
 *   - the status filter (must not surface closed goals)
 *   - the limit (banner is bounded — never lets a flood of goals stretch)
 * fails fast.
 *
 * Coverage in trunk pre-PR #193: 9.8% statements, 16.7% functions.
 */

const queryMock = vi.fn();
// Default: resolve `null` ("untrusted table list") so the pre-flight guard
// falls back to the SELECT-then-catch path — keeps every pre-existing test
// (which only stubs `query`) exercising the query as before.
const knownTablesMock = vi.fn(async (): Promise<string[] | null> => null);

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(
      _token: string,
      _apiUrl: string,
      _orgId: string,
      _workspaceId: string,
      _tableName: string,
    ) { /* nothing */ }
    query(sql: string) { return queryMock(sql); }
    knownTablesOrNull() { return knownTablesMock(); }
  },
}));

import { fetchOpenGoals, formatOpenGoalsLine } from "../../src/notifications/sources/open-goals.js";

const BASE_CREDS = {
  token: "tok",
  userName: "alice@activeloop.ai",
  orgId: "org-1",
  apiUrl: "https://api.example",
  workspaceId: "ws",
};

beforeEach(() => {
  queryMock.mockReset();
  knownTablesMock.mockReset();
  // Restore the default "untrusted list -> fall back to query" behavior.
  knownTablesMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── auth gating ─────────────────────────────────────────────────────────────

describe("fetchOpenGoals — auth gating", () => {
  it("returns null on missing token", async () => {
    expect(await fetchOpenGoals({ ...BASE_CREDS, token: "" } as any, "hivemind_goals")).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns null on missing userName (banner has no one to filter for)", async () => {
    expect(await fetchOpenGoals({ ...BASE_CREDS, userName: "" } as any, "hivemind_goals")).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns null on missing orgId", async () => {
    expect(await fetchOpenGoals({ ...BASE_CREDS, orgId: "" } as any, "hivemind_goals")).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── SQL shape ───────────────────────────────────────────────────────────────

describe("fetchOpenGoals — SQL shape", () => {
  it("issues a single SELECT scoped to current owner with canonical-form match + non-closed status filter + version dedup + limit 25", async () => {
    queryMock.mockResolvedValue([]);
    await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals_test");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/^SELECT goal_id, owner, status, content FROM "hivemind_goals_test"/);
    // Canonical owner forms (exact full / exact short / `short@%` alias)
    // instead of a `'%user%'` substring scan, which collides across users.
    expect(sql).toContain(`(owner = 'alice@activeloop.ai' OR owner = 'alice' OR owner LIKE 'alice@%')`);
    expect(sql).not.toContain(`LIKE '%alice`);
    expect(sql).toContain(`status IN ('opened', 'in_progress')`);
    // 'closed' status must never show up in the banner — that would
    // surface user's already-done work as if it were still open.
    expect(sql).not.toMatch(/closed/);
    // One row per goal_id — multiple stored versions count once.
    expect(sql).toContain("version = (SELECT MAX(version)");
    expect(sql).toContain("LIMIT 25");
  });

  it("escapes single quotes in userName (SQL injection guard)", async () => {
    queryMock.mockResolvedValue([]);
    await fetchOpenGoals({ ...BASE_CREDS, userName: "O'Brien" } as any, "hivemind_goals");
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain(`owner = 'O''Brien'`);
  });

  it("refuses to issue a query when goalsTableName is not a valid SQL identifier", async () => {
    queryMock.mockResolvedValue([]);
    // sqlIdent() throws on anything outside [a-zA-Z_][a-zA-Z0-9_]*; the
    // surrounding try/catch in fetchOpenGoals converts that into a
    // null banner. Net effect: no DROP TABLE payload ever reaches the
    // query layer, and the banner silently drops out for that session.
    const result = await fetchOpenGoals(BASE_CREDS as any, 'evil"; DROP TABLE x; --');
    expect(result).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── pre-flight table-existence guard (42P01 prevention) ──────────────────────

describe("fetchOpenGoals — table-existence pre-flight", () => {
  it("skips the SELECT entirely when the goals table is absent from the trusted list (no server-side 42P01)", async () => {
    // Fresh org that never created hivemind_goals: the table list is trusted
    // and does not include it. The banner must NOT issue the SELECT — sending
    // it would log a 42P01 server-side on every SessionStart even though the
    // catch hides it from the user.
    knownTablesMock.mockResolvedValue(["sessions", "memory", "hivemind_rules"]);
    const result = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(result).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("issues the SELECT when the goals table IS present in the trusted list", async () => {
    knownTablesMock.mockResolvedValue(["sessions", "hivemind_goals"]);
    queryMock.mockResolvedValue([]);
    await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the SELECT when the table list is untrusted (null) — a transient lookup blip must not hide a real table", async () => {
    knownTablesMock.mockResolvedValue(null);
    queryMock.mockResolvedValue([]);
    await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

// ── result mapping ──────────────────────────────────────────────────────────

describe("fetchOpenGoals — result mapping", () => {
  it("returns null on empty result set (no banner to show)", async () => {
    queryMock.mockResolvedValue([]);
    expect(await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals")).toBeNull();
  });

  it("returns null when API yields non-array (e.g. error envelope)", async () => {
    queryMock.mockResolvedValue({ error: "boom" });
    expect(await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals")).toBeNull();
  });

  it("maps rows to count + first-3 labels, using the FIRST non-empty line of content", async () => {
    queryMock.mockResolvedValue([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: "Ship search\n\nbody" },
      { goal_id: "g2", owner: "alice@activeloop.ai", status: "in_progress", content: "Land memory\nmore" },
      { goal_id: "g3", owner: "alice@activeloop.ai", status: "opened", content: "Onboard team" },
      { goal_id: "g4", owner: "alice@activeloop.ai", status: "opened", content: "fourth — should not appear in sample" },
    ]);
    const summary = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(4);
    // Sample is capped at 3 (the format line ellipsis-budget)
    expect(summary!.sample).toEqual(["Ship search", "Land memory", "Onboard team"]);
  });

  it("filters out rows whose owner isn't a canonical form of userName (defense-in-depth past the SQL gate)", async () => {
    queryMock.mockResolvedValue([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: "mine" },
      // A stray row that slipped past the SQL gate but logically isn't this user
      { goal_id: "g2", owner: "bob@activeloop.ai",   status: "opened", content: "his" },
    ]);
    const summary = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(summary!.count).toBe(1);
    expect(summary!.sample).toEqual(["mine"]);
  });

  it("accepts both short and full-email owner forms (different agents write different forms)", async () => {
    queryMock.mockResolvedValue([
      // Short-form row from one agent, full-email creds from another
      { goal_id: "g1", owner: "alice", status: "opened", content: "from short-form row" },
    ]);
    const summary = await fetchOpenGoals(
      { ...BASE_CREDS, userName: "alice@activeloop.ai" } as any,
      "hivemind_goals",
    );
    expect(summary!.count).toBe(1);
  });

  it("drops rows missing owner or content (no NPE in label extraction)", async () => {
    queryMock.mockResolvedValue([
      { goal_id: "g1", owner: "", status: "opened", content: "x" },               // empty owner
      { goal_id: "g2", owner: "alice@activeloop.ai", status: "opened", content: "" }, // empty content
      { goal_id: "g3", owner: "alice@activeloop.ai", status: "opened", content: "ok" },
    ]);
    const summary = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(summary!.count).toBe(1);
    expect(summary!.sample).toEqual(["ok"]);
  });

  it("truncates long labels to 120 chars (matching the resume brief width) with an ellipsis", async () => {
    const long = "x".repeat(200);
    queryMock.mockResolvedValue([
      { goal_id: "g1", owner: "alice@activeloop.ai", status: "opened", content: long },
    ]);
    const summary = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(summary!.sample[0].length).toBe(120);
    expect(summary!.sample[0].endsWith("…")).toBe(true);
  });

  it("returns null and never throws when the API query rejects (network/auth/missing table)", async () => {
    queryMock.mockRejectedValue(new Error("relation \"hivemind_goals\" does not exist"));
    const summary = await fetchOpenGoals(BASE_CREDS as any, "hivemind_goals");
    expect(summary).toBeNull();
  });
});

// ── formatOpenGoalsLine ─────────────────────────────────────────────────────

describe("formatOpenGoalsLine", () => {
  it("returns the empty string on null or zero-count summary", () => {
    expect(formatOpenGoalsLine(null)).toBe("");
    expect(formatOpenGoalsLine({ count: 0, sample: [] })).toBe("");
  });

  it("uses singular 'goal' when count=1, with the goal on its own bullet line", () => {
    expect(formatOpenGoalsLine({ count: 1, sample: ["Ship X"] })).toBe("1 goal open:\n   • Ship X");
  });

  it("uses plural 'goals' when count>1, one bullet line per sampled goal", () => {
    expect(formatOpenGoalsLine({ count: 3, sample: ["A", "B", "C"] })).toBe("3 goals open:\n   • A\n   • B\n   • C");
  });

  it("omits the sample tail when sample is empty (just the head)", () => {
    expect(formatOpenGoalsLine({ count: 5, sample: [] })).toBe("5 goals open:");
  });
});
