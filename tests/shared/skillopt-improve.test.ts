import { describe, it, expect, vi } from "vitest";
import { improveSkillIfFailed, findInvocation } from "../../src/skillify/skillopt-improve.js";
import type { QueryFn } from "../../src/skillify/skill-invocations.js";

/** Session rows: a Skill invocation + surrounding turns. */
const sessionRows = (sid: string) => [
  { message: { type: "user_message", content: "smoke test posthog", session_id: sid } },
  { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "posthog--kamo" }), session_id: sid, timestamp: "t1" } },
  { message: { type: "assistant_message", content: "I mocked the PostHog client", session_id: sid } },
];
const SKILL_ROW = {
  name: "posthog", author: "kamo", project: "p", project_key: "pk", local_path: "", install: "global",
  source_sessions: "[]", source_agent: "claude_code", scope: "me", contributors: JSON.stringify(["kamo"]),
  description: "smoke test", trigger_text: "posthog", body: "## Rules\n1. mock the client", version: 2,
};

/** Query mock dispatching by SQL shape; records any INSERT. */
function makeQuery(opts: { skillRows?: unknown[] } = {}) {
  const inserts: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("INSERT INTO")) { inserts.push(sql); return []; }
    if (sql.includes("/sessions/")) return sessionRows("s1");
    if (sql.includes('FROM "skills"')) return (opts.skillRows ?? [SKILL_ROW]) as Array<Record<string, unknown>>;
    return [];
  });
  return { query, inserts };
}
const FAIL_JUDGE = async () => '{"success":0,"confidence":0.9,"reason":"mocked the client — event never reaches PostHog"}';
const PASS_JUDGE = async () => '{"success":1,"confidence":0.9,"reason":"worked"}';
const PROPOSER = async () => '[{"op":"append","content":"Always assert the real outbound HTTP request."}]';

const base = (query: QueryFn, over: Partial<Parameters<typeof improveSkillIfFailed>[0]> = {}) => ({
  query,
  sessionsTable: "sessions", skillsTable: "skills", workspaceId: "ws",
  sessionId: "s1", skillRef: "posthog--kamo", reaction: "no you fucked up, mocking hides the bug",
  judge: FAIL_JUDGE, proposerModel: PROPOSER, collaborator: "kamo", now: "2026-06-06T00:00:00Z",
  ...over,
});

describe("findInvocation", () => {
  it("locates the latest invocation of the skill in the session", async () => {
    const { query } = makeQuery();
    const inv = await findInvocation(query, "sessions", "s1", "posthog", "kamo");
    expect(inv).toMatchObject({ sessionId: "s1", name: "posthog", author: "kamo", ts: "t1" });
  });
  it("returns null when the skill wasn't invoked in the session", async () => {
    const { query } = makeQuery();
    expect(await findInvocation(query, "sessions", "s1", "other", "x")).toBeNull();
  });

  it("pins the invocation by tool_use_id (not the latest retry) when given one", async () => {
    const two = vi.fn(async () => [
      { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "x--a" }), session_id: "s", timestamp: "t1", tool_use_id: "tu1" } },
      { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "x--a" }), session_id: "s", timestamp: "t2", tool_use_id: "tu2" } },
    ] as Array<Record<string, unknown>>);
    expect((await findInvocation(two, "sessions", "s", "x", "a", "tu1"))?.ts).toBe("t1"); // pinned, not latest
    expect((await findInvocation(two, "sessions", "s", "x", "a", "nope"))?.ts).toBe("t2"); // unknown id → latest fallback
    expect((await findInvocation(two, "sessions", "s", "x", "a"))?.ts).toBe("t2"); // no pin → latest
  });

  it("skips rows whose recorded session_id differs from the queried one (path-LIKE collision guard)", async () => {
    const q: QueryFn = async () => [
      { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "x--a" }), session_id: "OTHER", timestamp: "t1" } },
    ] as Array<Record<string, unknown>>;
    expect(await findInvocation(q, "sessions", "s1", "x", "a")).toBeNull(); // row.session_id !== s1 → skipped
  });
});

