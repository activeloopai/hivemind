import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Branch coverage for DeeplakeFs's graph VFS bridge (the new code added in
 * the codebase-graph PR). The handler dispatches through handleGraphVfs
 * which has many internal branches; the bridge in DeeplakeFs has ~12
 * decision points (isGraphPath / isGraphDir / dispatcher result kinds) per
 * method (readFile / exists / stat / realpath / readdir /
 * readdirWithFileTypes). Each test below targets one bridge branch.
 *
 * The DeeplakeFs class needs a DeeplakeApi at construction. We can't easily
 * construct one without a real Deeplake backend, so these tests exercise
 * the graph-bridge code via direct calls to the FS methods on a stub
 * subclass that bypasses the SQL bootstrap.
 */
describe("DeeplakeFs graph bridge — branch coverage", () => {
  let cwd: string;
  let baseDir: string;
  let snapshotsDir: string;
  let prevCwd: string;

  beforeEach(async () => {
    cwd = mkdtempSync(join(tmpdir(), "fs-graph-branch-"));
    prevCwd = process.cwd();
    process.chdir(cwd);
    const { deriveProjectKey } = await import("../../../src/utils/repo-identity.js");
    const { repoDir } = await import("../../../src/graph/snapshot.js");
    const { key } = deriveProjectKey(cwd);
    baseDir = repoDir(key);
    snapshotsDir = join(baseDir, "snapshots");
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });
  afterEach(() => {
    process.chdir(prevCwd);
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  async function makeStubFs(): Promise<{ fs: { readFile: (p: string) => Promise<string>; exists: (p: string) => Promise<boolean>; stat: (p: string) => Promise<{ isFile: boolean; isDirectory: boolean }>; realpath: (p: string) => Promise<string>; readdir: (p: string) => Promise<string[]>; readdirWithFileTypes: (p: string) => Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean }>> } }> {
    // Construct a DeeplakeFs by skipping its SQL bootstrap. We reach in
    // via DeeplakeFs.create with a mocked client; for our tests we ONLY
    // care about the graph-bridge paths, which don't consult the API.
    const { DeeplakeFs } = await import("../../../src/shell/deeplake-fs.js");
    // Minimal API stub: every method DeeplakeFs.create calls is a no-op
    // that returns the empty case. The graph-bridge code paths don't
    // touch the API at all, so this lets us test them in isolation.
    const fakeApi = {
      ensureTable: vi.fn(async () => {}),
      ensureSessionsTable: vi.fn(async () => {}),
      ensureSkillsTable: vi.fn(async () => {}),
      query: vi.fn(async () => []),
      listTables: vi.fn(async () => ["memory"]),
      healSchema: vi.fn(async () => {}),
    } as unknown as import("../../../src/deeplake-api.js").DeeplakeApi;
    const fs = await DeeplakeFs.create(fakeApi, "memory", undefined);
    return { fs };
  }

  function seedWorktreeSnapshot(): void {
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const wt = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16);
    mkdirSync(snapshotsDir, { recursive: true });
    const commit = "c".repeat(40);
    const snap = {
      directed: true, multigraph: true,
      graph: { schema_version: 1, generator: "hivemind-graph", commit_sha: commit, repo_key: "k" },
      observation: { ts: "2026-01-01T00:00:00Z", branch: "main", worktree_path: cwd, repo_project: "p", generator_version: "0", source_files_extracted: 1, source_files_skipped: 0 },
      nodes: [{ id: "f.ts:foo:function", label: "foo", kind: "function", source_file: "f.ts", source_location: "L1", language: "typescript", exported: true }],
      links: [],
    };
    writeFileSync(join(snapshotsDir, `${commit}.json`), JSON.stringify(snap));
    const wtDir = join(baseDir, "worktrees", wt);
    mkdirSync(wtDir, { recursive: true });
    writeFileSync(join(wtDir, ".last-build.json"), JSON.stringify({
      ts: Date.now(), commit_sha: commit, snapshot_sha256: "f".repeat(64),
      node_count: 1, edge_count: 0,
    }));
  }

  it("exists('/graph') → always true (synthesized dir)", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph")).toBe(true);
  });

  it("exists('/graph/find') → always true (synthesized dir)", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph/find")).toBe(true);
  });

  it("exists('/graph/show') → always true (synthesized dir)", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph/show")).toBe(true);
  });

  it("exists('/graph/index.md') with no graph → still true (no-graph payload IS the file body)", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph/index.md")).toBe(true);
  });

  it("exists('/graph/index.md') with seeded graph → true", async () => {
    seedWorktreeSnapshot();
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph/index.md")).toBe(true);
  });

  it("exists('/graph/find/pattern') with seeded graph → true", async () => {
    seedWorktreeSnapshot();
    const { fs } = await makeStubFs();
    expect(await fs.exists("/graph/find/foo")).toBe(true);
  });

  it("stat('/graph') → isDirectory:true", async () => {
    const { fs } = await makeStubFs();
    const s = await fs.stat("/graph");
    expect(s.isDirectory).toBe(true);
    expect(s.isFile).toBe(false);
  });

  it("stat('/graph/index.md') → isFile:true", async () => {
    const { fs } = await makeStubFs();
    const s = await fs.stat("/graph/index.md");
    expect(s.isFile).toBe(true);
    expect(s.isDirectory).toBe(false);
  });

  it("stat('/graph/find') → isDirectory:true (find is a subdir)", async () => {
    const { fs } = await makeStubFs();
    const s = await fs.stat("/graph/find");
    expect(s.isDirectory).toBe(true);
  });

  it("realpath('/graph') → returns same path", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.realpath("/graph")).toBe("/graph");
  });

  it("realpath('/graph/index.md') → returns same path", async () => {
    const { fs } = await makeStubFs();
    expect(await fs.realpath("/graph/index.md")).toBe("/graph/index.md");
  });

  it("readdir('/') includes 'graph' alongside index.md", async () => {
    const { fs } = await makeStubFs();
    const entries = await fs.readdir("/");
    expect(entries).toContain("graph");
  });

  it("readdir('/graph') → ['index.md', 'find', 'show']", async () => {
    const { fs } = await makeStubFs();
    const entries = await fs.readdir("/graph");
    expect(entries.sort()).toEqual(["find", "index.md", "show"]);
  });

  it("readdir('/graph/find') → empty (children are user patterns)", async () => {
    const { fs } = await makeStubFs();
    const entries = await fs.readdir("/graph/find");
    expect(entries).toEqual([]);
  });

  it("readdir('/graph/show') → empty (children are handles/patterns)", async () => {
    const { fs } = await makeStubFs();
    const entries = await fs.readdir("/graph/show");
    expect(entries).toEqual([]);
  });

  it("readdirWithFileTypes('/graph') → dirents classified correctly", async () => {
    const { fs } = await makeStubFs();
    const dirents = await fs.readdirWithFileTypes("/graph");
    const find = dirents.find((d) => d.name === "find");
    const show = dirents.find((d) => d.name === "show");
    const idx = dirents.find((d) => d.name === "index.md");
    expect(find?.isDirectory).toBe(true);
    expect(show?.isDirectory).toBe(true);
    expect(idx?.isFile).toBe(true);
  });

  it("readFile('/graph/index.md') with no graph returns the '(no-graph)' body (NOT throw)", async () => {
    const { fs } = await makeStubFs();
    const body = await fs.readFile("/graph/index.md");
    expect(body).toContain("(no-graph)");
  });

  it("readFile('/graph') (the dir itself) → EISDIR", async () => {
    const { fs } = await makeStubFs();
    await expect(fs.readFile("/graph")).rejects.toThrow(/EISDIR/);
  });

  it("readFile('/graph/index.md') with seeded snapshot returns real overview", async () => {
    seedWorktreeSnapshot();
    const { fs } = await makeStubFs();
    const body = await fs.readFile("/graph/index.md");
    expect(body).toContain("Nodes:");
    expect(body).toContain("Code Graph");
  });
});
