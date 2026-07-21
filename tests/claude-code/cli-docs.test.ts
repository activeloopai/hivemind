import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

/**
 * CLI handler tests for `hivemind docs`. The handler is thin (argparse +
 * dispatch into the real src/docs store), so we mock the network boundary
 * (`DeeplakeApi`), config, version, and the two heavy collaborators the
 * refresh path would otherwise reach (the graph snapshot loader and the host
 * LLM). The store functions run for real against the query spy.
 */

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

const ensureDocsTableMock = vi.fn();
const queryMock = vi.fn();
const loadCurrentSnapshotMock = vi.fn();

vi.mock("../../src/config.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor() { /* nothing */ }
    ensureDocsTable(name: string) { return ensureDocsTableMock(name); }
    query(sql: string) { return queryMock(sql); }
  },
}));
vi.mock("../../src/cli/version.js", () => ({ getVersion: () => "0.7.99" }));
vi.mock("../../src/graph/load-current.js", () => ({
  loadCurrentSnapshot: (...a: unknown[]) => loadCurrentSnapshotMock(...a),
}));
vi.mock("../../src/docs/refresh-llm.js", () => ({
  makeHostGenerate: () => async () => "stub",
  makeHostGenerateDoc: () => async () => "stub",
  makeHostBatchGenerateDoc: () => async () => new Map<string, string>(),
  // Wiki + wiki-refresh reach these; stub so no test ever spawns a real LLM.
  // The narrative must carry a markdown heading to pass validateWikiNarrative.
  makeHostRunPrompt: () => async () => "## Overview\n\nStub wiki narrative.",
  makeHostPageRunPrompt: () => async () => "## Overview\n\nStub wiki narrative.",
}));
// Hermetic: no embed daemon round-trips in unit tests.
vi.mock("../../src/docs/embed.js", () => ({
  makeDocEmbedder: () => async () => null,
  makeQueryEmbedder: () => async () => null,
}));
// The wiki-refresh cycle is a lease/meta/network orchestration (and its local
// variant patches working-tree files). Stub both so the `wiki-refresh` and
// `sync` handler branches are exercised without a live backend or real LLM.
const runWikiRefreshCycleMock = vi.fn();
const runLocalWikiRefreshMock = vi.fn();
vi.mock("../../src/docs/wiki-refresh.js", () => ({
  runWikiRefreshCycle: (...a: unknown[]) => runWikiRefreshCycleMock(...a),
  runLocalWikiRefresh: (...a: unknown[]) => runLocalWikiRefreshMock(...a),
}));
// Onboarding IO is TTY-driven; drive it explicitly so the interactive
// consent branches of `sync` and `auto on` are reachable without a terminal.
const io = vi.hoisted(() => ({ interactive: false, answer: "n", generate: false }));
vi.mock("../../src/docs/onboarding.js", () => ({
  defaultIo: () => ({ interactive: io.interactive, ask: async () => io.answer }),
  runDocsOnboarding: async () => ({ generate: io.generate, auto: false, asked: true }),
}));

import { runDocsCommand } from "../../src/commands/docs.js";
import { deriveProjectKey } from "../../src/utils/repo-identity.js";
import { setAuto } from "../../src/docs/auto-registry.js";
import { loadConfig } from "../../src/config.js";
const loadConfigMock = loadConfig as unknown as ReturnType<typeof vi.fn>;

const VALID_CONFIG = {
  token: "tok", orgId: "org", orgName: "OrgName", userName: "alice@activeloop.ai",
  workspaceId: "ws", apiUrl: "https://api", tableName: "memory",
  sessionsTableName: "sessions", skillsTableName: "skills", rulesTableName: "hivemind_rules",
  goalsTableName: "g", kpisTableName: "k", docsTableName: "hivemind_docs",
  codebaseTableName: "codebase", memoryPath: "/tmp/mem",
};

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: "row", doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "body",
    anchors: "[]", tier: "fast", status: "active",
    // Legacy unstamped row: visible under projectOrLegacy scoping from any repo.
    project: "", version: 1,
    created_at: "t", updated_at: "t", agent: "m", plugin_version: "0", ...over,
  };
}

let logged: string[] = [];
let erred: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

async function run(args: string[]): Promise<number | null> {
  try {
    await runDocsCommand(args);
    return null;
  } catch (e) {
    const m = /__EXIT_(\d+)__/.exec((e as Error).message);
    if (m) return Number(m[1]);
    throw e;
  }
}

