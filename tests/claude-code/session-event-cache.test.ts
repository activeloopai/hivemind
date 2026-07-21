import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Unit tests for src/hooks/session-event-cache.ts.
 *
 * The module computes CACHE_DIR from os.homedir() at import time, so we mock
 * node:os.homedir to a throwaway tmp dir and import the module fresh in each
 * test via vi.resetModules().
 */

let home: string;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => home };
});

type Mod = typeof import("../../src/hooks/session-event-cache.js");

async function load(): Promise<Mod> {
  vi.resetModules();
  return import("../../src/hooks/session-event-cache.js");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sec-test-"));
  delete process.env.HIVEMIND_SESSION_EVENT_CACHE;
});

afterEach(() => {
  try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe("session-event-cache — append + read roundtrip", () => {
  it("appends lines and reads them back in order", async () => {
    const m = await load();
    m.appendSessionEvent("sid", JSON.stringify({ type: "user_message", content: "a" }));
    m.appendSessionEvent("sid", JSON.stringify({ type: "assistant_message", content: "b" }));
    m.appendSessionEvent("sid", JSON.stringify({ type: "tool_call", tool_name: "Bash" }));

    const lines = m.readSessionEventCache("sid");
    expect(lines).not.toBeNull();
    expect(lines!).toHaveLength(3);
    expect(JSON.parse(lines![0]).content).toBe("a");
    expect(JSON.parse(lines![1]).content).toBe("b");
    expect(JSON.parse(lines![2]).tool_name).toBe("Bash");
  });

  it("each event maps to exactly one line even with embedded newlines", async () => {
    const m = await load();
    // JSON.stringify escapes newlines, so a multi-line message is one file line.
    m.appendSessionEvent("sid", JSON.stringify({ content: "line1\nline2\nline3" }));
    const lines = m.readSessionEventCache("sid");
    expect(lines!).toHaveLength(1);
    expect(JSON.parse(lines![0]).content).toBe("line1\nline2\nline3");
  });

  it("read returns null when the cache file does not exist", async () => {
    const m = await load();
    expect(m.readSessionEventCache("never-written")).toBeNull();
  });

  it("read drops the trailing blank line (length equals event count)", async () => {
    const m = await load();
    m.appendSessionEvent("sid", "{}");
    m.appendSessionEvent("sid", "{}");
    const raw = readFileSync(m.sessionEventCachePath("sid"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true); // trailing newline present on disk
    expect(m.readSessionEventCache("sid")!).toHaveLength(2); // but not counted
  });
});

describe("session-event-cache — opt-out flag", () => {
  it("append is a no-op and read returns null when disabled", async () => {
    process.env.HIVEMIND_SESSION_EVENT_CACHE = "0";
    const m = await load();
    m.appendSessionEvent("sid", "{}");
    expect(existsSync(m.sessionEventCachePath("sid"))).toBe(false);
    expect(m.readSessionEventCache("sid")).toBeNull();
  });

  it('"false" also disables', async () => {
    process.env.HIVEMIND_SESSION_EVENT_CACHE = "false";
    const m = await load();
    m.appendSessionEvent("sid", "{}");
    expect(existsSync(m.sessionEventCachePath("sid"))).toBe(false);
  });

  it("read of an already-written cache returns null once disabled (forces DB fallback)", async () => {
    const m1 = await load();
    m1.appendSessionEvent("sid", "{}");
    expect(m1.readSessionEventCache("sid")!).toHaveLength(1);
    process.env.HIVEMIND_SESSION_EVENT_CACHE = "1"; // any non-off value keeps it on
    const m2 = await load();
    expect(m2.readSessionEventCache("sid")!).toHaveLength(1);
    process.env.HIVEMIND_SESSION_EVENT_CACHE = "0";
    const m3 = await load();
    expect(m3.readSessionEventCache("sid")).toBeNull();
  });
});

describe("session-event-cache — empty / missing session id", () => {
  it("ignores a blank session id on both append and read", async () => {
    const m = await load();
    m.appendSessionEvent("", "{}");
    expect(m.readSessionEventCache("")).toBeNull();
  });
});

describe("session-event-cache — prune", () => {
  it("removes caches older than the TTL and keeps fresh ones", async () => {
    const m = await load();
    m.appendSessionEvent("old", "{}");
    m.appendSessionEvent("fresh", "{}");
    const oldPath = m.sessionEventCachePath("old");
    const freshPath = m.sessionEventCachePath("fresh");
    // Age "old" 30 days back.
    const now = Date.now();
    const thirtyDays = 30 * 24 * 3600 * 1000;
    utimesSync(oldPath, new Date(now - thirtyDays), new Date(now - thirtyDays));

    m.pruneStaleSessionEventCaches(14 * 24 * 3600 * 1000, now);

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(freshPath)).toBe(true);
  });

  it("is a safe no-op when the cache dir does not exist", async () => {
    const m = await load();
    expect(() => m.pruneStaleSessionEventCaches()).not.toThrow();
  });

  it("ignores non-.jsonl files in the cache dir", async () => {
    const m = await load();
    m.appendSessionEvent("keep", "{}");
    const dir = join(home, ".claude", "hooks", "session-cache");
    mkdirSync(dir, { recursive: true });
    const strayPath = join(dir, "notes.txt");
    writeFileSync(strayPath, "hi");
    const old = Date.now() - 100 * 24 * 3600 * 1000;
    utimesSync(strayPath, new Date(old), new Date(old));
    m.pruneStaleSessionEventCaches();
    expect(existsSync(strayPath)).toBe(true); // untouched: not a .jsonl
  });
});
