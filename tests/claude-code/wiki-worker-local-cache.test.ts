import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration tests for the wiki-worker's local-cache fast path.
 *
 * The worker prefers the local per-session event cache over re-`SELECT`ing the
 * fat `message` column for the current session. Here we mock the cache module
 * (so nothing touches the real ~/.claude) and assert:
 *   - when the cache has rows, NO `SELECT message ...` and NO
 *     `SELECT DISTINCT path ...` self-session scan is issued;
 *   - the server path is derived locally via buildSessionPath;
 *   - an absent cache falls back to the DB SELECT (existing behavior);
 *   - a cache shorter than the summarized offset refetches from the DB.
 */

const finalizeSummaryMock = vi.fn();
const releaseLockMock = vi.fn();
const readStateMock = vi.fn();
const uploadSummaryMock = vi.fn();
const execFileSyncMock = vi.fn();
const embedSummaryMock = vi.fn();
const readCacheMock = vi.fn();

vi.mock("../../src/hooks/summary-state.js", () => ({
  finalizeSummary: (...a: any[]) => finalizeSummaryMock(...a),
  releaseLock: (...a: any[]) => releaseLockMock(...a),
  readState: (...a: any[]) => readStateMock(...a),
}));
vi.mock("../../src/hooks/upload-summary.js", () => ({
  uploadSummary: (...a: any[]) => uploadSummaryMock(...a),
}));
vi.mock("../../src/hooks/session-event-cache.js", () => ({
  readSessionEventCache: (...a: any[]) => readCacheMock(...a),
}));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    async embed(text: string, kind: string) { return embedSummaryMock(text, kind); }
  },
}));
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, execFileSync: (...a: any[]) => execFileSyncMock(...a) };
});

const originalFetch = global.fetch;
const fetchMock = vi.fn();
const originalArgv2 = process.argv[2];

let rootDir: string;
let tmpDir: string;
let hooksDir: string;
let configPath: string;

const defaultConfig = () => ({
  apiUrl: "http://fake.local",
  token: "tok",
  orgId: "org",
  workspaceId: "default",
  memoryTable: "memory",
  sessionsTable: "sessions",
  sessionId: "sid-cache",
  userName: "alice",
  orgName: "org",
  project: "proj",
  tmpDir,
  claudeBin: "/fake/claude",
  wikiLog: join(hooksDir, "wiki.log"),
  hooksDir,
  promptTemplate: "JSONL=__JSONL__ SUMMARY=__SUMMARY__ SID=__SESSION_ID__ PROJ=__PROJECT__ OFFSET=__PREV_OFFSET__ LINES=__JSONL_LINES__ SRC=__JSONL_SERVER_PATH__",
});

function writeConfig(overrides: Record<string, unknown> = {}): void {
  writeFileSync(configPath, JSON.stringify({ ...defaultConfig(), ...overrides }));
}

