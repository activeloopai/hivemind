import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const uploads: string[] = [];
let networkAvailable = true;
const spawned: string[] = [];

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(sql: string): Promise<never[]> {
      if (!networkAvailable) throw new Error("offline");
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

vi.mock("../../src/skillify/triggers.js", () => ({
  forceSessionEndTrigger: vi.fn(),
}));

const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function queueDir(): string {
  return join(home, ".deeplake", "queue-cowork");
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

async function loadIngest() {
  vi.resetModules();
  return import("../../src/mcp/cowork-ingest.js");
}

beforeEach(() => {
  previousHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "hivemind-cowork-summary-"));
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
  networkAvailable = true;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
});

describe("Cowork summary after queue upload", () => {
  it("does not summarize after a failed upload, then retries after success without new lines", async () => {
    const path = transcriptPath(SESSION_A);
    writeFileSync(path, `${record(SESSION_A)}\n`);
    oldEnough(path);
    networkAvailable = false;

    const { ingestCoworkSessions } = await loadIngest();
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    expect(readFileSync(statePath(), "utf8")).toContain('"summarizedLines":{}');
    expect(readFileSync(join(queueDir(), `${SESSION_A}.jsonl`), "utf8")).toContain(SESSION_A);
    expect(spawned).toEqual([]);

    // No transcript append occurs between ticks. A successful drain must make
    // the already-processed session eligible for its first summary.
    networkAvailable = true;
    expect(await ingestCoworkSessions()).toEqual({ ingested: 0 });
    expect(spawned).toEqual([SESSION_A]);
    expect(existsSync(join(queueDir(), `${SESSION_A}.jsonl`))).toBe(false);
    expect(uploads).toHaveLength(1);
    expect(readFileSync(statePath(), "utf8")).toContain(`"summarizedLines":{"${path}":1}`);
  });

  it("blocks only sessions with queued or inflight rows and lets unrelated idle sessions progress", async () => {
    const { summarizeIdleSessions } = await loadIngest();
    const pathA = transcriptPath(SESSION_A);
    const pathB = transcriptPath(SESSION_B);
    writeFileSync(pathA, "{}\n");
    writeFileSync(pathB, "{}\n");
    oldEnough(pathA);
    oldEnough(pathB);
    mkdirSync(queueDir(), { recursive: true });
    writeFileSync(join(queueDir(), `${SESSION_A}.jsonl`), "pending\n");

    const state = {
      processedLines: { [pathA]: 1, [pathB]: 1 },
      summarizedLines: {},
    };
    summarizeIdleSessions({} as Parameters<typeof summarizeIdleSessions>[0], state, sessionId => spawned.push(sessionId));
    expect(spawned).toEqual([SESSION_B]);
    expect(state.summarizedLines).toEqual({ [pathB]: 1 });

    // The same session remains blocked when its durable queue is represented
    // by an inflight file (for example while another drain owns the upload).
    renameSync(join(queueDir(), `${SESSION_A}.jsonl`), join(queueDir(), `${SESSION_A}.inflight`));
    summarizeIdleSessions({} as Parameters<typeof summarizeIdleSessions>[0], state, sessionId => spawned.push(sessionId));
    expect(spawned).toEqual([SESSION_B]);
    expect(state.summarizedLines).toEqual({ [pathB]: 1 });
  });
});
