import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EMPTY_MARKER_SESSION = "11111111-1111-4111-8111-111111111111";
const FAILED_QUEUE_SESSION = "00000000-0000-4000-8000-000000000000";

// Keep the real queue implementation and drain lifecycle, but use a tiny
// ceiling only for the loss-path session. This makes the production caller
// create the same zero-byte marker without allocating a 256 MB transcript.
vi.mock("../../src/hooks/session-queue.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/hooks/session-queue.js")>("../../src/hooks/session-queue.js");
  return {
    ...actual,
    MAX_SESSION_QUEUE_BYTES: 1,
    appendQueuedSessionRows: (rows: Parameters<typeof actual.appendQueuedSessionRows>[0], queueDir?: string) => {
      const sessionId = rows[0].path.split("_").pop()!.replace(/\.jsonl$/, "");
      const ceiling = sessionId === EMPTY_MARKER_SESSION ? 1 : actual.MAX_SESSION_QUEUE_BYTES;
      return actual.appendQueuedSessionRows(rows, queueDir, ceiling);
    },
  };
});

const uploads: string[] = [];
const spawned: string[] = [];

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(sql: string): Promise<never[]> {
      // The failed queue sorts first, so drainSessionQueues requeues it and
      // never reaches the later session's empty marker.
      if (sql.includes(FAILED_QUEUE_SESSION)) throw new Error("offline");
      uploads.push(sql);
      return [];
    }
    async ensureSessionsTable(): Promise<void> {}
  },
}));

vi.mock("../../src/hooks/spawn-wiki-worker.js", () => ({
  bundleDirFromImportMeta: () => "test-bundle",
  spawnWikiWorker: vi.fn(({ sessionId }: { sessionId: string }) => spawned.push(sessionId)),
}));

vi.mock("../../src/skillify/triggers.js", () => ({ forceSessionEndTrigger: vi.fn() }));

let home: string;
let previousHome: string | undefined;

function desktopDir(): string {
  return process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Claude")
    : join(home, ".config", "Claude");
}

function transcriptPath(sessionId: string): string {
  const dir = join(desktopDir(), "local-agent-mode-sessions", "run", ".claude", "projects", "proj");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.jsonl`);
}

function queuePath(sessionId: string, suffix: ".jsonl" | ".inflight" = ".jsonl"): string {
  return join(home, ".deeplake", "queue-cowork", `${sessionId}${suffix}`);
}

function record(sessionId: string): string {
  return JSON.stringify({
    type: "user",
    sessionId,
    timestamp: "2026-09-22T00:00:00.000Z",
    cwd: "/cowork",
    message: { role: "user", content: `message for ${sessionId}` },
  });
}

function oldEnough(path: string): void {
  const old = (Date.now() - 6 * 60_000) / 1000;
  utimesSync(path, old, old);
}

function statePath(): string {
  return join(home, ".deeplake", "cowork-ingest-state.json");
}

beforeEach(() => {
  previousHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "hivemind-cowork-empty-marker-"));
  process.env.HOME = home;
  mkdirSync(join(home, ".deeplake"), { recursive: true });
  writeFileSync(
    join(home, ".deeplake", "credentials.json"),
    JSON.stringify({
      token: "test-token",
      orgId: "test-org",
      orgName: "test-org",
      userName: "test-user",
      workspaceId: "test-workspace",
      apiUrl: "http://127.0.0.1:1",
    }),
  );
  uploads.length = 0;
  spawned.length = 0;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

describe("Cowork summary with a refused-append marker", () => {
  it("summarizes the loss-path session when an earlier failed queue prevents its empty marker from draining", async () => {
    const failedPath = transcriptPath(FAILED_QUEUE_SESSION);
    const emptyMarkerPath = transcriptPath(EMPTY_MARKER_SESSION);
    writeFileSync(failedPath, `${record(FAILED_QUEUE_SESSION)}\n`);
    writeFileSync(emptyMarkerPath, `${record(EMPTY_MARKER_SESSION)}\n`);
    oldEnough(failedPath);
    oldEnough(emptyMarkerPath);

    vi.resetModules();
    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });

    // The oversized/loss caller advanced this session's watermark and the
    // earlier failed queue short-circuited the normal empty-marker cleanup.
    expect(existsSync(queuePath(EMPTY_MARKER_SESSION))).toBe(true);
    expect(readFileSync(queuePath(EMPTY_MARKER_SESSION), "utf8")).toBe("");
    expect(existsSync(queuePath(FAILED_QUEUE_SESSION))).toBe(true);
    expect(readFileSync(statePath(), "utf8")).toContain(`"${emptyMarkerPath}":1`);
    expect(readFileSync(statePath(), "utf8")).toContain('"summarizedLines":{');
    expect(spawned).toEqual([EMPTY_MARKER_SESSION]);
    expect(uploads).toEqual([]);
  });

  it("fails closed when the queue marker path has a non-ENOENT filesystem error", async () => {
    const transcript = transcriptPath(EMPTY_MARKER_SESSION);
    writeFileSync(transcript, "{}\n");
    oldEnough(transcript);
    // A regular file where the queue directory should be makes the per-session
    // marker stat fail with ENOTDIR. It is not safe to treat that as an empty
    // queue and spawn a worker that assumes rows are uploaded.
    writeFileSync(join(home, ".deeplake", "queue-cowork"), "not a directory");

    vi.resetModules();
    const { summarizeIdleSessions } = await import("../../src/mcp/cowork-ingest.js");
    const state = { processedLines: { [transcript]: 1 }, summarizedLines: {} };
    summarizeIdleSessions({} as Parameters<typeof summarizeIdleSessions>[0], state, sessionId => spawned.push(sessionId));

    expect(spawned).toEqual([]);
    expect(state.summarizedLines).toEqual({});
  });
});
