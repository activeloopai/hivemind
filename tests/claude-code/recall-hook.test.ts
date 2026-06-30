import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Orchestration tests for src/hooks/recall.ts — the UserPromptSubmit proactive-
 * recall hook. Drives main() end-to-end with mocked boundaries (stdin, config,
 * embeddings, DeeplakeApi, plugin-state, debug log) and asserts the emit/skip
 * decision, semantic↔lexical fallback, mode-aware gating, latency budget, and
 * failure isolation. The pure helpers (gate/format/query/deadline) run for
 * real — only the I/O boundary is mocked.
 *
 * SEMANTIC_ENABLED and RECALL_BUDGET_MS are read at module-eval time, so each
 * case sets env + mocks BEFORE the per-test dynamic import (vi.resetModules).
 */

const stdinMock = vi.fn();
const loadConfigMock = vi.fn();
const embeddingsDisabledMock = vi.fn();
const pluginEnabledMock = vi.fn();
const embedMock = vi.fn();
const queryMock = vi.fn();
const debugLogMock = vi.fn();
const recordEventMock = vi.fn();
const selfHealMock = vi.fn();

vi.mock("../../src/embeddings/self-heal.js", () => ({ ensurePluginNodeModulesLink: (...a: unknown[]) => selfHealMock(...a) }));
vi.mock("../../src/hooks/shared/recall-events.js", () => ({ recordRecallEvent: (...a: unknown[]) => recordEventMock(...a) }));
vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: unknown[]) => stdinMock(...a) }));
vi.mock("../../src/config.js", () => ({ loadConfig: (...a: unknown[]) => loadConfigMock(...a) }));
vi.mock("../../src/embeddings/disable.js", () => ({ embeddingsDisabled: (...a: unknown[]) => embeddingsDisabledMock(...a) }));
vi.mock("../../src/utils/plugin-state.js", () => ({ isHivemindPluginEnabled: (...a: unknown[]) => pluginEnabledMock(...a) }));
vi.mock("../../src/utils/debug.js", () => ({ log: (_t: string, msg: string) => debugLogMock(msg) }));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class { warmup() { return Promise.resolve(true); } embed(...a: unknown[]) { return embedMock(...a); } },
}));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class { query(sql: string) { return queryMock(sql); } },
}));

const CONFIG = {
  token: "t", apiUrl: "https://api", orgId: "o", workspaceId: "w",
  userName: "sasun", tableName: "mem", sessionsTableName: "sess",
  memoryPath: "/home/u/.deeplake/memory",
};

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: "/summaries/levon/s1.md", author: "levon", project: "indra",
    description: "Fixed the parser crash", last_update_date: "2026-06-19T00:00:00Z",
    score: 0.9, ...over,
  };
}

async function runHook(env: Record<string, string | undefined> = {}): Promise<string | null> {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  vi.resetModules();
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  try {
    await import("../../src/hooks/recall.js");
    // Wait past microtasks AND any short budget timer (the timeout case uses a
    // ~10ms budget) so main() finishes before we read the captured output.
    await new Promise((r) => setTimeout(r, 25));
    return out.join("\n") || null;
  } finally {
    console.log = orig;
  }
}

function parse(out: string | null): any {
  return JSON.parse((out ?? "").trim());
}

beforeEach(() => {
  for (const k of ["HIVEMIND_PROACTIVE_RECALL", "HIVEMIND_PROACTIVE_RECALL_DISABLED", "HIVEMIND_SEMANTIC_SEARCH", "HIVEMIND_RECALL_TIMEOUT_MS", "HIVEMIND_RECALL_MIN_OVERLAP", "HIVEMIND_WIKI_WORKER", "HIVEMIND_CAPTURE_ONLY_CLI", "CLAUDE_CODE_ENTRYPOINT"]) delete process.env[k];
  stdinMock.mockReset().mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid", cwd: "/repo" });
  loadConfigMock.mockReset().mockReturnValue(CONFIG);
  pluginEnabledMock.mockReset().mockReturnValue(true);
  embeddingsDisabledMock.mockReset().mockReturnValue(true); // default: lexical
  embedMock.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
  queryMock.mockReset().mockResolvedValue([]);
  debugLogMock.mockReset();
  recordEventMock.mockReset();
  selfHealMock.mockReset();
});

