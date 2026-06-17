import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Behavior test for src/hooks/cursor/wiki-worker.ts — drives main() with
 * mocked fetch + execFileSync + summary-state + upload-summary so the cursor
 * spawn path (buildTrailingPromptInvocation → execFileSync) is actually
 * executed. Mirrors tests/codex/codex-wiki-worker.test.ts.
 */

const finalizeSummaryMock = vi.fn();
const releaseLockMock = vi.fn();
const uploadSummaryMock = vi.fn();
const execFileSyncMock = vi.fn();
const embedSummaryMock = vi.fn();

vi.mock("../../src/hooks/summary-state.js", () => ({
  finalizeSummary: (...a: any[]) => finalizeSummaryMock(...a),
  releaseLock: (...a: any[]) => releaseLockMock(...a),
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
  sessionId: "sid-cursor",
  userName: "alice",
  project: "proj",
  tmpDir,
  cursorBin: "/fake/cursor-agent",
  cursorModel: "auto",
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
  await import("../../src/hooks/cursor/wiki-worker.js");
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "cursor-wiki-worker-test-"));
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

describe("cursor wiki-worker — behavior", () => {
  it("exits early when there are no session events", async () => {
    fetchMock.mockResolvedValue(jsonResp({ columns: ["message", "creation_date"], rows: [] }));
    await runWorker();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-cursor");
  });

  it("runs cursor-agent --print --force with the prompt as the trailing arg and uploads agent=cursor", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi cursor" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-cursor.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation((bin: string, args: string[]) => {
      expect(bin).toBe("/fake/cursor-agent");
      expect(args).toContain("--print");
      expect(args).toContain("--force");
      // On Unix the prompt is the trailing positional arg (no shell, no stdin).
      const prompt = args[args.length - 1];
      const summaryPath = prompt.match(/SUMMARY=(\S+)/)![1];
      writeFileSync(summaryPath, "# Session sid-cursor\n\n## What Happened\ndone.\n");
      return Buffer.from("");
    });
    await runWorker();

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const execOpts = execFileSyncMock.mock.calls[0][2];
    expect(execOpts.env.HIVEMIND_WIKI_WORKER).toBe("1");
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock.mock.calls[0][1].agent).toBe("cursor");
    expect(releaseLockMock).toHaveBeenCalledWith("sid-cursor");
  });

  it("logs the failure and skips upload when the cursor-agent spawn throws", async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi cursor" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-cursor.jsonl"]] });
      }
      if (sql.startsWith("SELECT summary FROM")) return jsonResp({ columns: ["summary"], rows: [] });
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation(() => { throw new Error("spawn ENOENT"); });
    await runWorker();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-cursor");
  });

  it("does not re-upload a stale existing summary after a failed regeneration (resumed session)", async () => {
    // C3 guard: on a resumed session the worker pre-seeds tmpSummary with the
    // existing summary (step 2). If cursor-agent fails without rewriting it,
    // re-uploading the unchanged summary + calling finalizeSummary advances the
    // JSONL offset, marking unsummarized events as done. The guard must skip the
    // upload AND the finalize. Mirrors tests/codex/codex-wiki-worker.test.ts.
    fetchMock.mockImplementation(async (_u: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi cursor" }), "2026-04-20T00:00:00Z"]] });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/alice_org_default_sid-cursor.jsonl"]] });
      }
      // Resumed session: an existing summary is returned and gets written to
      // tmpSummary before the (failing) agent run.
      if (sql.startsWith("SELECT summary FROM")) {
        return jsonResp({ columns: ["summary"], rows: [["# Session X\n- **JSONL offset**: 7\n\n## What Happened\nprior"]] });
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    execFileSyncMock.mockImplementation(() => { throw new Error("cursor-agent timed out"); });
    await runWorker();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(finalizeSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith("sid-cursor");
  });
});
