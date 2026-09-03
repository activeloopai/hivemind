import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Behavior test for src/hooks/pi/wiki-worker.ts — drives main() with mocked
 * fetch + execFileSync + summary-state + upload-summary so the pi spawn path
 * (buildTrailingPromptInvocation → execFileSync) is actually executed.
 * Mirrors tests/codex/codex-wiki-worker.test.ts.
 */

const finalizeSummaryMock = vi.fn();
const releaseLockMock = vi.fn();
const readStateMock = vi.fn();
const uploadSummaryMock = vi.fn();
const execFileSyncMock = vi.fn();
const embedSummaryMock = vi.fn();

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
  sessionId: "sid-pi",
  userName: "alice",
  project: "proj",
  tmpDir,
  piBin: "/fake/pi",
  piProvider: "openrouter",
  piModel: "anthropic/claude-haiku-4-5",
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
  await import("../../src/hooks/pi/wiki-worker.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "pi-wiki-worker-test-"));
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
});

afterEach(() => {
  global.fetch = originalFetch;
  process.argv[2] = originalArgv2;
  try { rmSync(rootDir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe("pi wiki-worker — behavior", () => {
  it("exits early when there are no session events", async () => {
    fetchMock.mockResolvedValue(jsonResp({ columns: ["message", "creation_date"], rows: [] }));
    await runWorker();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });

  it("runs pi --print --provider --model with the prompt as the trailing arg and uploads agent=pi", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[1]] });
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi pi" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-pi.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation((bin: string, args: string[]) => {
      expect(bin).toBe("/fake/pi");
      expect(args).toContain("--print");
      expect(args).toContain("--provider");
      expect(args).toContain("--model");
      // On Unix the prompt is the trailing positional arg (no shell, no stdin).
      const prompt = args[args.length - 1];
      const summaryPath = prompt.match(/SUMMARY=(\S+)/)![1];
      writeFileSync(summaryPath, "# Session sid-pi\n\n## What Happened\ndone.\n");
      return Buffer.from("");
    });
    await runWorker();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const execOpts = execFileSyncMock.mock.calls[0][2];
    expect(execOpts.env.HIVEMIND_WIKI_WORKER).toBe("1");
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock.mock.calls[0][1].agent).toBe("pi");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });

  it("logs the failure and skips upload when the pi spawn throws", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[1]] });
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi pi" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-pi.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation(() => { throw new Error("spawn ENOENT"); });
    await runWorker();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });

  it("does NOT upload or advance the offset when the agent exits 0 having written nothing", async () => {
    // Exit 0 is not proof of work. A child that cannot reach tmpDir (or simply
    // declines) exits 0 with the summary file untouched, leaving the pre-seeded
    // prior summary in place. Treating that as success re-uploaded the
    // placeholder verbatim AND stamped lastSummaryCount, slicing the unread
    // events away forever — so every later run summarized nothing.
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[9]] });
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({
          columns: ["message", "creation_date"],
          rows: Array.from({ length: 9 }, (_, i) => [JSON.stringify({ type: "user_message", content: `hello pi ${i}` }), "2026-04-20T00:00:00Z"]),
        });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-pi.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) {
        return jsonResp({ columns: ["summary"], rows: [["# Session X\n- **JSONL offset**: 7\n\n## What Happened\nprior"]] });
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation(() => Buffer.from(""));
    await runWorker();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(finalizeSummaryMock).not.toHaveBeenCalled();
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("left the pre-seeded summary unchanged");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });
});

const promptOf = (a: string[]) => a.find((x) => typeof x === "string" && x.includes("SUMMARY="))!;