afterEach(() => { vi.restoreAllMocks(); });

describe("recall hook — guards (no search, no emit)", () => {
  it("returns immediately when proactive recall is opted out (HIVEMIND_PROACTIVE_RECALL=false)", async () => {
    const out = await runHook({ HIVEMIND_PROACTIVE_RECALL: "false" });
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns immediately via the dedicated HIVEMIND_PROACTIVE_RECALL_DISABLED=1 flag", async () => {
    const out = await runHook({ HIVEMIND_PROACTIVE_RECALL_DISABLED: "1" });
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns when the plugin is disabled", async () => {
    pluginEnabledMock.mockReturnValue(false);
    const out = await runHook();
    expect(out).toBeNull();
    expect(stdinMock).not.toHaveBeenCalled();
  });

  it("returns immediately inside a nested wiki worker (HIVEMIND_WIKI_WORKER=1)", async () => {
    const out = await runHook({ HIVEMIND_WIKI_WORKER: "1" });
    expect(out).toBeNull();
    expect(stdinMock).not.toHaveBeenCalled();
  });

  it("skips an acknowledgement prompt before any I/O", async () => {
    stdinMock.mockResolvedValue({ prompt: "yes", session_id: "sid" });
    const out = await runHook();
    expect(out).toBeNull();
    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("skip gate="));
  });

  it("skips when not logged in (no config token)", async () => {
    loadConfigMock.mockReturnValue(null);
    const out = await runHook();
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith("skip no-config");
  });

  it("honors HIVEMIND_CAPTURE_ONLY_CLI — skips a headless `claude -p` (sdk-cli) session", async () => {
    const out = await runHook({ HIVEMIND_CAPTURE_ONLY_CLI: "true", CLAUDE_CODE_ENTRYPOINT: "sdk-cli" });
    expect(out).toBeNull();
    expect(stdinMock).not.toHaveBeenCalled(); // gated before any I/O
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("still recalls for an interactive cli session under HIVEMIND_CAPTURE_ONLY_CLI", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([row({ score: 0.8, author: "levon" })]);
    const out = await runHook({ HIVEMIND_CAPTURE_ONLY_CLI: "true", CLAUDE_CODE_ENTRYPOINT: "cli" });
    expect(parse(out).hookSpecificOutput.additionalContext).toContain("levon");
  });
});

describe("recall hook — lexical path (no embeddings)", () => {
  it("injects an attributed block on a lexical hit above the overlap floor", async () => {
    queryMock.mockResolvedValue([row({ score: 4, author: "levon" })]);
    const out = await runHook(); // embeddingsDisabled=true → lexical
    const parsed = parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("HIVEMIND RECALL");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("levon");
    // It used the lexical ILIKE query, not the semantic one.
    expect(queryMock.mock.calls[0][0]).toContain("ILIKE");
    expect(queryMock.mock.calls[0][0]).not.toContain("<#>");
    expect(embedMock).not.toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("injected mode=lexical"));
    // Always-on telemetry records the injection.
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "injected", mode: "lexical", teammate: true }));
  });

  it("does NOT inject when the lexical overlap is below the floor (records 'none')", async () => {
    // A too-weak lexical match (overlap 1 < MIN 2) is treated as nothing
    // relevant — recorded as 'none', not 'below' (which is for scored-but-low
    // semantic hits).
    queryMock.mockResolvedValue([row({ score: 1 })]);
    const out = await runHook();
    expect(out).toBeNull();
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "none" }));
  });

  it("does not search when the prompt passes the gate but yields fewer than 2 keywords", async () => {
    // "TypeError?" passes shouldRecall (signal) but extractKeywords → 1 token,
    // so the lexical path must bail BEFORE querying (exercises keywords<2, not
    // the gate's too-short branch).
    stdinMock.mockResolvedValue({ prompt: "TypeError?", session_id: "sid", cwd: "/repo" });
    const out = await runHook();
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("excludes the current session's own summary from results", async () => {
    queryMock.mockResolvedValue([row({ score: 3 })]);
    await runHook();
    expect(queryMock.mock.calls[0][0]).toContain("path <> '/summaries/sasun/sid.md'");
  });

  it("restricts the search to summary rows and does NOT project-scope by cwd basename", async () => {
    queryMock.mockResolvedValue([row({ score: 3 })]);
    await runHook(); // default fixture cwd = "/repo"
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain("path LIKE '/summaries/%'"); // summaries only
    expect(sql).not.toContain("project ="); // no fragile basename scoping
  });
});

