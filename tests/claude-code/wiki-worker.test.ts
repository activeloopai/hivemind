import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Direct source-level tests for src/hooks/wiki-worker.ts. The module
 * reads its config JSON from process.argv[2] at module load, then
 * runs main() immediately. Each scenario writes a fresh config file
 * under a tmp dir, points process.argv[2] at it, wires the mocks, and
 * dynamically imports the worker.
 *
 * Mocks:
 *   - global.fetch (the query() helper)
 *   - child_process.execFileSync (the claude -p invocation)
 *   - summary-state (finalizeSummary + releaseLock)
 *   - upload-summary (uploadSummary)
 *
 * fs stays real for the summary tmp file: the worker captures the agent's
 * STDOUT (the execFileSync return value), sanitizes it, and writes it to the
 * tmp summary itself, then reads it back to upload. The execFileSync mock
 * therefore simulates claude by RETURNING the summary text as stdout (a
 * Buffer), which is how the real binary behaves under the stdout pivot. The
 * session transcript is inlined into the prompt (delivered over stdin), so
 * the prompt is asserted via the call's options.input, not its argv.
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

let rootDir: string;  // shared parent — NOT removed by the worker
let tmpDir: string;   // worker's tmpDir, rmSync'd in cleanup()
let hooksDir: string; // wiki.log lives here; must outlive tmpDir
let configPath: string;

const defaultConfig = () => ({
  apiUrl: "http://fake.local",
  token: "tok",
  orgId: "org",
  workspaceId: "default",
  memoryTable: "memory",
  sessionsTable: "sessions",
  sessionId: "sid-worker",
  userName: "alice",
  project: "proj",
  tmpDir,
  claudeBin: "/fake/claude",
  wikiLog: join(hooksDir, "wiki.log"),
  hooksDir,
  promptTemplate: "SID=__SESSION_ID__ PROJ=__PROJECT__ OFFSET=__PREV_OFFSET__ LINES=__JSONL_LINES__ SRC=__JSONL_SERVER_PATH__ EXISTING=[__EXISTING_SUMMARY__] CONTENT=[__JSONL_CONTENT__]",
});

function writeConfig(overrides: Partial<ReturnType<typeof defaultConfig>> = {}): void {
  const cfg = { ...defaultConfig(), ...overrides };
  writeFileSync(configPath, JSON.stringify(cfg));
}

function jsonResp(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  } as Response;
}