function jsonResp(body: unknown, ok = true, status = 200): Response {
  return {
    ok, status,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

async function runWorker(): Promise<void> {
  vi.resetModules();
  global.fetch = fetchMock;
  await import("../../src/hooks/wiki-worker.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

/** Fetch mock that records SQL and answers the summary lookup as "no summary". */
function trackingFetch(sqls: string[], summaryRows: unknown[][] = []): void {
  fetchMock.mockImplementation(async (_url: string, init: any) => {
    const sql = JSON.parse(init.body).query as string;
    sqls.push(sql);
    if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: summaryRows });
    if (sql.startsWith("SELECT message, creation_date")) {
      // DB fallback path — a handful of generic rows.
      return jsonResp({
        columns: ["message", "creation_date"],
        rows: Array.from({ length: 6 }, (_, i) => [JSON.stringify({ type: "user_message", content: `db ${i}` }), "2026-01-01T00:00:00Z"]),
      });
    }
    if (sql.startsWith("SELECT DISTINCT path")) {
      return jsonResp({ columns: ["path"], rows: [["/sessions/alice/db_path.jsonl"]] });
    }
    return jsonResp({ columns: [], rows: [] });
  });
}

function writesSummary(): void {
  execFileSyncMock.mockImplementation((_bin: string, args: string[]) => {
    const prompt = args[args.indexOf("-p") + 1];
    const summaryPath = prompt.match(/SUMMARY=(\S+)/)![1];
    writeFileSync(summaryPath, "# Session sid-cache\n\n## What Happened\ndone.\n");
    return Buffer.from("");
  });
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "wiki-local-cache-test-"));
  tmpDir = join(rootDir, "tmp");
  hooksDir = join(rootDir, "hooks");
  require("node:fs").mkdirSync(tmpDir, { recursive: true });
  require("node:fs").mkdirSync(hooksDir, { recursive: true });
  configPath = join(rootDir, "config.json");
  writeConfig();
  process.argv[2] = configPath;
  fetchMock.mockReset();
  finalizeSummaryMock.mockReset();
  releaseLockMock.mockReset();
  readStateMock.mockReset().mockReturnValue(null);
  uploadSummaryMock.mockReset().mockResolvedValue({ path: "insert", summaryLength: 100, descLength: 20, sql: "..." });
  embedSummaryMock.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
  execFileSyncMock.mockReset();
  readCacheMock.mockReset().mockReturnValue(null);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.argv[2] = originalArgv2;
  try { rmSync(rootDir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe("wiki-worker — local cache fast path", () => {
  it("reads events from the local cache and issues NO self-session SELECTs", async () => {
    const cached = Array.from({ length: 5 }, (_, i) => JSON.stringify({ type: "user_message", content: `cache ${i}` }));
    readCacheMock.mockReturnValue(cached);
    const sqls: string[] = [];
    trackingFetch(sqls);
    let capturedJsonl: string | null = null;
    execFileSyncMock.mockImplementation((_bin: string, args: string[]) => {
      const prompt = args[args.indexOf("-p") + 1];
      capturedJsonl = readFileSync(prompt.match(/JSONL=(\S+)/)![1], "utf-8");
      writeFileSync(prompt.match(/SUMMARY=(\S+)/)![1], "# s\n\n## What Happened\nok\n");
      return Buffer.from("");
    });

    await runWorker();

    // The dominant fat-column scan must NOT run, nor the secondary path scan.
    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(false);
    expect(sqls.some(s => s.startsWith("SELECT DISTINCT path"))).toBe(false);
    // Only the (cheap, exact-path) summary lookup + upload remain.
    expect(sqls.some(s => s.startsWith("SELECT summary FROM"))).toBe(true);

    // Events came from the cache.
    expect(capturedJsonl!.trim().split("\n")).toHaveLength(5);
    expect(capturedJsonl).toContain("cache 0");

    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("loaded 5 events from local cache");

    // Server path derived locally via buildSessionPath (canonical 4-tuple).
    const prompt = execFileSyncMock.mock.calls[0][1][execFileSyncMock.mock.calls[0][1].indexOf("-p") + 1] as string;
    expect(prompt).toContain("SRC=/sessions/alice/alice_org_default_sid-cache.jsonl");
    expect(prompt).toContain("LINES=5");
    expect(finalizeSummaryMock).toHaveBeenCalledWith("sid-cache", 5);
  });

  it("falls back to the DB SELECT when the cache is absent", async () => {
    readCacheMock.mockReturnValue(null);
    const sqls: string[] = [];
    trackingFetch(sqls);
    writesSummary();

    await runWorker();

    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(true);
    expect(sqls.some(s => s.startsWith("SELECT DISTINCT path"))).toBe(true);
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("fetching session events");
    expect(finalizeSummaryMock).toHaveBeenCalledWith("sid-cache", 6);
  });

  it("falls back to the DB SELECT when the cache is empty", async () => {
    readCacheMock.mockReturnValue([]);
    const sqls: string[] = [];
    trackingFetch(sqls);
    writesSummary();

    await runWorker();

    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(true);
  });

  it("refetches from the DB when the cache is shorter than the summarized offset", async () => {
    // Cache has only 2 rows, but a prior summary recorded offset 12 — the
    // cache is an incomplete local copy (session resumed elsewhere), so the
    // worker must re-load the full session from the DB rather than slice to 0.
    readCacheMock.mockReturnValue([JSON.stringify({ content: "a" }), JSON.stringify({ content: "b" })]);
    const sqls: string[] = [];
    trackingFetch(sqls, [["# Session X\n- **JSONL offset**: 12\n\n## What Happened\nprior"]]);
    writesSummary();

    await runWorker();

    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("local cache (2) < summarized offset (12) — refetching from DB");
    // The DB SELECT was issued as the refetch.
    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(true);
  });
});