describe("improveSkillIfFailed", () => {
  it("judge says FAILED → improves the skill and publishes a new version", async () => {
    const { query, inserts } = makeQuery();
    const recordEdit = vi.fn();
    const r = await improveSkillIfFailed(base(query, { recordEdit }));
    expect(r).toMatchObject({ judged: true, failed: true, improved: true, version: 3 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("Always assert the real outbound HTTP request.");
    expect(inserts[0]).toContain("'team'"); // scope promoted on publish
    expect(recordEdit).toHaveBeenCalledWith("posthog", "kamo", expect.any(Array), 3); // publishedVersion=3
  });

  it("judge says OK → no improvement, no publish", async () => {
    const { query, inserts } = makeQuery();
    const r = await improveSkillIfFailed(base(query, { judge: PASS_JUDGE }));
    expect(r).toMatchObject({ judged: true, failed: false, improved: false });
    expect(inserts).toHaveLength(0);
  });

  it("an empty reaction still judges + improves (no reaction appended to the window)", async () => {
    const { query, inserts } = makeQuery();
    const r = await improveSkillIfFailed(base(query, { reaction: "   " })); // whitespace → the append branch is skipped
    expect(r).toMatchObject({ judged: true, failed: true, improved: true });
    expect(inserts).toHaveLength(1);
  });

  it("failed + proposer makes no change → judged, not improved", async () => {
    const { query, inserts } = makeQuery();
    const r = await improveSkillIfFailed(base(query, { proposerModel: async () => "[]" })); // no edits
    expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: "proposer made no change" });
    expect(inserts).toHaveLength(0);
  });

  it("failed + edit already proposed (dedup) → judged, not improved", async () => {
    const { query, inserts } = makeQuery();
    const r = await improveSkillIfFailed(base(query, { alreadyProposed: () => true }));
    expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: "edit already proposed (dedup)" });
    expect(inserts).toHaveLength(0);
  });

  it("not an org skill (bare/plugin) → not judged", async () => {
    const { query } = makeQuery();
    expect(await improveSkillIfFailed(base(query, { skillRef: "bare" }))).toMatchObject({ judged: false });
    expect(await improveSkillIfFailed(base(query, { skillRef: "hivemind:memory" }))).toMatchObject({ judged: false });
  });

  it("invocation not in the session → not judged", async () => {
    const { query } = makeQuery();
    // invocationRetries:0 → skip the real Bug#1 backoff; this exercises the immediate not-found path.
    expect(await improveSkillIfFailed(base(query, { skillRef: "ghost--x", invocationRetries: 0 }))).toMatchObject({ judged: false });
  });

  it("failed but the skill isn't in the org table → judged, not improved", async () => {
    const { query, inserts } = makeQuery({ skillRows: [] });
    const r = await improveSkillIfFailed(base(query));
    expect(r).toMatchObject({ judged: true, failed: true, improved: false });
    expect(inserts).toHaveLength(0);
  });

  it("failed but the edit was already proposed (meta dedup) → not improved", async () => {
    const { query, inserts } = makeQuery();
    const r = await improveSkillIfFailed(base(query, { alreadyProposed: () => true }));
    expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: expect.stringContaining("dedup") });
    expect(inserts).toHaveLength(0);
  });

  // Deeplake insert→read visibility lag (expected latency, not a defect): the invocation row is
  // written by a SEPARATE process (capture.js) and lands on a short visibility lag, so a worker
  // that fires on a fast reaction reads stale and finds nothing. The window-retry (K=3) only helps
  // if the user keeps typing; a single fast/final reaction would silently no-op. So the worker
  // must retry-with-backoff itself.
  it("retries findInvocation when the row hasn't propagated yet (Deeplake lag) → then judges + improves", async () => {
    let sessionsCalls = 0;
    const inserts: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO")) { inserts.push(sql); return []; }
      if (sql.includes("/sessions/")) { sessionsCalls++; return sessionsCalls <= 2 ? [] : sessionRows("s1"); } // miss twice, then visible
      if (sql.includes('FROM "skills"')) return [SKILL_ROW];
      return [];
    });
    const sleeps: number[] = [];
    const r = await improveSkillIfFailed(base(query, {
      invocationRetries: 5, invocationBackoffMs: 1000, sleep: async (ms: number) => { sleeps.push(ms); },
    }));
    expect(r).toMatchObject({ judged: true, failed: true, improved: true, version: 3 });
    expect(sessionsCalls).toBe(4); // 3 retry polls (miss, miss, hit) + 1 windowAroundInvocation query
    expect(sleeps).toEqual([1000, 2000]);                  // linear backoff between the two misses, then hit
    expect(inserts).toHaveLength(1);
  });

  it("gives up gracefully (no publish) when the row never propagates — bounded retries, e.g. capture disabled", async () => {
    let sessionsCalls = 0;
    const inserts: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO")) { inserts.push(sql); return []; }
      if (sql.includes("/sessions/")) { sessionsCalls++; return []; }   // never lands
      if (sql.includes('FROM "skills"')) return [SKILL_ROW];
      return [];
    });
    const sleeps: number[] = [];
    const r = await improveSkillIfFailed(base(query, {
      invocationRetries: 3, invocationBackoffMs: 1, sleep: async (ms: number) => { sleeps.push(ms); },
    }));
    expect(r).toMatchObject({ judged: false, improved: false, reason: "invocation not found in session" });
    expect(sessionsCalls).toBe(4);        // 1 initial + 3 bounded retries, then stop
    expect(sleeps).toHaveLength(3);       // backed off 3 times then gave up
    expect(inserts).toHaveLength(0);      // nothing inserted — graceful no-op
  });

  it("does NOT retry on a query error (e.g. 402) — fails fast, no spinning", async () => {
    let sessionsCalls = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("/sessions/")) { sessionsCalls++; throw new Error("402 insufficient balance"); }
      if (sql.includes('FROM "skills"')) return [SKILL_ROW];
      return [];
    });
    await expect(improveSkillIfFailed(base(query, { invocationRetries: 5, invocationBackoffMs: 1, sleep: async () => {} })))
      .rejects.toThrow(/402/);
    expect(sessionsCalls).toBe(1);        // threw on the first query — no retry loop
  });

  // ── resolveEdit outcome-signal tests ─────────────────────────────────────────────
  describe("resolveEdit outcome signal", () => {
    it("calls resolveEdit('applied') when the judge says the task passed", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      const r = await improveSkillIfFailed(base(query, { judge: PASS_JUDGE, resolveEdit }));
      expect(r).toMatchObject({ judged: true, failed: false });
      expect(resolveEdit).toHaveBeenCalledOnce();
      expect(resolveEdit).toHaveBeenCalledWith("posthog", "kamo", "applied");
    });

    it("does NOT call resolveEdit when failed and skill is not in the org table (infrastructure gap, not a verdict on the prior edit)", async () => {
      const { query } = makeQuery({ skillRows: [] });
      const resolveEdit = vi.fn();
      const r = await improveSkillIfFailed(base(query, { resolveEdit }));
      expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: "skill not in org table" });
      expect(resolveEdit).not.toHaveBeenCalled();
    });

    it("does NOT call resolveEdit when failed and the proposer makes no change (can't produce a replacement, not a verdict on the prior edit)", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      const r = await improveSkillIfFailed(base(query, { proposerModel: async () => "[]", resolveEdit }));
      expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: "proposer made no change" });
      expect(resolveEdit).not.toHaveBeenCalled();
    });

    it("does NOT call resolveEdit when failed and dedup blocks the improvement (edit is still in play, not definitively bad)", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      const r = await improveSkillIfFailed(base(query, { alreadyProposed: () => true, resolveEdit }));
      expect(r).toMatchObject({ judged: true, failed: true, improved: false, reason: "edit already proposed (dedup)" });
      expect(resolveEdit).not.toHaveBeenCalled();
    });

    it("does NOT call resolveEdit when the invocation is not found (not judged)", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      await improveSkillIfFailed(base(query, { skillRef: "ghost--x", invocationRetries: 0, resolveEdit }));
      expect(resolveEdit).not.toHaveBeenCalled();
    });

    it("does NOT call resolveEdit for non-org skills (not judged)", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      await improveSkillIfFailed(base(query, { skillRef: "bare", resolveEdit }));
      await improveSkillIfFailed(base(query, { skillRef: "hivemind:memory", resolveEdit }));
      expect(resolveEdit).not.toHaveBeenCalled();
    });

    it("swallows a resolveEdit error so it cannot affect the improvement result", async () => {
      const { query } = makeQuery();
      const resolveEdit = vi.fn(() => { throw new Error("disk full"); });
      // Should still return a valid result despite the error in resolveEdit
      const r = await improveSkillIfFailed(base(query, { judge: PASS_JUDGE, resolveEdit }));
      expect(r).toMatchObject({ judged: true, failed: false, improved: false });
    });

    it("calls resolveEdit('reverted', priorVersion) before publishing — version-stable resolution prevents cross-version race", async () => {
      // resolveEdit must receive the current skill version (2, from SKILL_ROW) so the worker
      // can use fingerprintForVersion to resolve the exact entry that produced that version,
      // rather than log recency which would mark a newer edit if this is a delayed judgment.
      const { query } = makeQuery();
      const resolveEdit = vi.fn();
      const recordEdit = vi.fn();
      const r = await improveSkillIfFailed(base(query, { resolveEdit, recordEdit }));
      expect(r).toMatchObject({ judged: true, failed: true, improved: true });
      expect(recordEdit).toHaveBeenCalledWith("posthog", "kamo", expect.any(Array), 3); // publishedVersion=3
      expect(resolveEdit).toHaveBeenCalledOnce();
      // priorVersion=2 = current.version from SKILL_ROW; allows version-stable fingerprint lookup
      expect(resolveEdit).toHaveBeenCalledWith("posthog", "kamo", "reverted", 2);
    });
  });
});
