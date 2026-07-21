import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Orchestration tests for src/hooks/recall.ts — the UserPromptSubmit proactive-
 * recall hook. Drives main() end-to-end with mocked boundaries (stdin, config,
 * embeddings, DeeplakeApi, plugin-state, debug log) and asserts the emit/skip
 * decision, semantic-only search (no lexical/ILIKE fallback), the cosine gate,
 * latency budget, and failure isolation. The pure helpers
 * (gate/format/query/deadline) run for real — only the I/O boundary is mocked.
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
const apiCtorMock = vi.fn();
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
  DeeplakeApi: class {
    // Record ctor args so tests can assert WHICH org/workspace recall searched
    // — that is the routing decision (src/dir-config.ts).
    constructor(...a: unknown[]) { apiCtorMock(...a); }
    query(sql: string) { return queryMock(sql); }
  },
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
  embeddingsDisabledMock.mockReset().mockReturnValue(false); // default: semantic on (only search mode)
  embedMock.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
  queryMock.mockReset().mockResolvedValue([]);
  apiCtorMock.mockReset();
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

describe("recall hook — no embeddings (semantic-only: skip, never lexical)", () => {
  it("skips the search entirely when embeddings are disabled — NO ILIKE fallback", async () => {
    // The lexical (ILIKE) fallback was removed: it forced unindexed full-table
    // scans on the backend. With embeddings off there is no search mode, so
    // recall must return nothing WITHOUT ever querying.
    embeddingsDisabledMock.mockReturnValue(true);
    queryMock.mockResolvedValue([row({ score: 4, author: "levon" })]);
    const out = await runHook();
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled(); // no lexical query
    expect(embedMock).not.toHaveBeenCalled(); // no embedding either
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "none" }));
  });

  it("excludes the current session's own summary from the (semantic) results", async () => {
    queryMock.mockResolvedValue([row({ score: 0.8 })]);
    await runHook();
    expect(queryMock.mock.calls[0][0]).toContain("path <> '/summaries/sasun/sid.md'");
  });

  it("restricts the search to summary rows and does NOT project-scope by cwd basename", async () => {
    queryMock.mockResolvedValue([row({ score: 0.8 })]);
    await runHook(); // default fixture cwd = "/repo"
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain("path LIKE '/summaries/%'"); // summaries only
    expect(sql).not.toContain("project ="); // no fragile basename scoping
    expect(sql).toContain("<#>"); // cosine (semantic) query, not ILIKE
    expect(sql).not.toContain("ILIKE");
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

  it("records 'below' (no inject) when the semantic hit is below the cosine threshold", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([row({ score: 0.2 })]); // semantic below threshold
    const out = await runHook();
    expect(out).toBeNull();
    expect(debugLogMock).toHaveBeenCalledWith(expect.stringContaining("mode=semantic hit=below"));
    // No lexical retry: only the one semantic query ran.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).not.toContain("ILIKE");
  });

  it("skips (no inject) when semantic finds no embedded rows — NO lexical fallback", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    queryMock.mockResolvedValue([]); // semantic: no embedded rows
    const out = await runHook();
    expect(out).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1); // only the semantic query, no ILIKE retry
    expect(queryMock.mock.calls[0][0]).toContain("<#>");
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "none" }));
  });

  it("skips (no query at all) when the embed daemon is unavailable — NO lexical fallback", async () => {
    embeddingsDisabledMock.mockReturnValue(false);
    embedMock.mockResolvedValue(null); // daemon down → no query vector
    queryMock.mockResolvedValue([row({ score: 3 })]);
    const out = await runHook();
    expect(out).toBeNull();
    expect(queryMock).not.toHaveBeenCalled(); // no vector → never query
    expect(recordEventMock).toHaveBeenCalledWith(expect.objectContaining({ event: "none" }));
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

describe("recall hook — per-directory routing (.hivemind)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hivemind-recall-route-"));
    delete process.env.HIVEMIND_ORG_ID;
    delete process.env.HIVEMIND_WORKSPACE_ID;
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  /** org/workspace the search was actually issued against. */
  function searchedIdentity(): { orgId: unknown; workspaceId: unknown } {
    expect(apiCtorMock).toHaveBeenCalled();
    const [, , orgId, workspaceId] = apiCtorMock.mock.calls[0];
    return { orgId, workspaceId };
  }

  it("recalls from the workspace the session's directory is pinned to", async () => {
    writeFileSync(join(root, ".hivemind"), JSON.stringify({ workspaceId: "workspace2" }));
    stdinMock.mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid", cwd: root });
    await runHook();
    expect(searchedIdentity()).toEqual({ orgId: "o", workspaceId: "workspace2" });
  });

  it("routes the org too, inheriting the config from an ancestor directory", async () => {
    writeFileSync(join(root, ".hivemind"), JSON.stringify({ orgId: "acme", workspaceId: "client-work" }));
    const leaf = join(root, "svc", "deep");
    mkdirSync(leaf, { recursive: true });
    stdinMock.mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid", cwd: leaf });
    await runHook();
    expect(searchedIdentity()).toEqual({ orgId: "acme", workspaceId: "client-work" });
  });

  it("still routes recall under collect:false — collect gates capture, not reads", async () => {
    writeFileSync(join(root, ".hivemind"), JSON.stringify({ workspaceId: "client-work", collect: false }));
    stdinMock.mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid", cwd: root });
    await runHook();
    expect(searchedIdentity().workspaceId).toBe("client-work");
  });

  it("uses the global identity when the directory has no .hivemind", async () => {
    stdinMock.mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid", cwd: root });
    await runHook();
    expect(searchedIdentity()).toEqual({ orgId: "o", workspaceId: "w" });
  });

  it("falls back to process.cwd() when the payload carries no cwd", async () => {
    // Claude Code always sends cwd, but the field is optional in the payload —
    // resolving from process.cwd() keeps a cwd-less caller on a real directory
    // rather than walking up from undefined.
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    writeFileSync(join(root, ".hivemind"), JSON.stringify({ workspaceId: "from-process-cwd" }));
    stdinMock.mockResolvedValue({ prompt: "how did we fix the parser typeerror crash bug", session_id: "sid" });
    await runHook();
    expect(searchedIdentity().workspaceId).toBe("from-process-cwd");
    spy.mockRestore();
  });
});