beforeEach(() => {
  logged = []; erred = [];
  ensureDocsTableMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockResolvedValue([]);
  loadCurrentSnapshotMock.mockReset().mockReturnValue({ nodes: [], links: [] });
  runWikiRefreshCycleMock.mockReset().mockResolvedValue({ status: "generated", head: "abcdef1234567", outcomes: [{ action: "created", doc_id: "wiki/x" }] });
  runLocalWikiRefreshMock.mockReset().mockResolvedValue({ outcomes: [{ action: "patched", file: "a.hivemind.md", reasons: ["drift"] }] });
  io.interactive = false; io.answer = "n"; io.generate = false;
  loadConfigMock.mockReset().mockReturnValue(VALID_CONFIG);
  logSpy = vi.spyOn(console, "log").mockImplementation((...a: any[]) => { logged.push(a.join(" ")); });
  errSpy = vi.spyOn(console, "error").mockImplementation((...a: any[]) => { erred.push(a.join(" ")); });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code ?? 0}__`);
  }) as any);
});
afterEach(() => {
  logSpy.mockRestore(); errSpy.mockRestore(); exitSpy.mockRestore();
});

describe("hivemind docs — dispatch & usage", () => {
  it("prints usage with no subcommand", async () => {
    await run([]);
    expect(logged.join("\n")).toMatch(/hivemind docs/);
  });
  it("exits 2 when not logged in", async () => {
    loadConfigMock.mockReturnValue(null);
    expect(await run(["list"])).toBe(2);
    expect(erred.join()).toMatch(/Not logged in/);
  });
  it("errors on an unknown subcommand", async () => {
    expect(await run(["frobnicate"])).toBe(1);
    expect(erred.join()).toMatch(/Unknown subcommand/);
  });
});

describe("hivemind docs set", () => {
  it("requires a doc-id", async () => {
    expect(await run(["set"])).toBe(1);
    expect(erred.join()).toMatch(/Missing doc-id/);
  });
  it("creates v1 via the real store (SELECT then INSERT)", async () => {
    await run(["set", "a.ts", "the body", "--project", "p"]);
    expect(ensureDocsTableMock).toHaveBeenCalledWith("hivemind_docs");
    const sqls = queryMock.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => /^SELECT/.test(s))).toBe(true);
    expect(sqls.some((s) => /^INSERT INTO "hivemind_docs"/.test(s))).toBe(true);
    expect(logged.join()).toMatch(/Set doc a\.ts → v1/);
  });
  it("rejects --anchor when the symbol is not in the graph", async () => {
    expect(await run(["set", "a.ts", "body", "--anchor", "a.ts:missing:function"])).toBe(1);
    expect(erred.join()).toMatch(/symbol not in graph/);
  });
});

describe("hivemind docs show", () => {
  it("prints (no doc) when nothing matches", async () => {
    await run(["show", "a.ts"]);
    expect(logged.join()).toMatch(/\(no doc for a\.ts\)/);
  });
  it("prints metadata and body when found", async () => {
    queryMock.mockResolvedValueOnce([docRow({ version: 3, content: "hello world" })]);
    await run(["show", "a.ts"]);
    expect(logged.join("\n")).toMatch(/version: 3/);
    expect(logged.join("\n")).toMatch(/hello world/);
  });
  it("requires a doc-id", async () => {
    expect(await run(["show"])).toBe(1);
  });
});

describe("hivemind docs list", () => {
  it("reports empty", async () => {
    await run(["list"]);
    expect(logged.join()).toMatch(/no docs with status=active/);
  });
  it("lists rows (after the status-header meta read)", async () => {
    // The status header reads the _meta row FIRST; script that read as empty,
    // then the page rows for the actual listing.
    queryMock.mockResolvedValueOnce([]); // header: readRefreshMeta
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "x.ts", version: 2 })]);
    await run(["list", "--status", "all"]);
    const out = logged.join("\n");
    expect(out).toMatch(/x\.ts/);
    expect(out).toMatch(/repo: .*  org: /); // header present
  });
  it("rejects a bad --status", async () => {
    expect(await run(["list", "--status", "bogus"])).toBe(1);
  });
  it("default view hides other repos' pages; --all shows the whole table", async () => {
    // Shared org table: another repo's page must NOT appear under this
    // repo's header by default (caught live during manual e2e).
    const foreign = docRow({ doc_id: "wiki/other", project: "other-project" });
    queryMock.mockResolvedValueOnce([]); // header meta read
    queryMock.mockResolvedValueOnce([foreign, docRow({ doc_id: "mine.ts" })]);
    await run(["list", "--status", "all"]);
    let out = logged.join("\n");
    expect(out).toMatch(/mine\.ts/); // legacy '' row: always visible
    expect(out).not.toMatch(/wiki\/other/);
    logged.length = 0;
    queryMock.mockResolvedValueOnce([]); // header meta read
    queryMock.mockResolvedValueOnce([foreign, docRow({ doc_id: "mine.ts" })]);
    await run(["list", "--status", "all", "--all"]);
    out = logged.join("\n");
    expect(out).toMatch(/wiki\/other/); // global view opts back in
    // ...grouped by repo, one titled section per project — a human must
    // never have to decode project hashes to tell repos apart.
    expect(out).toMatch(/project other-project\s+—\s+1 page\(s\)/);
    expect(out).toMatch(/legacy rows — no project stamp/); // the '' row's section
  });
  it("shows wiki generation progress: done count + pending page names", async () => {
    // A real dir with 3 sizeable files -> one eligible group ("pkg").
    const dir = mkdtempSync(join(tmpdir(), "cli-list-prog-"));
    mkdirSync(join(dir, "pkg"));
    for (const f of ["a.ts", "b.ts", "c.ts"]) writeFileSync(join(dir, "pkg", f), "export const x = 1;\n".repeat(200));
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: ["a", "b", "c"].map((n) => ({
        id: `pkg/${n}.ts:${n}:function`, label: n, kind: "function",
        source_file: `pkg/${n}.ts`, source_location: "L1-L2", language: "typescript", exported: true,
      })),
      links: [],
    });
    try {
      // No wiki page in the table yet -> 0/1 with the pending name.
      queryMock.mockResolvedValueOnce([]); // header meta read
      queryMock.mockResolvedValueOnce([]); // rows
      await run(["list", "--cwd", dir]);
      let out = logged.join("\n");
      expect(out).toMatch(/wiki: 0\/1 pages generated — pending: wiki\/pkg/);
      logged.length = 0;
      // Page landed -> complete.
      queryMock.mockResolvedValueOnce([]); // header meta read
      queryMock.mockResolvedValueOnce([docRow({ doc_id: "wiki/pkg" })]);
      await run(["list", "--cwd", dir]);
      out = logged.join("\n");
      expect(out).toMatch(/wiki: 1\/1 pages generated/);
      expect(out).not.toMatch(/pending/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("falls back to the grouped org view when the cwd is not a docs-enabled repo", async () => {
    // No graph + not in the consent registry (home dir case from manual e2e):
    // a per-repo header would be useless, so the org view shows instead.
    const prevReg = process.env.HIVEMIND_DOCS_AUTO_FILE;
    process.env.HIVEMIND_DOCS_AUTO_FILE = join(tmpdir(), "nonexistent-registry.json");
    loadCurrentSnapshotMock.mockReturnValue(null);
    try {
      queryMock.mockResolvedValueOnce([docRow({ doc_id: "wiki/other", project: "other-project" })]);
      await run(["list", "--status", "all"]);
      const out = logged.join("\n");
      expect(out).toMatch(/is not a docs-enabled repo — showing every repo in org/);
      expect(out).toMatch(/wiki\/other/); // grouped org view, not an empty per-repo listing
      expect(out).not.toMatch(/repo: .*  org: .*  auto:/); // no misleading per-repo header
    } finally {
      if (prevReg === undefined) delete process.env.HIVEMIND_DOCS_AUTO_FILE;
      else process.env.HIVEMIND_DOCS_AUTO_FILE = prevReg;
    }
  });
  it("--all caps each repo section and points at --project for the rest", async () => {
    const many = Array.from({ length: 25 }, (_, i) => docRow({ doc_id: `wiki/p${i}`, project: "big-project" }));
    queryMock.mockResolvedValueOnce([]); // header meta read
    queryMock.mockResolvedValueOnce(many);
    await run(["list", "--status", "all", "--all"]);
    const out = logged.join("\n");
    expect(out).toMatch(/big-project\s+—\s+25 page\(s\)/);
    expect(out).toMatch(/\(\+5 more — hivemind docs list --project /);
    expect((out.match(/\[active\]/g) ?? []).length).toBe(20); // cap enforced
  });
});

describe("hivemind docs archive", () => {
  it("requires a doc-id", async () => {
    expect(await run(["archive"])).toBe(1);
  });
  it("archives an existing doc (version bump)", async () => {
    queryMock.mockResolvedValueOnce([docRow({ version: 2 })]); // getDocLatest
    await run(["archive", "a.ts"]);
    const sqls = queryMock.mock.calls.map((c) => c[0] as string);
    // UPDATE-in-place (F1): archive flips status on the existing row, not a new INSERT.
    expect(sqls.some((s) => /UPDATE "hivemind_docs" SET/.test(s) && /status = 'archived'/.test(s))).toBe(true);
    expect(logged.join()).toMatch(/Archived doc a\.ts → v3/);
  });
});

describe("hivemind docs refresh", () => {
  it("errors when no local graph exists", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    expect(await run(["refresh"])).toBe(1);
    expect(erred.join()).toMatch(/No local graph/);
  });
  it("reports when nothing needs refreshing", async () => {
    // empty graph + no docs → no impact, no LLM call
    await run(["refresh", "--dry-run"]);
    expect(logged.join()).toMatch(/no docs need refreshing/);
  });
});

describe("hivemind docs — anchored authoring + refresh over real files", () => {
  let dir: string;
  const fooNode = {
    id: "f.ts:foo:function", label: "foo", kind: "function",
    source_file: "f.ts", source_location: "L1-L3", language: "typescript",
    exported: true, signature: "function foo(): number",
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cli-docs-"));
    writeFileSync(join(dir, "f.ts"), "export function foo() {\n  return 1;\n}\n");
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [fooNode], links: [] });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("set --anchor builds an anchor from the graph and stores it", async () => {
    await run(["set", "f.ts", "doc body", "--anchor", "f.ts:foo:function", "--cwd", dir, "--project", "p"]);
    const insert = queryMock.mock.calls.map((c) => c[0] as string).find((s) => /INSERT INTO "hivemind_docs"/.test(s))!;
    expect(insert).toBeDefined();
    // the anchors column carries the symbol id (not the empty [] default)
    expect(insert).toContain("f.ts:foo:function");
    expect(insert).toContain("content_hash");
    expect(logged.join()).toMatch(/Set doc f\.ts → v1/);
  });

  it("refresh regenerates an impacted doc through the stub generator + gate", async () => {
    // doc anchored to foo with a STALE hash → drift detected → refreshed.
    const stale = JSON.stringify([{ symbol_id: "f.ts:foo:function", content_hash: "stale000" }]);
    queryMock.mockResolvedValue([docRow({ doc_id: "f.ts", content: "old body", anchors: stale })]);
    await run(["refresh", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Refreshed 1/);
    // UPDATE-in-place (F1): the existing doc row is rewritten, not re-INSERTed.
    const update = queryMock.mock.calls.map((c) => c[0] as string).find((s) => /UPDATE "hivemind_docs" SET/.test(s));
    expect(update).toBeDefined();
    expect(update!).toContain("stub"); // the generated body landed
  });

  it("refresh prints a rejection outcome when the gate rejects (slow tier)", async () => {
    const stale = JSON.stringify([{ symbol_id: "f.ts:foo:function", content_hash: "stale000" }]);
    queryMock.mockResolvedValue([docRow({ doc_id: "f.ts", content: "old body", anchors: stale, tier: "slow" })]);
    await run(["refresh", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/rejected f\.ts:.*slow-tier/);
    // no write happened — slow docs are not auto-refreshed. The refresh path
    // writes via UPDATE-in-place, so asserting only "no INSERT" would pass
    // even if the gate leaked a write; check both statement kinds.
    const writes = queryMock.mock.calls.map((c) => c[0] as string).filter((s) => /INSERT|UPDATE/.test(s));
    expect(writes).toHaveLength(0);
  });
});

describe("hivemind docs — cross-project existence scoping", () => {
  // Regression (bugs/fix-cross-project-existence-suppression.md): the wiki and
  // generate existence reads were GLOBAL (`listDocs` with no project filter),
  // so a same-named doc_id owned by ANOTHER repo in the shared org table
  // silently suppressed generation for THIS repo. The reads are now scoped
  // `projectOrLegacy: project`, so only this project's rows — plus legacy ''
  // rows written before project stamping — count as "already exists".
  //
  // Note: `listDocs` applies the project filter CLIENT-side (it reads the full
  // union then drops non-matching rows in JS — see src/docs/read.ts), so these
  // tests assert the observable skip decision rather than a WHERE clause in the
  // captured SQL. The behavioral discrimination in the last test is the real
  // guarantee: a global read could never suppress exactly the same-project row.
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cli-docs-scope-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // One documentable file under tests/ → wiki group key "tests" → doc_id wiki/tests.
  const wikiSnap = {
    nodes: [{
      id: "tests/foo.ts:foo:function", label: "foo", kind: "function",
      source_file: "tests/foo.ts", source_location: "L1-L2",
      language: "typescript", exported: true,
    }],
    links: [],
  };
  // One documentable file → per-file generate target with doc_id src/reader.ts.
  const genSnap = {
    nodes: [{
      id: "src/reader.ts:read:function", label: "read", kind: "function",
      source_file: "src/reader.ts", source_location: "L1-L2",
      language: "typescript", exported: true,
    }],
    links: [],
  };

  it("wiki --dry-run: another project's wiki/tests does NOT suppress this repo's", async () => {
    loadCurrentSnapshotMock.mockReturnValue(wikiSnap);
    // The single existence read returns only a FOREIGN-project collision.
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "wiki/tests", project: "other-project" })]);
    await run(["wiki", "--dry-run", "--cwd", dir]);
    const out = logged.join("\n");
    expect(out).toMatch(/1 wiki page\(s\) would be generated/);
    expect(out).toMatch(/wiki\/tests/);
  });

  it("generate --dry-run: another project's colliding per-file doc_id does NOT suppress", async () => {
    loadCurrentSnapshotMock.mockReturnValue(genSnap);
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "src/reader.ts", project: "other-project" })]);
    await run(["generate", "--dry-run", "--cwd", dir]);
    const out = logged.join("\n");
    expect(out).toMatch(/1 target\(s\) would be documented/);
    expect(out).toMatch(/src\/reader\.ts/);
  });

  it("legacy '' rows still suppress (pre-scoping corpora keep working)", async () => {
    loadCurrentSnapshotMock.mockReturnValue(wikiSnap);
    // A legacy unstamped row with the same doc_id must STILL count as existing.
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "wiki/tests", project: "" })]);
    await run(["wiki", "--dry-run", "--cwd", dir]);
    const out = logged.join("\n");
    expect(out).toMatch(/0 wiki page\(s\) would be generated/);
    expect(out).not.toMatch(/wiki\/tests/);
  });

  it("existence read is project-scoped, not global: same-project row suppresses, foreign is ignored", async () => {
    loadCurrentSnapshotMock.mockReturnValue(wikiSnap);
    const project = deriveProjectKey(dir).key;
    // Table holds BOTH a foreign collision (must be ignored) and this repo's own
    // row (must suppress). A global read would count both or neither — only a
    // project-scoped read suppresses exactly the same-project doc.
    queryMock.mockResolvedValueOnce([
      docRow({ doc_id: "wiki/tests", project: "other-project" }),
      docRow({ doc_id: "wiki/tests", project }),
    ]);
    await run(["wiki", "--dry-run", "--cwd", dir]);
    const out = logged.join("\n");
    expect(out).toMatch(/0 wiki page\(s\) would be generated/);
    expect(out).not.toMatch(/wiki\/tests/);
  });
});

// Broad surface coverage for the CLI dispatcher: every subcommand handler is
// driven through runDocsCommand against the query spy + real store, so a
// refactor that drops a branch (or an escaping/order regression) is caught.
// The registry-touching subcommands are isolated to a per-test temp file via
// HIVEMIND_DOCS_AUTO_FILE so they never read/write the developer's real state.
describe("hivemind docs — subcommand surface coverage", () => {
  let dir: string;
  let regFile: string;
  let prevReg: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cli-docs-surf-"));
    regFile = join(dir, "docs-auto.json");
    prevReg = process.env.HIVEMIND_DOCS_AUTO_FILE;
    process.env.HIVEMIND_DOCS_AUTO_FILE = regFile;
  });
  afterEach(() => {
    if (prevReg === undefined) delete process.env.HIVEMIND_DOCS_AUTO_FILE;
    else process.env.HIVEMIND_DOCS_AUTO_FILE = prevReg;
    rmSync(dir, { recursive: true, force: true });
  });

  const fooNode = {
    id: "f.ts:foo:function", label: "foo", kind: "function",
    source_file: "f.ts", source_location: "L1-L3", language: "typescript",
    exported: true, signature: "function foo(): number", source: "export function foo() {\n  return 1;\n}\n",
  };

  // --- flag parsing guards ---
  it("set rejects an invalid --tier", async () => {
    expect(await run(["set", "a.ts", "body", "--tier", "bogus"])).toBe(1);
    expect(erred.join()).toMatch(/Invalid --tier/);
  });
  it("list rejects a non-integer --limit", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    expect(await run(["list", "--limit", "abc", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/Invalid --limit/);
  });
  it("set reads the body from --file", async () => {
    const f = join(dir, "body.md");
    writeFileSync(f, "body from a file");
    await run(["set", "a.ts", "--file", f, "--project", "p"]);
    const insert = queryMock.mock.calls.map((c) => c[0] as string).find((s) => /INSERT INTO "hivemind_docs"/.test(s));
    expect(insert).toBeDefined();
    expect(insert!).toContain("body from a file");
  });

  // --- index ---
  it("index prints a browsable directory listing", async () => {
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "a.ts" })]); // listDocMeta
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "a.ts", content: "# A\nfirst line" })]); // listDocsByIds
    await run(["index"]);
    expect(logged.join("\n")).toMatch(/a\.ts/);
  });

  // --- list: registry + project views ---
  it("list --repos with no registry entries prints the enable hint", async () => {
    await run(["list", "--repos"]);
    expect(logged.join()).toMatch(/no repos registered/);
  });
  it("list --repos lists registered repos", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: "projkey", path: "/some/repo", auto: true });
    await run(["list", "--repos"]);
    expect(logged.join("\n")).toMatch(/AUTO.*\/some\/repo/);
  });
  it("list --project resolves an explicit project and scopes the read", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["list", "--project", "projkey", "--cwd", dir]);
    // No throw + a per-repo (not org grouped) view means the scoped path ran.
    expect(logged.join()).toMatch(/no docs with status=active/);
  });

  // --- archive failure ---
  it("archive reports failure when the doc does not exist", async () => {
    queryMock.mockResolvedValue([]); // getDocLatest → none → editDoc throws
    expect(await run(["archive", "missing.ts"])).toBe(1);
    expect(erred.join()).toMatch(/Archive failed/);
  });

  // --- refresh: dry-run with an impacted doc (full-scan branch, no git) ---
  it("refresh --dry-run lists impacted docs (full scan when no git diff)", async () => {
    writeFileSync(join(dir, "f.ts"), "export function foo() {\n  return 1;\n}\n");
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [fooNode], links: [] });
    const stale = JSON.stringify([{ symbol_id: "f.ts:foo:function", content_hash: "stale000" }]);
    queryMock.mockResolvedValue([docRow({ doc_id: "f.ts", anchors: stale })]);
    await run(["refresh", "--dry-run", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/1 doc\(s\) would be refreshed/);
    expect(logged.join("\n")).toMatch(/f\.ts/);
  });

  // --- wiki-refresh --local (working-tree preview, no table writes) ---
  it("wiki-refresh --local runs a working-tree preview", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    await run(["wiki-refresh", "--local", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Local wiki preview: 1 page\(s\) considered/);
    expect(logged.join("\n")).toMatch(/patched a\.hivemind\.md/);
  });
  it("wiki-refresh --local reports when the working tree touches nothing", async () => {
    runLocalWikiRefreshMock.mockResolvedValue({ outcomes: [] });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    await run(["wiki-refresh", "--local", "--cwd", dir]);
    expect(logged.join()).toMatch(/nothing touched by the working tree/);
  });
  it("wiki-refresh (real cycle) prints the cycle status and outcomes", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    await run(["wiki-refresh", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Wiki refresh: generated @ abcdef12/);
    expect(logged.join("\n")).toMatch(/created wiki\/x/);
  });
  it("wiki-refresh errors without a local graph", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    expect(await run(["wiki-refresh", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/No local graph/);
  });

  // --- sync: non-interactive + auto disabled short-circuits at zero LLM cost ---
  it("sync does nothing when auto is not enabled (non-interactive)", async () => {
    await run(["sync", "--cwd", dir]);
    expect(logged.join()).toMatch(/auto not enabled/);
  });

  // --- auto on/off ---
  it("auto rejects a bad mode", async () => {
    expect(await run(["auto", "bogus", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/Usage: hivemind docs auto/);
  });
  it("auto off records the opt-out", async () => {
    await run(["auto", "off", "--cwd", dir]);
    expect(logged.join()).toMatch(/Auto sync OFF/);
  });
  it("auto on refuses an empty corpus non-interactively", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]); // no wiki pages yet
    expect(await run(["auto", "on", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/enabling auto would generate/);
  });
  it("auto on (interactive) leaves off when the user declines the prompt", async () => {
    io.interactive = true; io.answer = "n";
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]); // empty corpus → prompt
    await run(["auto", "on", "--cwd", dir]);
    expect(logged.join()).toMatch(/Left OFF/);
  });
  it("auto on (interactive) enables when the user accepts the prompt", async () => {
    io.interactive = true; io.answer = "y";
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]); // empty corpus → prompt → yes
    await run(["auto", "on", "--cwd", dir]);
    expect(logged.join()).toMatch(/Auto sync ON/);
  });
  it("auto on enables when a wiki corpus already exists", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    const project = deriveProjectKey(dir).key;
    queryMock.mockResolvedValue([docRow({ doc_id: "wiki/x", project })]);
    await run(["auto", "on", "--cwd", dir]);
    expect(logged.join()).toMatch(/Auto sync ON/);
  });

  // --- pull writes docs to the working tree ---
  it("pull writes the project's docs locally", async () => {
    const project = deriveProjectKey(dir).key;
    queryMock.mockResolvedValue([docRow({ doc_id: "wiki/x", project, content: "# x\nbody" })]);
    await run(["pull", "--cwd", dir]);
    expect(logged.join()).toMatch(/Pulled \d+ doc\(s\)/); // a row was mocked → a write, not a no-op
  });

  // --- reindex backfills embeddings ---
  it("reindex reports how many docs were embedded", async () => {
    queryMock.mockResolvedValue([]); // no docs missing a vector
    await run(["reindex"]);
    expect(logged.join()).toMatch(/Reindexed/);
  });

  // --- wiki real run: below the min-group gate → skipped, no LLM ---
  it("wiki (real run) reports outcomes and skips a below-threshold group", async () => {
    writeFileSync(join(dir, "solo.ts"), "export const x = 1;\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [{ id: "solo.ts:x:function", label: "x", kind: "function", source_file: "solo.ts", source_location: "L1", language: "typescript", exported: true, source: "export const x = 1;\n" }],
      links: [],
    });
    queryMock.mockResolvedValue([]);
    await run(["wiki", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Wiki: created \d+, skipped \d+/);
  });

  // --- generate real run: single-batch stub generator creates one doc ---
  it("generate (real run, --batch 1) creates a doc via the stub generator", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "reader.ts"), "export function read() {\n  return 1;\n}\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [{ id: "src/reader.ts:read:function", label: "read", kind: "function", source_file: "src/reader.ts", source_location: "L1-L3", language: "typescript", exported: true }],
      links: [],
    });
    queryMock.mockResolvedValue([]);
    await run(["generate", "--batch", "1", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Generated \d+, skipped \d+/);
    const insert = queryMock.mock.calls.map((c) => c[0] as string).find((s) => /INSERT INTO "hivemind_docs"/.test(s));
    expect(insert).toBeDefined();
  });
  it("generate rejects an invalid --scope", async () => {
    expect(await run(["generate", "--scope", "bogus", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/Invalid --scope/);
  });
  it("generate errors without a local graph", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    expect(await run(["generate", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/No local graph/);
  });
  it("wiki errors without a local graph", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    expect(await run(["wiki", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/No local graph/);
  });

  // --- list header: sync freshness derived from refresh meta ---
  it("list header reports sync freshness from refresh meta", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    // readRefreshMeta reads the _meta row; its content carries last_refresh_sha.
    queryMock.mockResolvedValueOnce([{ content: JSON.stringify({ last_refresh_sha: "abc12345def" }), updated_at: "t" }]);
    queryMock.mockResolvedValue([]); // the row listing
    await run(["list", "--cwd", dir]);
    // Temp dir has no git → gitHeadOf null → "no git" freshness branch.
    expect(logged.join("\n")).toMatch(/sync: no git/);
  });

  it("list header shows in-sync and behind-HEAD freshness in a git repo", async () => {
    const g = (a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    g(["init", "-q"]); g(["config", "user.email", "t@t"]); g(["config", "user.name", "t"]);
    writeFileSync(join(dir, "f.ts"), "x\n"); g(["add", "."]); g(["commit", "-q", "-m", "init"]);
    const head = g(["rev-parse", "HEAD"]).trim();
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValueOnce([{ content: JSON.stringify({ last_refresh_sha: head }), updated_at: "t" }]);
    queryMock.mockResolvedValue([]);
    await run(["list", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/sync: in sync \(HEAD\)/);
    logged.length = 0;
    queryMock.mockResolvedValueOnce([{ content: JSON.stringify({ last_refresh_sha: "deadbeef0000" }), updated_at: "t" }]);
    queryMock.mockResolvedValue([]);
    await run(["list", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/sync: behind HEAD \(last: deadbeef\)/);
  });

  it("wiki (real run) creates a page for a group above the min gate", async () => {
    mkdirSync(join(dir, "pkg"));
    const nodes: any[] = [];
    for (const n of ["a", "b", "c"]) {
      writeFileSync(join(dir, "pkg", `${n}.ts`), "export const v = 1;\n".repeat(300));
      nodes.push({ id: `pkg/${n}.ts:${n}:function`, label: n, kind: "function", source_file: `pkg/${n}.ts`, source_location: "L1-L2", language: "typescript", exported: true });
    }
    loadCurrentSnapshotMock.mockReturnValue({ nodes, links: [] });
    queryMock.mockResolvedValue([]);
    await run(["wiki", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/created wiki\/pkg/);
  });

  it("generate (real run) prints a skipped outcome when a symbol can't be anchored", async () => {
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [{ id: "ghost.ts:g:function", label: "g", kind: "function", source_file: "ghost.ts", source_location: "L1-L3", language: "typescript", exported: true }],
      links: [],
    });
    queryMock.mockResolvedValue([]);
    await run(["generate", "--batch", "1", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/skipped ghost\.ts/);
  });

  it("index tolerates a missing table on the per-file content read", async () => {
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "a.ts" })]); // listDocMeta
    queryMock.mockRejectedValue(new Error('relation "hivemind_docs" does not exist')); // listDocsByIds
    await run(["index"]);
    expect(logged.join("\n")).toMatch(/a\.ts/);
  });

  it("list --all with an empty table prints the empty marker", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["list", "--all", "--cwd", dir]);
    expect(logged.join()).toMatch(/no docs with status=active/);
  });

  it("list --all groups rows under their registered repo name", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: "bigproj", path: "/x/bigrepo", auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValueOnce([]); // header meta read
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "wiki/p", project: "bigproj" })]);
    await run(["list", "--all", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/\/x\/bigrepo/);
  });

  it("list --project resolves a repo basename and a key prefix", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: "projABC123", path: "/x/openrepl", auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["list", "--project", "openrepl", "--cwd", dir]); // byPath
    await run(["list", "--project", "projABC", "--cwd", dir]);  // byPrefix
    // Both resolve without throwing and hit the scoped per-repo view.
    expect(logged.join()).toMatch(/no docs with status=active/);
  });

  // --- set --anchor error branches ---
  it("set --anchor errors when no graph is built", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    expect(await run(["set", "a.ts", "body", "--anchor", "a.ts:foo:function", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/--anchor needs a built graph/);
  });
  it("set --anchor errors when the source cannot be read", async () => {
    // Symbol is in the graph but its file is absent on disk → buildAnchor null.
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [fooNode], links: [] });
    expect(await run(["set", "f.ts", "body", "--anchor", "f.ts:foo:function", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/could not read source/);
  });
  it("set fails cleanly when --file points at a missing path", async () => {
    expect(await run(["set", "a.ts", "--file", join(dir, "nope.md"), "--project", "p"])).toBe(1);
    expect(erred.join()).toMatch(/Set failed/);
  });

  // --- reindex swallows a missing table ---
  it("reindex tolerates a missing docs table", async () => {
    queryMock.mockRejectedValue(new Error('relation "hivemind_docs" does not exist'));
    await run(["reindex"]);
    expect(logged.join()).toMatch(/no docs table yet/);
  });

  // --- missing-table tolerance across the read subcommands (the
  //     isMissingTableError TRUE arm of each catch) ---
  const MISSING = () => new Error('relation "hivemind_docs" does not exist');
  it("index tolerates a missing table", async () => {
    queryMock.mockRejectedValue(MISSING());
    await run(["index"]);
    expect(logged.length).toBeGreaterThan(0); // buildDocsIndex still printed
  });
  it("show tolerates a missing table", async () => {
    queryMock.mockRejectedValue(MISSING());
    await run(["show", "a.ts"]);
    expect(logged.join()).toMatch(/no doc for a\.ts/);
  });
  it("list tolerates a missing table", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockRejectedValue(MISSING());
    await run(["list", "--cwd", dir]);
    expect(logged.join()).toMatch(/no docs with status=active/);
  });
  it("refresh --dry-run tolerates a missing table", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockRejectedValue(MISSING());
    await run(["refresh", "--dry-run", "--cwd", dir]);
    expect(logged.join()).toMatch(/no docs need refreshing/);
  });
  it("wiki --dry-run tolerates a missing table", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockRejectedValue(MISSING());
    await run(["wiki", "--dry-run", "--cwd", dir]);
    expect(logged.join()).toMatch(/wiki page\(s\) would be generated/);
  });
  it("generate --dry-run tolerates a missing table", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockRejectedValue(MISSING());
    await run(["generate", "--dry-run", "--cwd", dir]);
    expect(logged.join()).toMatch(/target\(s\) would be documented/);
  });
  it("pull tolerates a missing table", async () => {
    queryMock.mockRejectedValue(MISSING());
    await run(["pull", "--cwd", dir]);
    expect(logged.join()).toMatch(/no docs table yet/);
  });

  it("list formats archived rows with a singular anchor label", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValueOnce([]); // header meta read
    queryMock.mockResolvedValueOnce([docRow({ doc_id: "a.ts", status: "archived", anchors: JSON.stringify([{ symbol_id: "a.ts:x:function", content_hash: "h" }]) })]);
    await run(["list", "--status", "all", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/\[archived\] a\.ts.*1 anchor\b/);
  });

  it("list --repos marks an auto-off repo", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: "p1", path: "/x/offrepo", auto: false });
    await run(["list", "--repos"]);
    expect(logged.join("\n")).toMatch(/off  \/x\/offrepo/);
  });

  it("set accepts the --flag=value form", async () => {
    await run(["set", "a.ts", "body", "--project=pv", "--tier=slow"]);
    const insert = queryMock.mock.calls.map((c) => c[0] as string).find((s) => /INSERT INTO "hivemind_docs"/.test(s));
    expect(insert).toBeDefined();
    expect(insert!).toMatch(/'slow'/);
  });

  it("wiki --dry-run honors --force and --limit", async () => {
    mkdirSync(join(dir, "one")); mkdirSync(join(dir, "two"));
    writeFileSync(join(dir, "one", "a.ts"), "x\n"); writeFileSync(join(dir, "two", "b.ts"), "y\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [
        { id: "one/a.ts:a:function", label: "a", kind: "function", source_file: "one/a.ts", source_location: "L1", language: "typescript", exported: true },
        { id: "two/b.ts:b:function", label: "b", kind: "function", source_file: "two/b.ts", source_location: "L1", language: "typescript", exported: true },
      ],
      links: [],
    });
    // Both pages already exist; --force re-plans them, --limit caps to 1.
    queryMock.mockResolvedValue([docRow({ doc_id: "wiki/one" }), docRow({ doc_id: "wiki/two" })]);
    await run(["wiki", "--dry-run", "--force", "--limit", "1", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/1 wiki page\(s\) would be generated/);
  });

  it("generate --dry-run honors --force and --limit", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "a.ts"), "x\n"); writeFileSync(join(dir, "src", "b.ts"), "y\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [
        { id: "src/a.ts:a:function", label: "a", kind: "function", source_file: "src/a.ts", source_location: "L1", language: "typescript", exported: true },
        { id: "src/b.ts:b:function", label: "b", kind: "function", source_file: "src/b.ts", source_location: "L1", language: "typescript", exported: true },
      ],
      links: [],
    });
    queryMock.mockResolvedValue([docRow({ doc_id: "src/a.ts" }), docRow({ doc_id: "src/b.ts" })]);
    await run(["generate", "--dry-run", "--force", "--limit", "1", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/1 target\(s\) would be documented/);
  });

  it("generate --scope symbol documents individual symbols", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "reader.ts"), "export function read() {\n  return 1;\n}\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [{ id: "src/reader.ts:read:function", label: "read", kind: "function", source_file: "src/reader.ts", source_location: "L1-L3", language: "typescript", exported: true }],
      links: [],
    });
    queryMock.mockResolvedValue([]);
    await run(["generate", "--scope", "symbol", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Generated \d+/);
  });

  it("generate (default batching) falls back to single when the batch is empty", async () => {
    // Default batchSize (5) uses batchGenerate, mocked to return an empty Map →
    // every file falls back to the single-file generator (stub) and is created.
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "reader.ts"), "export function read() {\n  return 1;\n}\n");
    loadCurrentSnapshotMock.mockReturnValue({
      nodes: [{ id: "src/reader.ts:read:function", label: "read", kind: "function", source_file: "src/reader.ts", source_location: "L1-L3", language: "typescript", exported: true }],
      links: [],
    });
    queryMock.mockResolvedValue([]);
    await run(["generate", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/Generated \d+/);
  });

  it("list rejects a non-positive --limit", async () => {
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    expect(await run(["list", "--limit", "0", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/Invalid --limit/);
  });
  it("pull --force overwrites local docs", async () => {
    const project = deriveProjectKey(dir).key;
    queryMock.mockResolvedValue([docRow({ doc_id: "wiki/x", project, content: "# x\nbody" })]);
    await run(["pull", "--force", "--cwd", dir]);
    expect(logged.join()).toMatch(/Pulled \d+ doc\(s\)/); // a row was mocked → a write, not a no-op
  });
  it("sync --force passes force through to the wiki cycle", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: deriveProjectKey(dir).key, path: dir, auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["sync", "--force", "--cwd", dir]);
    expect(runWikiRefreshCycleMock).toHaveBeenCalledTimes(1);
    expect(runWikiRefreshCycleMock.mock.calls[0][0]).toMatchObject({ force: true });
  });
  it("auto on describes the full corpus when no graph is present (non-interactive)", async () => {
    loadCurrentSnapshotMock.mockReturnValue(null);
    queryMock.mockResolvedValue([]);
    expect(await run(["auto", "on", "--cwd", dir])).toBe(1);
    expect(erred.join()).toMatch(/the full corpus/);
  });

  // A NON-missing-table error must propagate (the FALSE arm — `throw err`).
  it("show rethrows a non-missing-table error", async () => {
    queryMock.mockRejectedValue(new Error("boom: connection reset"));
    await expect(run(["show", "a.ts"])).rejects.toThrow(/boom/);
  });

  // --- sync --local recurses into the working-tree wiki preview ---
  it("sync --local runs the local preview when auto is enabled", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: deriveProjectKey(dir).key, path: dir, auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["sync", "--local", "--cwd", dir]);
    expect(logged.join()).toMatch(/Local wiki preview/);
  });
  it("sync (interactive, empty corpus) stops when onboarding declines", async () => {
    io.interactive = true; io.generate = false;
    setAuto({ orgId: "org", orgName: "OrgName", project: deriveProjectKey(dir).key, path: dir, auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]); // 0 wiki pages → onboarding runs
    await run(["sync", "--cwd", dir]);
    // Declined → no wiki cycle spend.
    expect(runWikiRefreshCycleMock).not.toHaveBeenCalled();
  });
  it("sync (interactive, empty corpus) proceeds when onboarding consents", async () => {
    io.interactive = true; io.generate = true;
    setAuto({ orgId: "org", orgName: "OrgName", project: deriveProjectKey(dir).key, path: dir, auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["sync", "--cwd", dir]);
    expect(runWikiRefreshCycleMock).toHaveBeenCalledTimes(1);
  });
  it("sync (full) runs the wiki cycle then the per-file refresh", async () => {
    setAuto({ orgId: "org", orgName: "OrgName", project: deriveProjectKey(dir).key, path: dir, auto: true });
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    queryMock.mockResolvedValue([]);
    await run(["sync", "--cwd", dir]);
    // Recurses into wiki-refresh (mocked cycle) + refresh --full (real, empty).
    expect(runWikiRefreshCycleMock).toHaveBeenCalledTimes(1);
    expect(logged.join("\n")).toMatch(/Wiki refresh: generated/);
  });

  // --- pull with an empty corpus reports "up to date" ---
  it("pull reports up-to-date when nothing changes", async () => {
    queryMock.mockResolvedValue([]);
    await run(["pull", "--cwd", dir]);
    expect(logged.join()).toMatch(/up to date/);
  });

  // --- refresh over a real git diff: refresh changed + generate added ---
  it("refresh over a git diff refreshes a changed doc and generates an added one", async () => {
    const g = (a: string[]) => execFileSync("git", ["-C", dir, ...a], { stdio: ["ignore", "pipe", "ignore"] });
    g(["init", "-q"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    writeFileSync(join(dir, "f.ts"), "export function foo() {\n  return 1;\n}\n");
    g(["add", "."]);
    g(["commit", "-q", "-m", "init"]);
    // f.ts modified (shows in `git diff HEAD`); g.ts brand-new (untracked).
    writeFileSync(join(dir, "f.ts"), "export function foo() {\n  return 2;\n}\n");
    writeFileSync(join(dir, "g.ts"), "export function bar() {\n  return 3;\n}\n");
    const barNode = { id: "g.ts:bar:function", label: "bar", kind: "function", source_file: "g.ts", source_location: "L1-L3", language: "typescript", exported: true };
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [fooNode, barNode], links: [] });
    const stale = JSON.stringify([{ symbol_id: "f.ts:foo:function", content_hash: "stale000" }]);
    queryMock.mockResolvedValue([docRow({ doc_id: "f.ts", anchors: stale })]);
    await run(["refresh", "--cwd", dir]);
    const out = logged.join("\n");
    expect(out).toMatch(/Refreshed \d+/);
    // Self-complete: the added file with no doc gets one generated.
    expect(out).toMatch(/Generated \d+ new doc\(s\) for added files|created g\.ts/);
  });

  // --- refresh real run: a doc whose anchored symbol vanished is archived ---
  it("refresh archives a doc whose anchored symbol is gone", async () => {
    writeFileSync(join(dir, "f.ts"), "export function foo() {\n  return 1;\n}\n");
    // Graph no longer contains f.ts:foo:function → the anchored doc is orphaned.
    loadCurrentSnapshotMock.mockReturnValue({ nodes: [], links: [] });
    const anchors = JSON.stringify([{ symbol_id: "f.ts:foo:function", content_hash: "abc" }]);
    queryMock.mockResolvedValue([docRow({ doc_id: "f.ts", anchors })]);
    await run(["refresh", "--cwd", dir]);
    expect(logged.join("\n")).toMatch(/archived|Refreshed \d+, archived \d+/);
  });
});
