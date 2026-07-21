import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderNotifications } from "../../src/notifications/format.js";
import {
  registerRule,
  listRules,
  evaluateRules,
  _resetRulesForTest,
} from "../../src/notifications/rules/registry.js";
import { emit } from "../../src/notifications/delivery/index.js";
import { readState, writeState, statePath } from "../../src/notifications/state.js";
import { readQueue, writeQueue, enqueueNotification, queuePath } from "../../src/notifications/queue.js";
import { drainSessionStart } from "../../src/notifications/index.js";
import { fetchBackendNotifications } from "../../src/notifications/sources/backend.js";
import type { Notification, Rule } from "../../src/notifications/index.js";
import type { Credentials } from "../../src/commands/auth-creds.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Targeted coverage tests for branches not exercised by the main
 * notifications.test.ts. Each test names the source file + branch it covers.
 */

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-notif-cov-"));
  ORIGINAL_HOME = process.env.HOME;
  setFakeHome(TEMP_HOME);
  _resetRulesForTest();
});

afterEach(() => {
  clearFakeHome();
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// format.ts: severity fallback branches
// ---------------------------------------------------------------------------

describe("format — severity fallbacks", () => {
  it("uses info prefix when severity is undefined", () => {
    const items: Notification[] = [{ id: "a", title: "T", body: "B", dedupKey: {} }];
    expect(renderNotifications(items)).toContain("🐝");
  });

  it("falls back to info prefix when severity is an unrecognized string", () => {
    const items: Notification[] = [
      { id: "a", severity: "weird-bogus" as any, title: "T", body: "B", dedupKey: {} },
    ];
    expect(renderNotifications(items)).toContain("🐝");
  });
});

// ---------------------------------------------------------------------------
// rules/registry.ts: duplicate registration + trigger filtering
// (Welcome rule's optional-field rendering moved to primary-banner tests.)
// ---------------------------------------------------------------------------

describe("rules registry — edge cases", () => {
  const dummyRule: Rule = {
    id: "dummy-test-rule",
    trigger: "session_start",
    evaluate: () => null,
  };

  it("throws on duplicate rule id", () => {
    registerRule(dummyRule);
    expect(() => registerRule(dummyRule)).toThrow(/duplicate rule id/);
  });

  it("listRules returns currently registered rules", () => {
    expect(listRules()).toHaveLength(0);
    registerRule(dummyRule);
    expect(listRules()).toHaveLength(1);
  });

  it("evaluateRules ignores rules with non-matching triggers", () => {
    const adHocRule: Rule = {
      id: "ad-hoc-test",
      trigger: "ad_hoc",
      evaluate: () => ({ id: "should-not-fire", title: "T", body: "B", dedupKey: {} }),
    };
    registerRule(adHocRule);
    const out = evaluateRules("session_start", {
      agent: "claude-code",
      creds: null,
      state: { shown: {} },
    });
    expect(out).toHaveLength(0);
  });

  it("evaluateRules drops rules that return null", () => {
    const nullRule: Rule = {
      id: "always-null",
      trigger: "session_start",
      evaluate: () => null,
    };
    registerRule(nullRule);
    const out = evaluateRules("session_start", {
      agent: "claude-code",
      creds: null,
      state: { shown: {} },
    });
    expect(out).toHaveLength(0);
  });

  it("evaluateRules returns empty array when no rules are registered (for-loop branch)", () => {
    // Coverage gap: without this case the for-loop in evaluateRules never
    // exercises the empty-RULES branch — when _resetRulesForTest leaves the
    // array empty, the loop body should never run and the function should
    // return [].
    const out = evaluateRules("session_start", {
      agent: "claude-code",
      creds: null,
      state: { shown: {} },
    });
    expect(out).toEqual([]);
  });

  it("evaluateRules pushes truthy results onto the output array (covered branch)", () => {
    // Coverage gap: the `if (result) out.push(result)` truthy branch on
    // registry.ts:30. Other tests register rules that return null; this
    // one returns a real Notification so the push runs.
    const firingRule: Rule = {
      id: "always-fires",
      trigger: "session_start",
      evaluate: () => ({ id: "always-fires", title: "T", body: "B", dedupKey: { v: 1 } }),
    };
    registerRule(firingRule);
    const out = evaluateRules("session_start", {
      agent: "claude-code",
      creds: null,
      state: { shown: {} },
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("always-fires");
  });
});

// ---------------------------------------------------------------------------
// delivery/index.ts: empty-string short-circuit
// ---------------------------------------------------------------------------

describe("delivery dispatch — empty short-circuit", () => {
  it("emit() returns silently when notifications array is empty", () => {
    // The dispatch now takes notifications (not a pre-rendered string)
    // so per-agent adapters can split content per channel — see the
    // model/user split in delivery/claude-code.ts. An empty list still
    // short-circuits without writing anything to stdout.
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    emit("claude-code", []);
    expect(writes).toEqual([]);
    vi.restoreAllMocks();
  });

  it("routes userVisibleOnly notifications to systemMessage ONLY, never to additionalContext (codex P1 guard)", () => {
    // Security invariant: notifications carrying LLM-derived content
    // set userVisibleOnly so their body never reaches the model's
    // additionalContext channel. The user still sees the message in
    // the terminal via systemMessage. Without this split an
    // adversarial gate output could prompt-inject the next session.
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    emit("claude-code", [
      {
        id: "user-only",
        severity: "info",
        title: "User-visible title",
        body: "BODY-WITH-LLM-PROSE",
        dedupKey: { x: 1 },
        userVisibleOnly: true,
      },
    ]);
    expect(writes).toHaveLength(1);
    const payload = JSON.parse(writes[0]);
    expect(payload.systemMessage).toContain("BODY-WITH-LLM-PROSE");
    expect(payload.hookSpecificOutput.additionalContext).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("routes non-user-only notifications to BOTH channels (legacy behavior)", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    emit("claude-code", [
      {
        id: "regular",
        severity: "info",
        title: "Static title",
        body: "STATIC-BODY",
        dedupKey: { x: 1 },
      },
    ]);
    const payload = JSON.parse(writes[0]);
    expect(payload.systemMessage).toContain("STATIC-BODY");
    expect(payload.hookSpecificOutput.additionalContext).toContain("STATIC-BODY");
    vi.restoreAllMocks();
  });

  it("emits a mixed batch correctly: only safe items reach additionalContext, all items reach systemMessage", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    emit("claude-code", [
      {
        id: "safe",
        severity: "info",
        title: "Safe",
        body: "STATIC-BODY",
        dedupKey: { x: 1 },
      },
      {
        id: "unsafe",
        severity: "info",
        title: "Unsafe",
        body: "LLM-DERIVED",
        dedupKey: { x: 2 },
        userVisibleOnly: true,
      },
    ]);
    const payload = JSON.parse(writes[0]);
    // additionalContext (model channel) has ONLY the safe body
    expect(payload.hookSpecificOutput.additionalContext).toContain("STATIC-BODY");
    expect(payload.hookSpecificOutput.additionalContext).not.toContain("LLM-DERIVED");
    // systemMessage (user channel) has BOTH
    expect(payload.systemMessage).toContain("STATIC-BODY");
    expect(payload.systemMessage).toContain("LLM-DERIVED");
    vi.restoreAllMocks();
  });
});


// ---------------------------------------------------------------------------
// state.ts: shape-mismatch malformed JSON branches
// ---------------------------------------------------------------------------

describe("state — malformed shape (valid JSON, wrong type)", () => {
  it("treats null payload as empty", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(statePath(), "null", "utf-8");
    expect(readState()).toEqual({ shown: {} });
  });

  it("treats array payload as empty", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(statePath(), "[1,2,3]", "utf-8");
    expect(readState()).toEqual({ shown: {} });
  });

  it("treats { shown: 'not-object' } as empty", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(statePath(), JSON.stringify({ shown: "string-not-object" }), "utf-8");
    expect(readState()).toEqual({ shown: {} });
  });

  it("writeState round-trips through readState", () => {
    writeState({ shown: { foo: { dedupKey: "k", shownAt: "2026" } } });
    expect(readState().shown.foo.dedupKey).toBe("k");
  });
});

// ---------------------------------------------------------------------------
// queue.ts: shape-mismatch malformed JSON
// ---------------------------------------------------------------------------

describe("queue — malformed shape (valid JSON, wrong type)", () => {
  it("treats null payload as empty queue", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(queuePath(), "null", "utf-8");
    expect(readQueue()).toEqual({ queue: [] });
  });

  it("treats { queue: 'not-array' } as empty queue", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(queuePath(), JSON.stringify({ queue: "string-not-array" }), "utf-8");
    expect(readQueue()).toEqual({ queue: [] });
  });

  it("writeQueue round-trips through readQueue", () => {
    writeQueue({ queue: [{ id: "x", title: "T", body: "B", dedupKey: {} }] });
    expect(readQueue().queue).toHaveLength(1);
    expect(readQueue().queue[0].id).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// sources/backend.ts: edge-case branches
// ---------------------------------------------------------------------------

describe("backend source — edge cases", () => {
  const FRESH_CREDS: Credentials = {
    token: "tok",
    orgId: "org",
    userName: "u",
    savedAt: "2026-05-06T00:00:00Z",
  };

  afterEach(() => vi.restoreAllMocks());

  it("uses DEFAULT_API_URL when creds.apiUrl is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args: any[]) => {
      return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
    });
    await fetchBackendNotifications({ ...FRESH_CREDS, apiUrl: undefined });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("api.deeplake.ai");
  });

  it("omits X-Activeloop-Org-Id header when creds.orgId is missing", async () => {
    let captured: any = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (...args: any[]) => {
      captured = args[1];
      return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
    });
    await fetchBackendNotifications({ ...FRESH_CREDS, orgId: "" });
    const headers = captured?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("X-Activeloop-Org-Id");
  });

  it("treats malformed body shape as empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ wrong: "shape" }), { status: 200 });
    });
    const out = await fetchBackendNotifications(FRESH_CREDS);
    expect(out).toEqual([]);
  });

  it("normalizes invalid severity to info", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          notifications: [
            { id: "a", severity: "BOGUS", title: "T", body: "B", dedup_key: "k" },
          ],
        }),
        { status: 200 },
      );
    });
    const out = await fetchBackendNotifications(FRESH_CREDS);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
  });

  it("handles missing dedup_key on server response (defaults to empty string)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          notifications: [{ id: "a", title: "T", body: "B" }],
        }),
        { status: 200 },
      );
    });
    const out = await fetchBackendNotifications(FRESH_CREDS);
    expect(out).toHaveLength(1);
    expect(out[0].dedupKey).toEqual({ id: "a", dedup_key: "" });
  });
});

