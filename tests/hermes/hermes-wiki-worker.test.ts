import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Behavior test for src/hooks/hermes/wiki-worker.ts — drives main() with
 * mocked fetch + execFileSync + summary-state + upload-summary so the hermes
 * spawn path is actually executed. Mirrors tests/codex/codex-wiki-worker.test.ts.
 * (Hermes spawn is still the original `execFileSync(hermesBin, ["-z", prompt, …])`
 * — the cross-platform stdin rewrite is deferred; see TODO in the worker.)
 */

const finalizeSummaryMock = vi.fn();
const releaseLockMock = vi.fn();
const readStateMock = vi.fn();
const uploadSummaryMock = vi.fn();
const execFileSyncMock = vi.fn();
const embedSummaryMock = vi.fn();
const readCacheMock = vi.fn();

vi.mock("../../src/hooks/session-event-cache.js", () => ({
  readSessionEventCache: (...a: any[]) => readCacheMock(...a),
}));
vi.mock("../../src/hooks/summary-state.js", () => ({
  finalizeSummary: (...a: any[]) => finalizeSummaryMock(...a),
  releaseLock: (...a: any[]) => releaseLockMock(...a),
  readState: (...a: any[]) => readStateMock(...a),
}));
vi.mock("../../src/hooks/upload-summary.js", () => ({
  uploadSummary: (...a: any[]) => uploadSummaryMock(...a),
}));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class { async embed(text: string, kind: string) { return embedSummaryMock(text, kind); } },
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
  sessionId: "sid-hermes",
  userName: "alice",
  orgName: "org",
  project: "proj",
  tmpDir,
  hermesBin: "/fake/hermes",
  hermesProvider: "openrouter",
  hermesModel: "anthropic/claude-haiku-4-5",
  wikiLog: join(hooksDir, "wiki.log"),
  hooksDir,
  promptTemplate: "JSONL=__JSONL__ SUMMARY=__SUMMARY__ SID=__SESSION_ID__ PROJ=__PROJECT__ OFFSET=__PREV_OFFSET__ LINES=__JSONL_LINES__ SRC=__JSONL_SERVER_PATH__",
});

function writeConfig(overrides: Partial<ReturnType<typeof defaultConfig>> = {}): void {
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
  await import("../../src/hooks/hermes/wiki-worker.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "hermes-wiki-worker-test-"));
  tmpDir = join(rootDir, "tmp");
  hooksDir = join(rootDir, "hooks");
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  configPath = join(rootDir, "config.json");
  writeConfig();
  process.argv[2] = configPath;
  fetchMock.mockReset();
  finalizeSummaryMock.mockReset();
  releaseLockMock.mockReset();
  readStateMock.mockReset().mockReturnValue(null);
  uploadSummaryMock.mockReset().mockResolvedValue({ path: "insert", summaryLength: 80, descLength: 15, sql: "..." });
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

describe("hermes wiki-worker — behavior", () => {
  it("exits early when there are no session events", async () => {
    fetchMock.mockResolvedValue(jsonResp({ columns: ["message", "creation_date"], rows: [] }));
    await runWorker();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-hermes");
  });

  it("runs hermes -z <prompt> --provider --yolo and uploads agent=hermes", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi hermes" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-hermes.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation((bin: string, args: string[]) => {
      expect(bin).toBe("/fake/hermes");
      expect(args[0]).toBe("-z");
      expect(args).toContain("--yolo");
      // Prompt is the value immediately after -z.
      const prompt = args[1];
      const summaryPath = prompt.match(/SUMMARY=(\S+)/)![1];
      writeFileSync(summaryPath, "# Session sid-hermes\n\n## What Happened\ndone.\n");
      return Buffer.from("");
    });
    await runWorker();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const execOpts = execFileSyncMock.mock.calls[0][2];
    expect(execOpts.env.HIVEMIND_WIKI_WORKER).toBe("1");
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock.mock.calls[0][1].agent).toBe("hermes");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-hermes");
  });

  it("logs the failure and skips upload when the hermes spawn throws", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi hermes" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-hermes.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation(() => { throw new Error("spawn ENOENT"); });
    await runWorker();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-hermes");
  });

  it("reads events from the local cache and issues NO self-session SELECTs", async () => {
    readCacheMock.mockReturnValue(
      Array.from({ length: 4 }, (_, i) => JSON.stringify({ type: "user_message", content: `cache ${i}` })),
    );
    const sqls: string[] = [];
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      sqls.push(sql);
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      return jsonResp({ columns: [], rows: [] });
    });
    execFileSyncMock.mockImplementation((_bin: string, args: string[]) => {
      writeFileSync(args[1].match(/SUMMARY=(\S+)/)![1], "# s\n\n## What Happened\nok\n");
      return Buffer.from("");
    });

    await runWorker();

    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(false);
    expect(sqls.some(s => s.startsWith("SELECT DISTINCT path"))).toBe(false);
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("loaded 4 events from local cache");
    const prompt = execFileSyncMock.mock.calls[0][1][1] as string;
    expect(prompt).toContain("SRC=/sessions/alice/alice_org_default_sid-hermes.jsonl");
    expect(prompt).toContain("LINES=4");
    expect(finalizeSummaryMock).toHaveBeenCalledWith("sid-hermes", 4);
  });

  it("falls back to the DB SELECT when the local cache is absent", async () => {
    readCacheMock.mockReturnValue(null);
    const sqls: string[] = [];
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      sqls.push(sql);
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "db" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/sessions/alice/db.jsonl"]] });
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation((_bin: string, args: string[]) => {
      writeFileSync(args[1].match(/SUMMARY=(\S+)/)![1], "# s\n\n## What Happened\nok\n");
      return Buffer.from("");
    });

    await runWorker();

    expect(sqls.some(s => s.startsWith("SELECT message, creation_date"))).toBe(true);
    expect(sqls.some(s => s.startsWith("SELECT DISTINCT path"))).toBe(true);
  });
});