async function runWorker(): Promise<void> {
  vi.resetModules();
  global.fetch = fetchMock;
  await import("../../src/hooks/wiki-worker.js");
  // Let main() and all its awaits complete.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "wiki-worker-test-"));
  tmpDir = join(rootDir, "tmp");
  hooksDir = join(rootDir, "hooks");
  // The worker will mkdir hooksDir lazily via wlog, but it needs tmpDir
  // to exist for writeFileSync(tmpJsonl, ...).
  require("node:fs").mkdirSync(tmpDir, { recursive: true });
  require("node:fs").mkdirSync(hooksDir, { recursive: true });
  configPath = join(rootDir, "config.json");
  writeConfig();
  process.argv[2] = configPath;
  fetchMock.mockReset();
  finalizeSummaryMock.mockReset();
  releaseLockMock.mockReset();
  uploadSummaryMock.mockReset().mockResolvedValue({ path: "insert", summaryLength: 100, descLength: 20, sql: "..." });
  embedSummaryMock.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
  execFileSyncMock.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
  process.argv[2] = originalArgv2;
  delete process.env.HIVEMIND_WIKI_EVENT_RETRIES;
  delete process.env.HIVEMIND_WIKI_EVENT_BACKOFF_MS;
  try { rmSync(rootDir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

// ═══ zero events: retry, then remove the orphan placeholder ════════════════

describe("wiki-worker — no events", () => {
  it("removes the orphan placeholder when no events ever appear", async () => {
    // retries=0 → skip the backoff loop, go straight to cleanup (keeps the
    // test instant; the retry path itself is covered separately below).
    process.env.HIVEMIND_WIKI_EVENT_RETRIES = "0";
    const sqls: string[] = [];
    fetchMock.mockImplementation(async (_url: string, opts: any) => {
      sqls.push(JSON.parse(opts.body).query);
      return jsonResp({ columns: ["message", "creation_date"], rows: [] });
    });
    await runWorker();

    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("removing orphan placeholder");
    // A DELETE guarded on description='in progress' must be issued for THIS
    // session's summary path — never an unguarded delete that could clobber a
    // real summary written by a concurrent worker.
    const del = sqls.find(s => /^\s*DELETE FROM "memory"/.test(s));
    expect(del).toBeTruthy();
    expect(del).toContain("description = 'in progress'");
    expect(del).toContain("/summaries/alice/sid-worker.md");
    // It must NOT have run claude -p or written any summary.
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(finalizeSummaryMock).not.toHaveBeenCalled();
    // The finally block must still release the lock.
    expect(releaseLockMock).toHaveBeenCalledWith("sid-worker");
  });

  it("treats a response with null rows/columns as empty (then cleans up)", async () => {
    process.env.HIVEMIND_WIKI_EVENT_RETRIES = "0";
    fetchMock.mockResolvedValue(jsonResp({}));
    await runWorker();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("falls back to default retries when the env var is non-numeric (no silent disable)", async () => {
    // Regression guard: a garbage HIVEMIND_WIKI_EVENT_RETRIES must NOT become
    // NaN and silently skip the retry loop (which would re-strand placeholders).
    process.env.HIVEMIND_WIKI_EVENT_RETRIES = "not-a-number";
    process.env.HIVEMIND_WIKI_EVENT_BACKOFF_MS = "0";
    fetchMock.mockResolvedValue(jsonResp({ columns: ["message", "creation_date"], rows: [] }));
    await runWorker();
    await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setImmediate(r));
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    // It must have retried (fallback to the default of 5), not bailed immediately.
    expect(log).toContain("no events yet — retry");
  });

  it("retries and recovers when events show up on a later fetch (race)", async () => {
    // Reproduces the real bug: the async capture write lags behind
    // SessionEnd, so the first event SELECT returns empty. With backoff=0 the
    // worker should retry, see the events on a subsequent fetch, and finalize
    // normally instead of stranding the placeholder.
    process.env.HIVEMIND_WIKI_EVENT_RETRIES = "5";
    process.env.HIVEMIND_WIKI_EVENT_BACKOFF_MS = "0";
    let eventSelects = 0;
    fetchMock.mockImplementation(async (_url: string, opts: any) => {
      const q = JSON.parse(opts.body).query as string;
      if (/^\s*SELECT message, creation_date FROM "sessions"/.test(q)) {
        eventSelects++;
        // Empty for the first two attempts, then the events appear.
        if (eventSelects <= 2) return jsonResp({ columns: ["message", "creation_date"], rows: [] });
        return jsonResp({ columns: ["message", "creation_date"], rows: [[JSON.stringify({ type: "user_message", content: "hi" }), "2026-01-01T00:00:00Z"]] });
      }
      // path lookup + existing-summary lookup → empty is fine
      return jsonResp({ columns: [], rows: [] });
    });
    // claude -p emits the summary on stdout; the worker persists it.
    execFileSyncMock.mockImplementation(() => Buffer.from("real summary body"));

    await runWorker();
    // Allow the backoff-0 setTimeout retries to flush.
    await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setImmediate(r));

    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("no events yet — retry");
    expect(eventSelects).toBeGreaterThanOrEqual(3);
    expect(execFileSyncMock).toHaveBeenCalled();
    expect(uploadSummaryMock).toHaveBeenCalled();
  });
});

// ═══ happy path: events + claude -p + upload ═══════════════════════════════

describe("wiki-worker — happy path", () => {
  const eventRows = [
    { message: JSON.stringify({ type: "user_message", content: "hi" }), creation_date: "2026-04-20T00:00:00Z" },
    { message: JSON.stringify({ type: "assistant_message", content: "hello" }), creation_date: "2026-04-20T00:00:01Z" },
  ];

  const mkFetch = (eventsCol: string[] = ["message", "creation_date"], pathRows = 1, hasSummary = false) => {
    let call = 0;
    return fetchMock.mockImplementation(async (_url: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({ columns: eventsCol, rows: eventRows.map(r => [r.message, r.creation_date]) });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({
          columns: ["path"],
          rows: pathRows > 0 ? [["/sessions/alice/alice_org_default_sid-worker.jsonl"]] : [],
        });
      }
      if (sql.startsWith("SELECT summary FROM")) {
        if (hasSummary) {
          return jsonResp({ columns: ["summary"], rows: [["# Session X\n- **JSONL offset**: 12\n\n## What Happened\nprior"]] });
        }
        return jsonResp({ columns: ["summary"], rows: [] });
      }
      call++;
      throw new Error(`unexpected query (${call}): ${sql}`);
    });
  };

  it("fetches events, writes JSONL, runs claude -p, uploads, finalizes, releases", async () => {
    mkFetch();
    // Simulate claude -p emitting the summary on stdout.
    execFileSyncMock.mockImplementation(() =>
      Buffer.from("# Session sid-worker\n\n## What Happened\nStuff happened.\n"));
    await runWorker();

    // claude -p was called once, prompt delivered over stdin (not argv)
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const calledArgs = execFileSyncMock.mock.calls[0][1] as string[];
    expect(calledArgs[0]).toBe("-p");
    expect(calledArgs).toContain("--no-session-persistence");
    expect(calledArgs).toContain("--model");
    expect(calledArgs).toContain("haiku");
    // Blast-radius collapse: no bypassPermissions, no tools.
    expect(calledArgs).not.toContain("bypassPermissions");
    expect(calledArgs).not.toContain("--permission-mode");
    expect(calledArgs).not.toContain("--allowedTools");

    // Prompt (over stdin) was expanded with real values + the inlined transcript
    const execOpts = execFileSyncMock.mock.calls[0][2];
    const prompt = execOpts.input as string;
    expect(prompt).toContain("SID=sid-worker");
    expect(prompt).toContain("PROJ=proj");
    expect(prompt).toContain("LINES=2");
    expect(prompt).toContain("OFFSET=0");
    expect(prompt).toContain("SRC=/sessions/alice/alice_org_default_sid-worker.jsonl");
    // The two session events are inlined into the prompt (the agent reads no file)
    expect(prompt).toContain('"type":"user_message"');
    expect(prompt).toContain('"type":"assistant_message"');

    // env flags on execFileSync to prevent runaway recursion
    expect(execOpts.env.HIVEMIND_WIKI_WORKER).toBe("1");
    expect(execOpts.env.HIVEMIND_CAPTURE).toBe("false");

    // upload was called with the full summary
    expect(uploadSummaryMock).toHaveBeenCalledTimes(1);
    const uploadParams = uploadSummaryMock.mock.calls[0][1];
    expect(uploadParams.tableName).toBe("memory");
    expect(uploadParams.agent).toBe("claude_code");
    expect(uploadParams.text).toContain("## What Happened");

    // finalize + release
    expect(finalizeSummaryMock).toHaveBeenCalledWith("sid-worker", 2);
    expect(releaseLockMock).toHaveBeenCalledWith("sid-worker");
  });

  it("parses JSONL offset from an existing summary on a resumed session", async () => {
    mkFetch(undefined, 1, true);
    execFileSyncMock.mockImplementation(() =>
      Buffer.from("# Session sid-worker\n\n## What Happened\ndone.\n"));
    await runWorker();
    const prompt = execFileSyncMock.mock.calls[0][2].input as string;
    expect(prompt).toContain("OFFSET=12");
    // The existing summary is inlined into the prompt so claude can merge on top.
    expect(prompt).toContain("EXISTING=[# Session X");
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("existing summary found, offset=12");
  });

  it("defaults to /sessions/unknown/ when the path SELECT returns no rows", async () => {
    mkFetch(undefined, 0);
    execFileSyncMock.mockImplementation(() =>
      Buffer.from("# Session\n\n## What Happened\nfallback.\n"));
    await runWorker();
    const prompt = execFileSyncMock.mock.calls[0][2].input as string;
    expect(prompt).toContain("SRC=/sessions/unknown/sid-worker.jsonl");
  });

  it("serializes event rows that arrive as objects (JSONB) instead of strings", async () => {
    fetchMock.mockImplementation(async (_url: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message, creation_date")) {
        return jsonResp({
          columns: ["message", "creation_date"],
          rows: [
            [{ type: "user_message", content: "hi" }, "2026-04-20T00:00:00Z"],
            [{ type: "tool_call", tool_name: "Bash" }, "2026-04-20T00:00:01Z"],
          ],
        });
      }
      if (sql.startsWith("SELECT DISTINCT path")) {
        return jsonResp({ columns: ["path"], rows: [["/sessions/alice/x.jsonl"]] });
      }
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    execFileSyncMock.mockImplementation(() => Buffer.from("x"));
    await runWorker();
    // The JSONB rows are serialized and inlined into the prompt (over stdin).
    const prompt = execFileSyncMock.mock.calls[0][2].input as string;
    expect(prompt).toContain('"type":"user_message"');
    expect(prompt).toContain('"type":"tool_call"');
  });
});

// ═══ claude -p failure paths ═══════════════════════════════════════════════

describe("wiki-worker — claude -p failure", () => {
  it("logs the claude exit code and skips the upload when no summary file lands", async () => {
    fetchMock.mockImplementation(async (_url: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/sessions/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    const err: any = new Error("claude boom");
    err.status = 42;
    execFileSyncMock.mockImplementation(() => { throw err; });
    await runWorker();

    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("claude -p failed: 42");
    expect(log).toContain("no summary file generated");
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(finalizeSummaryMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("falls back to err.message when err.status is absent", async () => {
    fetchMock.mockImplementation(async (_url: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    execFileSyncMock.mockImplementation(() => { throw new Error("no status"); });
    await runWorker();
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("claude -p failed: no status");
  });
});

// ═══ query retry logic ═════════════════════════════════════════════════════

describe("wiki-worker — query retry logic", () => {
  beforeEach(() => {
    // Stub setTimeout so retries don't actually sleep.
    vi.spyOn(global, "setTimeout").mockImplementation(((cb: any) => {
      cb();
      return 0 as any;
    }) as any);
  });

  it("retries on 500 and eventually succeeds", async () => {
    const responses = [
      jsonResp("server error", false, 500),
      jsonResp("server error", false, 500),
      jsonResp({ columns: ["message", "creation_date"], rows: [] }),
    ];
    fetchMock.mockImplementation(async () => responses.shift()!);
    await runWorker();
    // First query to sessions table was retried 2 times before success.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("retries on 401/403/429/502/503 (CloudFlare rate-limit class)", async () => {
    for (const status of [401, 403, 429, 502, 503]) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResp("", false, status))
        .mockResolvedValue(jsonResp({ columns: ["message", "creation_date"], rows: [] }));
      await runWorker();
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("throws (and main catches) on a non-retryable 400", async () => {
    fetchMock.mockResolvedValue(jsonResp("bad request", false, 400));
    await runWorker();
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toMatch(/fatal: API 400/);
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("gives up after exhausting retries on persistent 500", async () => {
    fetchMock.mockResolvedValue(jsonResp("still down", false, 500));
    await runWorker();
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toMatch(/fatal: API 500/);
  });
});

// ═══ finalize + release edge cases ═════════════════════════════════════════

describe("wiki-worker — finalize + release edge cases", () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (_url: string, init: any) => {
      const sql = JSON.parse(init.body).query as string;
      if (sql.startsWith("SELECT message")) return jsonResp({ columns: ["message", "creation_date"], rows: [["{}", "t"]] });
      if (sql.startsWith("SELECT DISTINCT path")) return jsonResp({ columns: ["path"], rows: [["/x.jsonl"]] });
      return jsonResp({ columns: ["summary"], rows: [] });
    });
    execFileSyncMock.mockImplementation(() => Buffer.from("# s\n## What Happened\nX\n"));
  });

  it("logs sidecar update failure but still releases the lock", async () => {
    finalizeSummaryMock.mockImplementation(() => { throw new Error("sidecar boom"); });
    await runWorker();
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("sidecar update failed: sidecar boom");
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("keeps going when releaseLock throws — the finally swallows it", async () => {
    releaseLockMock.mockImplementation(() => { throw new Error("release boom"); });
    await runWorker();
    // Worker still completes; the failure is caught in the finally.
    const log = readFileSync(join(hooksDir, "wiki.log"), "utf-8");
    expect(log).toContain("done");
  });

  it("does not upload when claude emits only whitespace on stdout", async () => {
    execFileSyncMock.mockImplementation(() => Buffer.from("   \n"));
    await runWorker();
    expect(uploadSummaryMock).not.toHaveBeenCalled();
    expect(finalizeSummaryMock).not.toHaveBeenCalled();
  });
});