// ---------------------------------------------------------------------------
// drainSessionStart: queue-drain-on-empty-fresh branch
// ---------------------------------------------------------------------------

describe("drainSessionStart — queue drained even when nothing fresh", () => {
  afterEach(() => vi.restoreAllMocks());

  it("when all notifications are dedup'd, queue is still drained", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });

    const n: Notification = { id: "x", title: "T", body: "B", dedupKey: { v: 1 } };
    await enqueueNotification(n);

    // First drain: fires, marks as shown
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(writes.length).toBe(1);
    expect(readQueue().queue.length).toBe(0);

    // Re-enqueue same notification with same dedupKey → fresh.length === 0
    await enqueueNotification(n);
    expect(readQueue().queue.length).toBe(1);

    writes.length = 0;
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(writes.length).toBe(0); // dedup'd
    // Critical: queue still drained even though nothing emitted
    expect(readQueue().queue.length).toBe(0);
  });

  it("all claimed by another process: queue drained, returns without emitting", async () => {
    // Plant a notification on queue. Mark its claim file as already taken
    // (simulate the sibling SessionStart hook winning the race) by mocking
    // tryClaim to return false for every notification.
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    const stateModule = await import("../../src/notifications/state.js");
    vi.spyOn(stateModule, "tryClaim").mockReturnValue(false);

    const n: Notification = { id: "y", title: "T2", body: "B2", dedupKey: { v: 99 } };
    await enqueueNotification(n);
    await drainSessionStart({ agent: "claude-code", creds: null });
    expect(writes.length).toBe(0);
    expect(readQueue().queue.length).toBe(0); // drained anyway
  });

  it("catches and logs error if rule evaluation throws", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c: any) => {
      writes.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    // Force readState to throw — drainSessionStart wraps everything in try/catch
    // and must not propagate the error.
    const stateModule = await import("../../src/notifications/state.js");
    vi.spyOn(stateModule, "readState").mockImplementation(() => {
      throw new Error("synthetic readState failure");
    });
    await expect(
      drainSessionStart({ agent: "claude-code", creds: null }),
    ).resolves.toBeUndefined();
    expect(writes.length).toBe(0);
  });
});