describe("pi wiki-worker — bounded-fetch edges + error paths (coverage)", () => {
  function setupFetch(opts: { total: number; msgRows?: number; summaryOffset?: number }) {
    const n = opts.msgRows ?? Math.min(opts.total, 2000);
    const rows = Array.from({ length: n }, (_, i) => [JSON.stringify({ c: opts.total - 1 - i }), "t"]);
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[opts.total]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/sessions/alice/s.jsonl"]] });
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: opts.summaryOffset === undefined ? [] : [[`# S\n- **JSONL offset**: ${opts.summaryOffset}\n\n## What Happened\nx`]] });
      return jsonResp({ columns: [], rows: [] });
    });
  }
  const writesSummary = () => execFileSyncMock.mockImplementation((_b: string, a: string[]) => { writeFileSync(promptOf(a).match(/SUMMARY=(\S+)/)![1], "# S\n\n## What Happened\ndone\n"); return Buffer.from(""); });

  it("skips when the resume offset already covers every row", async () => {
    setupFetch({ total: 5, summaryOffset: 5 }); writesSummary(); await runWorker();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("no new events since last summary");
  });
  it("prefers the sidecar count over a smaller parsed offset", async () => {
    setupFetch({ total: 10, summaryOffset: 3 }); readStateMock.mockReturnValue({ lastSummaryCount: 8 }); writesSummary(); await runWorker();
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
  });
  it("writes a NULL embedding when the embed daemon fails", async () => {
    setupFetch({ total: 2 }); embedSummaryMock.mockRejectedValue(new Error("down")); writesSummary(); await runWorker();
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("summary embedding failed");
  });
  it("skips when the existing-summary lookup throws", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[2]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"], ["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      if (sql.startsWith("SELECT summary FROM")) throw new Error("db down");
      return jsonResp({ columns: [], rows: [] });
    });
    writesSummary(); await runWorker();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
  });
  it("logs the sidecar update failure but still releases the lock", async () => {
    setupFetch({ total: 2 }); writesSummary(); finalizeSummaryMock.mockImplementation(() => { throw new Error("boom"); }); await runWorker();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("sidecar update failed");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });
  it("swallows a releaseLock throw in the finally", async () => {
    setupFetch({ total: 2 }); writesSummary(); releaseLockMock.mockImplementation(() => { throw new Error("boom"); });
    await expect(runWorker()).resolves.toBeUndefined();
  });
  it("truncates a single event exceeding the byte budget", async () => {
    const huge = JSON.stringify({ c: "x".repeat(5 * 1024 * 1024) });
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[1]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows: [[huge, "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    writesSummary(); await runWorker();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("truncated it to stay within the buffer");
  });
  it("drops oldest rows when the batch exceeds the byte budget", async () => {
    const row = JSON.stringify({ c: "y".repeat(600 * 1024) });
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[10]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows: Array.from({ length: 10 }, () => [row, "t"]) });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    writesSummary(); await runWorker();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("permanently skipping");
  });
  it("skips upload when exec throws AFTER a partial summary write", async () => {
    setupFetch({ total: 2 });
    execFileSyncMock.mockImplementation((_b: string, a: string[]) => { writeFileSync(promptOf(a).match(/SUMMARY=(\S+)/)![1], "junk"); throw new Error("crash"); });
    await runWorker();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
  });
  it("logs a fatal error and releases the lock when a query hard-fails", async () => {
    fetchMock.mockResolvedValue(jsonResp("bad", false, 400)); await runWorker();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("fatal:");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });
  it("retries a retryable API error then succeeds", async () => {
    vi.spyOn(global, "setTimeout").mockImplementation(((cb: any) => { cb(); return 0 as any; }) as any);
    let first = true;
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      if (first) { first = false; return jsonResp("busy", false, 503); }
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[1]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    writesSummary(); await runWorker();
    expect(readFileSync(join(hooksDir, "wiki.log"), "utf-8")).toContain("retrying in");
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
  });
});

describe("pi wiki-worker — unknown server path (coverage)", () => {
  it("falls back to /sessions/unknown/ when the DISTINCT path lookup is empty", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT count(*) AS n")) return jsonResp({ columns: ["n"], rows: [[1]] });
      if (sql.startsWith("SELECT message, creation_date")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    execFileSyncMock.mockImplementation((_b: string, a: string[]) => { writeFileSync(promptOf(a).match(/SUMMARY=(\S+)/)![1], "# S\n\n## What Happened\nok\n"); return Buffer.from(""); });
    await runWorker();
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    expect(releaseLockMock).toHaveBeenCalledWith("sid-pi");
  });
});
