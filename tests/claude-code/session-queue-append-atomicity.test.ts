/**
 * Failure-path tests for the atomic queue append.
 *
 * These cover what the happy-path tests cannot: a write that throws part-way,
 * a second writer that appends during that failure, and a malformed record
 * that survives on disk anyway. The last one is the important one — before it
 * was skipped at read time, one truncated line failed every future flush and
 * stranded the whole queue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");

/** Installed by each test to hijack writeSync; null = pass through. */
let writeHook: ((fd: number, buf: Buffer, off: number, len: number) => number) | null = null;

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    writeSync: (fd: number, buf: Buffer, off: number, len: number) =>
      writeHook ? writeHook(fd, buf, off, len) : (actual.writeSync as any)(fd, buf, off, len),
  };
});

const {
  appendQueuedSessionRows,
  buildQueuedSessionRow,
  buildSessionPath,
  flushSessionQueue,
} = await import("../../src/hooks/session-queue.js");

function makeRow(sessionId: string, seq: number) {
  return buildQueuedSessionRow({
    sessionPath: buildSessionPath({ userName: "alice", orgName: "acme", workspaceId: "default" }, sessionId),
    line: JSON.stringify({ type: "user_message", content: `msg-${seq}` }),
    userName: "alice",
    projectName: "p",
    description: "user_message",
    agent: "claude_cowork",
    timestamp: "2026-08-20T00:00:00.000Z",
  });
}

let queueDir: string;

beforeEach(() => {
  queueDir = mkdtempSync(join(tmpdir(), "queue-atomicity-"));
  writeHook = null;
});

afterEach(() => {
  writeHook = null;
});

describe("appendQueuedSessionRows failure paths", () => {
  it("rolls back a write that throws part-way, leaving the file as it was", () => {
    const queuePath = appendQueuedSessionRows([makeRow("s1", 0)], queueDir).queuePath;
    const before = readFileSync(queuePath, "utf-8");

    // Write half the payload, then fail — the classic partial write.
    writeHook = (fd, buf, off, len) => {
      (realFs.writeSync as any)(fd, buf, off, Math.floor(len / 2));
      throw new Error("ENOSPC: no space left on device");
    };
    const result = appendQueuedSessionRows([makeRow("s1", 1), makeRow("s1", 2)], queueDir);

    expect(result.appended).toBe(false);
    expect(readFileSync(queuePath, "utf-8")).toBe(before);
  });

  it("completes a short write instead of losing its tail", () => {
    let calls = 0;
    // First call writes one byte — writeSync is allowed to do that.
    writeHook = (fd, buf, off, len) => (realFs.writeSync as any)(fd, buf, off, calls++ === 0 ? 1 : len);

    const { queuePath, appended } = appendQueuedSessionRows([makeRow("s2", 0)], queueDir);

    expect(appended).toBe(true);
    expect(calls).toBeGreaterThan(1);
    const lines = readFileSync(queuePath, "utf-8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).message).toContain("msg-0");
  });

  it("does not truncate over a concurrent appender's rows when rolling back", () => {
    const queuePath = appendQueuedSessionRows([makeRow("s3", 0)], queueDir).queuePath;
    const before = readFileSync(queuePath, "utf-8");
    const otherWriter = `${JSON.stringify(makeRow("s3", 99))}\n`;

    // Fail, and have somebody else append while we are down: rolling back to
    // our start offset would destroy their row, so it must be skipped.
    writeHook = (fd, buf, off, len) => {
      (realFs.writeSync as any)(fd, buf, off, Math.floor(len / 2));
      appendFileSync(queuePath, otherWriter);
      throw new Error("EIO");
    };
    expect(appendQueuedSessionRows([makeRow("s3", 1)], queueDir).appended).toBe(false);

    const after = readFileSync(queuePath, "utf-8");
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain(otherWriter.trim());
  });
});

describe("a malformed record does not strand the queue", () => {
  it("skips the bad line and flushes the good ones", async () => {
    const good = appendQueuedSessionRows([makeRow("s4", 0), makeRow("s4", 1)], queueDir);
    // A half-written record, the way a crash mid-append leaves one.
    appendFileSync(good.queuePath, '{"id":"truncated","path":"/sessions/ali');

    const sent: string[] = [];
    const api = {
      query: async (sql: string) => { sent.push(sql); return []; },
      ensureSessionsTable: async () => {},
    };

    const result = await flushSessionQueue(api, { sessionId: "s4", sessionsTable: "sessions", queueDir });

    expect(result.status).toBe("flushed");
    expect(result.rows).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("msg-0");
    expect(sent[0]).toContain("msg-1");
    expect(sent[0]).not.toContain("truncated");
  });
});