describe("recall hook — semantic path (embeddings on)", () => {
  it("injects on a semantic hit above the cosine threshold", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([row({ score: 0.8, author: "levon" })]);
    const out = await runHook();
    const parsed = parse(out);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("levon");
    expect(queryMock.mock.calls[0][0]).toContain("<#>"); // cosine query
    expect(embedMock).toHaveBeenCalled();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("injected mode=semantic"));
  });

  it("self-heals the plugin deps symlink BEFORE building the EmbedClient (post-upgrade)", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([row({ score: 0.8 })]);
    await runHook();
    expect(selfHealMock).toHaveBeenCalledTimes(1);
    expect(selfHealMock).toHaveBeenCalledWith(expect.objectContaining({ bundleDir: expect.any(String) }));
    // ordering: the repair must run before the embed call so the daemon's deps exist
    expect(selfHealMock.mock.invocationCallOrder[0]).toBeLessThan(embedMock.mock.invocationCallOrder[0]);
  });

  it("still recalls when the self-heal repair throws (best-effort, non-fatal)", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    selfHealMock.mockImplementation(() => { throw new Error("symlink EACCES"); });
    queryMock.mockResolvedValue([row({ score: 0.8, author: "levon" })]);
    const out = await runHook();
    expect(parse(out).hookSpecificOutput.additionalContext).toContain("levon");
    expect(embedMock).toHaveBeenCalled(); // proceeded to embed despite repair failure
  });

  it("records 'below' (no inject) when semantic is below threshold AND lexical also misses", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([row({ score: 0.2 })]); // semantic below; lexical overlap 0.2 < 2
    const out = await runHook();
    expect(out).toBeNull();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("mode=semantic hit=below"));
  });

  it("HYBRID: a below-threshold semantic hit does not suppress a passing lexical match", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock
      .mockResolvedValueOnce([row({ score: 0.2 })])              // semantic: below threshold
      .mockResolvedValueOnce([row({ score: 3, author: "levon" })]); // lexical: clears overlap
    const out = await runHook();
    expect(parse(out).hookSpecificOutput.additionalContext).toContain("levon");
    expect(queryMock.mock.calls[0][0]).toContain("<#>");   // semantic tried first
    expect(queryMock.mock.calls[1][0]).toContain("ILIKE"); // then lexical wins
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("injected mode=lexical"));
  });

  it("falls back to lexical when semantic finds no embedded rows", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock
      .mockResolvedValueOnce([])                       // semantic: no embedded rows
      .mockResolvedValueOnce([row({ score: 3 })]);     // lexical: keyword hit
    const out = await runHook();
    expect(parse(out).hookSpecificOutput.additionalContext).toContain("HIVEMIND RECALL");
    expect(queryMock.mock.calls[0][0]).toContain("<#>");   // 1st = semantic
    expect(queryMock.mock.calls[1][0]).toContain("ILIKE"); // 2nd = lexical
  });

  it("falls back to lexical when the embed daemon is unavailable", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    embedMock.mockResolvedValue(null); // daemon down
    queryMock.mockResolvedValue([row({ score: 3 })]);
    const out = await runHook();
    expect(parse(out).hookSpecificOutput.additionalContext).toContain("HIVEMIND RECALL");
    expect(queryMock.mock.calls[0][0]).toContain("ILIKE");
  });
});

