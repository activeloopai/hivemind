import { describe, it, expect, vi } from "vitest";
import {
  invokedSkillRef,
  splitOrgSkill,
  listSkillInvocations,
  windowAroundInvocation,
  parseMessage,
  type SkillInvocation,
} from "../../src/skillify/skill-invocations.js";

const TABLE = "sessions";
function mockQuery(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  return { fn: vi.fn(async (sql: string) => { calls.push(sql); return rows; }), calls };
}
const toolCall = (skill: string, sessionId = "S1", ts = "t", asString = false) => {
  const msg = { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill }), session_id: sessionId, timestamp: ts };
  return { message: asString ? JSON.stringify(msg) : msg, last_update_date: ts };
};

describe("parseMessage", () => {
  it("returns null for non-string/non-object inputs and bad JSON; parses strings + passes objects", () => {
    expect(parseMessage(123)).toBeNull();        // number → null (the typeof-object miss)
    expect(parseMessage(true)).toBeNull();        // boolean → null
    expect(parseMessage(null)).toBeNull();        // null → null
    expect(parseMessage("not json")).toBeNull();  // unparseable string → null
    expect(parseMessage('{"a":1}')).toEqual({ a: 1 }); // JSON string → object
    expect(parseMessage({ a: 1 })).toEqual({ a: 1 });  // object → passthrough
  });
});

describe("invokedSkillRef", () => {
  it("returns the skill ref for a Skill tool_call (object or stringified input)", () => {
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "a--b" }) })).toBe("a--b");
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Skill", tool_input: { skill: "a--b" } as unknown })).toBe("a--b");
  });
  it("returns null for non-Skill tools and non-tool_call messages", () => {
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Bash", tool_input: "{}" })).toBeNull();
    expect(invokedSkillRef({ type: "assistant_message", content: "use the Skill tool" })).toBeNull();
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Skill", tool_input: "not json" })).toBeNull();
  });
  it("recognizes a SKILL.md load via a read path or a shell command (pi/codex/hermes)", () => {
    expect(invokedSkillRef({ type: "tool_call", tool_name: "read", tool_input: { path: "/x/skills/a--b/SKILL.md" } as unknown })).toBe("a--b");
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Bash", tool_input: JSON.stringify({ command: "sed -n '1,5p' /x/.agents/skills/a--b/SKILL.md" }) })).toBe("a--b");
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Bash", tool_input: JSON.stringify({ command: "ls /tmp" }) })).toBeNull();
  });
  it("handles codex's nested .system path (intermediate dirs before the ref)", () => {
    // codex reads org skills as `sed -n '1,220p' ~/.codex/skills/.system/<name--author>/SKILL.md`
    expect(invokedSkillRef({ type: "tool_call", tool_name: "Bash", tool_input: JSON.stringify({ command: "sed -n '1,220p' /home/e/.codex/skills/.system/posthog--kamo/SKILL.md" }) })).toBe("posthog--kamo");
  });
});

describe("splitOrgSkill", () => {
  it("splits <name>--<author>, last -- wins", () => {
    expect(splitOrgSkill("posthog-smoke--kamo.aghbalyan")).toEqual({ name: "posthog-smoke", author: "kamo.aghbalyan" });
    expect(splitOrgSkill("some-skill--first-last")).toEqual({ name: "some-skill", author: "first-last" });
  });
  it("rejects plugin-namespaced, bare, and malformed refs", () => {
    expect(splitOrgSkill("hivemind:hivemind-memory")).toBeNull(); // plugin
    expect(splitOrgSkill("update-config")).toBeNull();            // bare
    expect(splitOrgSkill("baz--")).toBeNull();                    // empty author
  });
  it("rejects refs with path separators / traversal (no path escape)", () => {
    expect(splitOrgSkill("../../etc--x")).toBeNull();
    expect(splitOrgSkill("ok--..%2f")).toBeNull();   // contains ..
    expect(splitOrgSkill("a/b--c")).toBeNull();      // separator
    expect(splitOrgSkill("a--b/c")).toBeNull();      // separator in author
  });
});

