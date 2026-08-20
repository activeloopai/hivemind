/**
 * Regression test for the Cowork local-queue disk leak.
 *
 * Reported 2026-08-19 by a customer running Claude Cowork: a single
 * ~/.deeplake/queue-cowork/<session>.jsonl file had grown to 39.9 GB at
 * ~1 MB / 20 s while their network filesystem was flapping.
 *
 * Cause: ingestCoworkSessions() appended every new transcript entry to the
 * queue file, then uploaded, and only persisted the per-transcript line
 * watermark AFTER a successful upload. When the upload threw (offline, DNS,
 * 5xx) the watermark was lost, so the next 30 s tick re-read the same
 * transcript lines from the old watermark and appended the whole transcript
 * to the queue again — forever, growing without bound.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SESSION_ID = "b27efa59-a8bc-4ea3-8b02-18cbc608ae17";

// The upload fails while `offline` is true, the way it does on a disconnected
// network filesystem, and succeeds once it flips back.
const uploads: string[] = [];
let offline = true;
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(sql: string): Promise<never[]> {
      if (offline) throw new Error("fetch failed: ECONNREFUSED");
      uploads.push(sql);
      return [];
    }
    async ensureSessionsTable(): Promise<void> {}
  },
}));

let home: string;
let prevHome: string | undefined;

function transcriptPath(): string {
  const dir = join(home, ".config", "Claude", "local-agent-mode-sessions", "s1", ".claude", "projects", "proj");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${SESSION_ID}.jsonl`);
}

function line(text: string): string {
  return `${JSON.stringify({
    type: "user",
    sessionId: SESSION_ID,
    timestamp: new Date().toISOString(),
    cwd: "/cowork",
    message: { role: "user", content: text },
  })}\n`;
}

function queueBytes(): number {
  try {
    return statSync(join(home, ".deeplake", "queue-cowork", `${SESSION_ID}.jsonl`)).size;
  } catch {
    return 0;
  }
}

function queuedRows(): number {
  try {
    return readFileSync(join(home, ".deeplake", "queue-cowork", `${SESSION_ID}.jsonl`), "utf-8")
      .split("\n")
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

beforeEach(() => {
  prevHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "cowork-leak-"));
  process.env.HOME = home;
  offline = true;
  uploads.length = 0;
  mkdirSync(join(home, ".deeplake"), { recursive: true });
  writeFileSync(
    join(home, ".deeplake", "credentials.json"),
    JSON.stringify({ token: "t", orgId: "org", orgName: "org", userName: "u", workspaceId: "default", apiUrl: "http://127.0.0.1:1" }),
  );
  vi.resetModules();
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
});

describe("cowork queue growth when uploads fail", () => {
  it("does not re-append the same transcript lines on every failed upload", async () => {
    const path = transcriptPath();
    writeFileSync(path, line("first prompt"));

    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");

    await ingestCoworkSessions();
    const afterFirst = queueBytes();
    expect(afterFirst).toBeGreaterThan(0);

    // Nothing new was written to the transcript — a second tick must queue
    // nothing, even though the first upload failed and the rows are still
    // sitting in the queue file waiting to be retried.
    await ingestCoworkSessions();
    expect(queueBytes()).toBe(afterFirst);

    // A third tick, still offline, still no transcript growth.
    await ingestCoworkSessions();
    expect(queueBytes()).toBe(afterFirst);
  });

  it("queues each new transcript line exactly once across failing ticks", async () => {
    const path = transcriptPath();
    writeFileSync(path, line("one"));

    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    await ingestCoworkSessions();
    expect(queuedRows()).toBe(1);

    appendFileSync(path, line("two"));
    await ingestCoworkSessions();

    // The second tick queues the one new message, not the whole transcript.
    expect(queuedRows()).toBe(2);
  });

  it("uploads the queue left by an outage on a later tick, with no new transcript content", async () => {
    const path = transcriptPath();
    writeFileSync(path, line("queued while offline"));

    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    await ingestCoworkSessions();
    expect(queuedRows()).toBe(1);
    expect(uploads).toHaveLength(0);

    // Network is back. The transcript has NOT changed, so this tick appends
    // nothing — the queued row must still be uploaded and the file cleared.
    offline = false;
    const result = await ingestCoworkSessions();

    // ingested === 0 is what separates this from the old behaviour: on
    // origin/main the tick only uploaded because it had re-appended the
    // transcript first, which would show up here as ingested > 0.
    expect(result).toEqual({ ingested: 0 });
    expect(uploads).toHaveLength(1);
    // Exactly one row in that statement — one VALUES tuple, not a replayed batch.
    expect(uploads[0].match(/::jsonb/g)).toHaveLength(1);
    // Assert the row that actually went up, not a substring of the statement.
    const jsonb = uploads[0].match(/'(\{.*?\})'::jsonb/)?.[1];
    expect(jsonb).toBeDefined();
    expect(JSON.parse(jsonb!.replace(/''/g, "'"))).toMatchObject({
      session_id: SESSION_ID,
      type: "user_message",
      content: "queued while offline",
      agent: "claude_cowork",
      cwd: "/cowork",
    });
    expect(queuedRows()).toBe(0);
    expect(queueBytes()).toBe(0);
  });
});