describe("recall hook — latency budget + failure isolation", () => {
  it("skips (no emit) when the search exceeds the budget", async () => {
    queryMock.mockImplementation(() => new Promise((res) => setTimeout(() => res([row({ score: 5 })]), 60)));
    const out = await runHook({ HIVEMIND_RECALL_TIMEOUT_MS: "10" });
    expect(out).toBeNull();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("skip timeout"));
  });

  it("records 'error' (not 'timeout') and never emits when the query fails", async () => {
    queryMock.mockRejectedValue(new Error("backend down"));
    const out = await runHook();
    expect(out).toBeNull();
    // A fast backend failure must be telemetered as 'error', distinct from a
    // real deadline 'timeout' (codex P3).
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "error" }));
    expect(recordEventMock).not.toHaveBeenCalledWith(expect.objectContaining({ event: "timeout" }));
  });

  it("emits nothing when there are no matching rows", async () => {
    queryMock.mockResolvedValue([]);
    const out = await runHook();
    expect(out).toBeNull();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("hit=none"));
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "none" }));
  });

  it("records a no-config event when not logged in (telemetry even on the unhappy path)", async () => {
    loadConfigMock.mockReturnValue(null);
    await runHook();
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "no-config" }));
  });

  it("does not inject (records 'unattributable') when the top hit has no author", async () => {
    // Above-threshold hit but no author to credit → formatRecallContext yields
    // "" → never inject unattributed. (A non-canonical PATH still injects via
    // the row's author — that's covered in the format unit tests.)
    queryMock.mockResolvedValue([row({ score: 4, author: "" })]);
    const out = await runHook();
    expect(out).toBeNull();
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "unattributable" }));
  });

  it("top-level catch logs 'fatal' and exits 0 when main() itself throws", async () => {
    // A throw escaping main() (e.g. readStdin rejects) must never crash the
    // turn — the process exits 0 after logging, so the prompt proceeds.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => undefined as never));
    stdinMock.mockRejectedValue(new Error("stdin boom"));
    await runHook();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("fatal: stdin boom"));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe("recall hook — recent-turns context augmentation (lexical path)", () => {
  // Verify that keywords from the last few session turns are folded into the
  // lexical query, so a short prompt like "implement the refund flow" inherits
  // "payments ledger charge" from earlier conversation turns and matches the
  // right summary even though those words aren't in the prompt itself.
  let tmpHome: string;
  const SESSION_ID = "test-session-ctx";
  const CWD = "/fake-repo";
  const SLUG = "-fake-repo"; // cwd.replace(/[^a-zA-Z0-9]/g, "-")

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "recall-ctx-"));
    // Write a fake session transcript with recent turns containing topic words.
    const projectDir = join(tmpHome, ".claude", "projects", SLUG);
    mkdirSync(projectDir, { recursive: true });
    const userTurn = JSON.stringify({
      type: "user",
      message: { role: "user", content: "I need to add a payment charge to the ledger service" },
    });
    const assistantTurn = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "I'll implement the charge method using the ledger payment API" }] },
    });
    writeFileSync(join(projectDir, `${SESSION_ID}.jsonl`), `${userTurn}\n${assistantTurn}\n`);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("folds recent-turn keywords into the lexical ILIKE query", async () => {
    const origHome = process.env.HOME;
    process.env.HOME = tmpHome;
    stdinMock.mockResolvedValue({
      prompt: "implement the refund flow",  // 4 words — passes gate, but no "payments"/"ledger" here
      session_id: SESSION_ID,
      cwd: CWD,
    });
    queryMock.mockResolvedValue([row({ score: 3 })]);
    try {
      await runHook();
    } finally {
      process.env.HOME = origHome;
    }
    // The lexical ILIKE call should include keywords from recent turns
    const lexicalCall = queryMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("ILIKE"));
    expect(lexicalCall).toBeDefined();
    const sql = String(lexicalCall![0]);
    // "ledger" or "charge" or "payment" must appear — from the recent turns,
    // not from the prompt itself which only says "implement the refund flow".
    const hasContextKeyword = sql.includes("ledger") || sql.includes("charge") || sql.includes("payment");
    expect(hasContextKeyword, `lexical SQL missing context keywords: ${sql}`).toBe(true);
  });

  it("still works when the transcript file does not exist (best-effort, no throw)", async () => {
    stdinMock.mockResolvedValue({
      prompt: "implement the refund flow",
      session_id: "nonexistent-session",
      cwd: CWD,
    });
    queryMock.mockResolvedValue([row({ score: 3 })]);
    // Should not throw — gracefully falls back to prompt-only keywords.
    await expect(runHook()).resolves.not.toThrow();
    const lexicalCall = queryMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("ILIKE"));
    expect(lexicalCall).toBeDefined(); // still searched, just without context keywords
  });
});