describe("listSkillInvocations", () => {
  it("coarse-prefilters on \"Skill\" then keeps only org-skill tool_calls", async () => {
    const { fn, calls } = mockQuery([
      toolCall("posthog-smoke--kamo"),                 // org → kept
      toolCall("hivemind:hivemind-memory"),            // plugin → dropped
      toolCall("update-config"),                       // bare → dropped
      { message: { type: "assistant_message", content: "mentions Skill" }, last_update_date: "t" }, // prose → dropped
      toolCall("pg-debug--sasun", "S2", "t2", true),   // org, stringified message → kept
    ]);
    const got = await listSkillInvocations(fn, TABLE, { sinceIso: "2026-06-01", limit: 100 });
    expect(calls[0]).toContain(`CAST(message AS TEXT) LIKE '%"Skill"%'`);
    // prefilter must ALSO match SKILL.md loads (pi/codex/hermes read/shell invocations), else they
    // get dropped before invokedSkillRef can evaluate them.
    expect(calls[0]).toContain(`CAST(message AS TEXT) LIKE '%/SKILL.md%'`);
    expect(calls[0]).toContain("last_update_date >= '2026-06-01'");
    expect(calls[0]).toContain("LIMIT 100");
    expect(got).toEqual([
      { sessionId: "S1", name: "posthog-smoke", author: "kamo", ts: "t" },
      { sessionId: "S2", name: "pg-debug", author: "sasun", ts: "t2" },
    ]);
  });

  // Sweep C-series sqlIdent hardening: the sessions table name is interpolated
  // as a bare SQL identifier (the Deeplake endpoint can't parameterize it), so
  // a non-identifier table must throw before any query is dispatched.
  it("rejects a non-identifier sessions table before dispatching any query", async () => {
    const { fn, calls } = mockQuery([]);
    await expect(
      listSkillInvocations(fn, 'sessions"; DROP TABLE sessions; --', { limit: 1 }),
    ).rejects.toThrow(/Invalid SQL identifier/);
    expect(calls).toHaveLength(0);
  });
});

describe("windowAroundInvocation", () => {
  const inv: SkillInvocation = { sessionId: "S1", name: "posthog-smoke", author: "kamo", ts: "t5" };
  // turns: u1, a1, [skill invoked here], u2(pushback), a2  → window before=1/after=2 ⇒ a1..a2
  const rows = [
    { message: { type: "user_message", content: "first" } },
    { message: { type: "assistant_message", content: "ack" } },
    { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "posthog-smoke--kamo" }), timestamp: "t5" } },
    { message: { type: "tool_call", tool_name: "Bash", tool_input: "{}" } }, // non-skill tool → ignored
    { message: { type: "user_message", content: "no that's wrong" } },
    { message: { type: "assistant_message", content: "fixing" } },
  ];

  it("windows `before` turns before and `after` after the invocation", async () => {
    const { fn, calls } = mockQuery(rows);
    const out = await windowAroundInvocation(fn, TABLE, inv, { before: 1, after: 2 });
    expect(calls[0]).toContain("path LIKE '/sessions/%S1%'");
    // invIndex = 2 (two turns before the skill tool_call). before 1 → from turn 1; after 2 → turns 2,3.
    expect(out).toBe("ASSISTANT: ack\n\nUSER: no that's wrong\n\nASSISTANT: fixing");
  });

  it("falls back to session end when the invocation can't be located", async () => {
    const { fn } = mockQuery([
      { message: { type: "user_message", content: "hi" } },
      { message: { type: "assistant_message", content: "bye" } },
    ]);
    const out = await windowAroundInvocation(fn, TABLE, inv, { before: 5, after: 5 });
    expect(out).toBe("USER: hi\n\nASSISTANT: bye"); // whole (short) transcript
  });

  it("drops rows from a different session_id (path-LIKE collision) and empty-content turns", async () => {
    const { fn } = mockQuery([
      { message: { type: "user_message", content: "real", session_id: "S1" } },
      { message: { type: "user_message", content: "from another session", session_id: "OTHER" } }, // collision → dropped
      { message: { type: "assistant_message", content: "", session_id: "S1" } }, // empty text → skipped
      { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "posthog-smoke--kamo" }), timestamp: "t5", session_id: "S1" } },
      { message: { type: "user_message", content: "pushback", session_id: "S1" } },
    ]);
    const out = await windowAroundInvocation(fn, TABLE, inv, { before: 5, after: 5 });
    expect(out).not.toContain("another session"); // OTHER session_id dropped
    expect(out).toContain("real");
    expect(out).toContain("pushback");
  });

  it("elides a window longer than maxChars", async () => {
    const big = "x".repeat(400);
    const { fn } = mockQuery([
      { message: { type: "user_message", content: big } },
      { message: { type: "assistant_message", content: big } },
    ]);
    const out = await windowAroundInvocation(fn, TABLE, inv, { before: 5, after: 5, maxChars: 150 });
    expect(out).toContain("chars elided");
    expect(out.length).toBeLessThan(300);
  });

  it("drops rows from a different session + escapes LIKE wildcards (exact match)", async () => {
    const { fn, calls } = mockQuery([
      { message: { type: "user_message", content: "first", session_id: "S1" } },
      { message: { type: "tool_call", tool_name: "Skill", tool_input: JSON.stringify({ skill: "posthog-smoke--kamo" }), session_id: "S1", timestamp: "t5" } },
      { message: { type: "assistant_message", content: "did X", session_id: "S1" } },
      { message: { type: "user_message", content: "LEAK from other session", session_id: "S2" } }, // collision → dropped
    ]);
    const out = await windowAroundInvocation(fn, TABLE, inv, { before: 5, after: 5 });
    expect(calls[0]).toContain("ESCAPE '\\'");
    expect(out).toContain("did X");
    expect(out).not.toContain("LEAK from other session");
  });
});
