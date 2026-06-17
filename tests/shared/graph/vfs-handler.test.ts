import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleGraphVfs } from "../../../src/graph/vfs-handler.js";
import { writeLastBuild } from "../../../src/graph/last-build.js";
import { repoDir } from "../../../src/graph/snapshot.js";
import { deriveProjectKey } from "../../../src/utils/repo-identity.js";
import type { GraphSnapshot } from "../../../src/graph/types.js";

function worktreeIdFromCwd(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function makeSnapshot(commit: string = "deadbeef"): GraphSnapshot {
  return {
    directed: true,
    multigraph: true,
    graph: { schema_version: 1, generator: "hivemind-graph", commit_sha: commit, repo_key: "k" },
    observation: {
      ts: "2026-05-21T00:00:00Z",
      branch: "main",
      worktree_path: "/test",
      repo_project: "test-repo",
      generator_version: "0.0.0",
      source_files_extracted: 2,
      source_files_skipped: 0,
    },
    nodes: [
      { id: "src/a.ts:foo:function", label: "foo", kind: "function", source_file: "src/a.ts", source_location: "L10", language: "typescript", exported: true },
      { id: "src/a.ts:bar:function", label: "bar", kind: "function", source_file: "src/a.ts", source_location: "L20", language: "typescript", exported: false },
      { id: "src/b.ts:fooHelper:function", label: "fooHelper", kind: "function", source_file: "src/b.ts", source_location: "L5", language: "typescript", exported: true },
      { id: "src/b.ts:UserModel:class", label: "UserModel", kind: "class", source_file: "src/b.ts", source_location: "L30", language: "typescript", exported: true },
    ],
    links: [
      { source: "src/a.ts:foo:function", target: "src/a.ts:bar:function", relation: "calls", confidence: "EXTRACTED" },
      { source: "src/a.ts:foo:function", target: "src/b.ts", relation: "imports", confidence: "EXTRACTED" },
      { source: "src/b.ts:fooHelper:function", target: "src/b.ts:UserModel:class", relation: "calls", confidence: "EXTRACTED" },
    ],
  };
}

describe("handleGraphVfs", () => {
  let cwd: string;
  let baseDir: string;
  let snapshotsDir: string;
  let wt: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "vfs-cwd-"));
    const { key } = deriveProjectKey(cwd);
    baseDir = repoDir(key);
    snapshotsDir = join(baseDir, "snapshots");
    wt = worktreeIdFromCwd(cwd);
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });
  afterEach(() => {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
    try { rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  /** Seed local state so handleGraphVfs can find a snapshot to read. */
  function seed(commit: string = "deadbeef"): void {
    mkdirSync(snapshotsDir, { recursive: true });
    const snap = makeSnapshot(commit);
    writeFileSync(join(snapshotsDir, `${commit}.json`), JSON.stringify(snap));
    writeLastBuild(baseDir, {
      ts: Date.now(),
      commit_sha: commit,
      snapshot_sha256: "a".repeat(64),
      node_count: snap.nodes.length,
      edge_count: snap.links.length,
    }, wt);
  }

  // ── no-graph paths ───────────────────────────────────────────────────

  it("returns no-graph when no local build exists", () => {
    const r = handleGraphVfs("index.md", cwd);
    expect(r.kind).toBe("no-graph");
    if (r.kind === "no-graph") expect(r.message).toContain("hivemind graph");
  });

  it("returns no-graph when last-build points at a missing snapshot file", () => {
    mkdirSync(snapshotsDir, { recursive: true });
    writeLastBuild(baseDir, {
      ts: Date.now(),
      commit_sha: "deadbeef",
      snapshot_sha256: "b".repeat(64),
      node_count: 1, edge_count: 0,
    }, wt);
    // snapshots/ghost.json doesn't exist
    const r = handleGraphVfs("index.md", cwd);
    expect(r.kind).toBe("no-graph");
  });

  it("returns no-graph on corrupt snapshot JSON", () => {
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(join(snapshotsDir, "c0ffee.json"), "{ not valid");
    writeLastBuild(baseDir, {
      ts: Date.now(), commit_sha: "c0ffee",
      snapshot_sha256: "c".repeat(64), node_count: 0, edge_count: 0,
    }, wt);
    const r = handleGraphVfs("index.md", cwd);
    expect(r.kind).toBe("no-graph");
    if (r.kind === "no-graph") expect(r.message).toContain("Failed to parse snapshot");
  });

  // ── index.md ─────────────────────────────────────────────────────────

  it("index.md renders commit, counts, kind breakdown, top files", () => {
    seed("abc1234");
    const r = handleGraphVfs("index.md", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("abc1234");
      expect(r.body).toContain("Nodes:   4");
      expect(r.body).toContain("Edges: 3");
      expect(r.body).toContain("function     3");
      expect(r.body).toContain("class        1");
      expect(r.body).toContain("calls        2");
      expect(r.body).toContain("imports      1");
      // top files: src/a.ts has 2 nodes, src/b.ts has 2
      expect(r.body).toMatch(/2\s+src\/a\.ts/);
      expect(r.body).toMatch(/2\s+src\/b\.ts/);
      // Limitations now reflect cross-file resolution + multi-language (live-test fix):
      // no longer claims "intra-file only" or "TypeScript only".
      expect(r.body).not.toContain("intra-file only");
      expect(r.body).toContain("Cross-file");
      expect(r.body).toContain("TypeScript / JavaScript / Python");
    }
  });

  it("index.md works under the 'index' alias (without .md)", () => {
    seed();
    const r = handleGraphVfs("index", cwd);
    expect(r.kind).toBe("ok");
  });

  // ── find ─────────────────────────────────────────────────────────────

  it("find/<pattern> emits numbered handles, ranked", () => {
    seed();
    const r = handleGraphVfs("find/foo", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // 'foo' should match: src/a.ts:foo:function (label exact) and
      // src/b.ts:fooHelper:function (label starts with foo).
      expect(r.body).toContain("[1]");
      expect(r.body).toContain("src/a.ts:foo:function");
      expect(r.body).toContain("fooHelper");
      // Rank: exact label match first
      const idx1 = r.body.indexOf("[1]");
      const idx2 = r.body.indexOf("[2]");
      expect(idx1).toBeLessThan(idx2);
      const between = r.body.slice(idx1, idx2);
      expect(between).toContain("src/a.ts:foo:function");
    }
  });

  it("find multi-token (D1) ANDs the tokens: foo+helper matches only fooHelper", () => {
    seed();
    const r = handleGraphVfs("find/foo+helper", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // fooHelper's id contains both "foo" and "helper".
      expect(r.body).toContain("src/b.ts:fooHelper:function");
      // plain foo (src/a.ts:foo) lacks "helper" → excluded.
      expect(r.body).not.toContain("src/a.ts:foo:function");
      expect(r.body).toContain("1 match");
    }
  });

  it("find multi-token tolerates whitespace separator too", () => {
    seed();
    const r = handleGraphVfs("find/foo helper", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("src/b.ts:fooHelper:function");
  });

  it("find fuzzy fallback (D3): a typo with no substring hit suggests the close symbol", () => {
    seed();
    // "usermdel" is not a substring of any node, but it's edit-distance 1 from
    // "usermodel" (UserModel lowercased) → fuzzy fallback surfaces it.
    const r = handleGraphVfs("find/usermdel", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("src/b.ts:UserModel:class");
  });

  it("find fuzzy does NOT trigger when an exact substring match exists", () => {
    seed();
    // 'foo' has substring hits (foo, fooHelper); fuzzy must not add unrelated nodes.
    const r = handleGraphVfs("find/foo", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).not.toContain("UserModel");
  });

  it("find on a pattern with no substring and no near match → No matches", () => {
    seed();
    const r = handleGraphVfs("find/zzqqxx", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("No matches");
  });

  it("find on empty pattern → not-found with guidance", () => {
    seed();
    const r = handleGraphVfs("find/", cwd);
    expect(r.kind).toBe("not-found");
  });

  it("find with zero matches → graceful empty message", () => {
    seed();
    const r = handleGraphVfs("find/nonsense-xyz-unicorn", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("No matches");
      expect(r.body).toContain("4 nodes");
    }
  });

  it("find is case-insensitive", () => {
    seed();
    const r = handleGraphVfs("find/FOO", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("src/a.ts:foo:function");
  });

  // ── show ─────────────────────────────────────────────────────────────

  it("show/<digit> resolves a handle from the most recent find", () => {
    seed();
    handleGraphVfs("find/foo", cwd); // populates handle map
    const r = handleGraphVfs("show/1", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // Handle 1 is the exact-label match: src/a.ts:foo:function
      expect(r.body).toContain("Node: src/a.ts:foo:function");
      expect(r.body).toContain("kind:   function");
      expect(r.body).toContain("exported");
      // Outgoing: 1 calls edge to bar + 1 imports edge to src/b.ts
      expect(r.body).toContain("calls");
      expect(r.body).toContain("src/a.ts:bar:function");
      expect(r.body).toContain("imports");
      expect(r.body).toContain("src/b.ts");
    }
  });

  it("show/<digit> without a prior find → helpful error", () => {
    seed();
    const r = handleGraphVfs("show/1", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("no recent find/");
  });

  it("show/<digit> out of range → helpful error mentioning the last find", () => {
    seed();
    handleGraphVfs("find/foo", cwd);
    const r = handleGraphVfs("show/99", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("out of range");
      expect(r.body).toContain('find/foo');
    }
  });

  it("show/<unique pattern> goes directly to node detail (no need for find)", () => {
    seed();
    const r = handleGraphVfs("show/UserModel", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("Node: src/b.ts:UserModel:class");
      expect(r.body).toContain("kind:   class");
    }
  });

  it("show/<ambiguous pattern> returns candidate list, NOT a node", () => {
    seed();
    // 'foo' matches both src/a.ts:foo and src/b.ts:fooHelper
    const r = handleGraphVfs("show/foo", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain('"foo" matches 2 nodes');
      expect(r.body).toContain("[1]");
      expect(r.body).toContain("[2]");
      // NOT a node-detail format
      expect(r.body).not.toContain("Node:");
    }
  });

  it("show/<no-match> → graceful suggestion", () => {
    seed();
    const r = handleGraphVfs("show/nonsense", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("No node matches");
  });

  it("node detail surfaces the not-proof-of-dead-code caveat when incoming=0", () => {
    // fooHelper has no incoming edges in this fixture. Cross-file resolution is
    // partial (bare/aliased/dynamic imports stay unresolved), so "Incoming (0)"
    // is not proof of dead code — that's the caveat we surface to the agent.
    seed();
    const r = handleGraphVfs("show/fooHelper", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("Incoming (0)");
      expect(r.body).toContain("not proof of dead code");
    }
  });

  // ── handle persistence ───────────────────────────────────────────────

  it("a fresh find/ overwrites the handle map (last find wins)", () => {
    seed();
    handleGraphVfs("find/foo", cwd);      // handles for 'foo'
    handleGraphVfs("find/User", cwd);     // overwrites with handles for 'User'
    const r = handleGraphVfs("show/1", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // Handle 1 should now be UserModel (from second find), not foo
      expect(r.body).toContain("UserModel");
      expect(r.body).not.toContain("Node: src/a.ts:foo:function");
    }
  });

  // ── unknown endpoint ─────────────────────────────────────────────────

  it("unknown endpoint returns not-found with a clue", () => {
    const r = handleGraphVfs("callers/foo", cwd);
    expect(r.kind).toBe("not-found");
    if (r.kind === "not-found") expect(r.message).toContain("Available");
  });

  it("empty subpath returns a directory listing", () => {
    const r = handleGraphVfs("", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("index.md");
      expect(r.body).toContain("find/");
      expect(r.body).toContain("show/");
      // M-render endpoints advertised in the listing
      expect(r.body).toContain("query/");
      expect(r.body).toContain("neighborhood/");
      expect(r.body).toContain("layers");
      expect(r.body).toContain("tour");
      expect(r.body).toContain("path/");
    }
  });

  // ── query/ one-shot (C1) ──────────────────────────────────────────────

  it("query/<pattern> expands top matches with 1-hop neighbors", () => {
    seed();
    const r = handleGraphVfs("query/foo", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain('Query "foo"');
      expect(r.body).toContain("src/a.ts:foo:function");
      // foo calls bar in the fixture → an OUT calls hop is shown
      expect(r.body).toMatch(/--calls-->/);
    }
  });

  it("query/ with no pattern → not-found", () => {
    const r = handleGraphVfs("query/", cwd);
    expect(r.kind).toBe("not-found");
  });

  it("query/ dedups repeated neighbors with a ×N count (not listed N times)", () => {
    // Seed a snapshot where foo calls bar THREE times (multigraph).
    mkdirSync(snapshotsDir, { recursive: true });
    const snap = makeSnapshot("cafe1234");
    snap.links = [
      { source: "src/a.ts:foo:function", target: "src/a.ts:bar:function", relation: "calls", confidence: "EXTRACTED", ord: 0 },
      { source: "src/a.ts:foo:function", target: "src/a.ts:bar:function", relation: "calls", confidence: "EXTRACTED", ord: 1 },
      { source: "src/a.ts:foo:function", target: "src/a.ts:bar:function", relation: "calls", confidence: "EXTRACTED", ord: 2 },
    ];
    writeFileSync(join(snapshotsDir, "cafe1234.json"), JSON.stringify(snap));
    writeLastBuild(baseDir, { ts: Date.now(), commit_sha: "cafe1234", snapshot_sha256: "9".repeat(64), node_count: snap.nodes.length, edge_count: 3 }, wt);
    const r = handleGraphVfs("query/foo", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("src/a.ts:bar:function ×3");
      // not listed three separate times
      expect((r.body.match(/src\/a\.ts:bar:function/g) ?? []).length).toBe(1);
    }
  });

  it("query/ saves handles so a follow-up show/<N> resolves", () => {
    seed();
    handleGraphVfs("query/foo", cwd);
    const r = handleGraphVfs("show/1", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("Node:");
  });

  it("query/ on no match returns a friendly message", () => {
    seed();
    const r = handleGraphVfs("query/zzznomatch", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("No matches");
  });

  // ── impact/ blast radius (B5) ─────────────────────────────────────────

  it("impact/<pattern> lists dependents (foo calls bar → bar's impact includes foo)", () => {
    seed();
    const r = handleGraphVfs("impact/bar", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("Impact of src/a.ts:bar:function");
      expect(r.body).toContain("src/a.ts:foo:function"); // foo depends on bar
    }
  });

  it("impact/ with no pattern → not-found", () => {
    const r = handleGraphVfs("impact/", cwd);
    expect(r.kind).toBe("not-found");
  });

  it("impact/ on a symbol nothing depends on reports zero dependents", () => {
    seed();
    // "a.ts:foo:" uniquely matches src/a.ts:foo:function (not fooHelper); nothing calls foo.
    const r = handleGraphVfs("impact/a.ts:foo:", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).toContain("No resolved dependents");
  });

  // ── render endpoints (team graph-render) ──────────────────────────────
  // These prove the dispatcher routes the new subpaths to the render
  // modules; the modules' own logic is covered by their unit tests.

  it("neighborhood/<file> renders symbols + cross-file neighbors", () => {
    seed();
    const r = handleGraphVfs("neighborhood/src/a.ts", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("Symbols in src/a.ts");
      expect(r.body).toContain("foo");
    }
  });

  it("neighborhood/ with no file → not-found", () => {
    const r = handleGraphVfs("neighborhood/", cwd);
    expect(r.kind).toBe("not-found");
  });

  it("layers renders the architectural grouping", () => {
    seed();
    const r = handleGraphVfs("layers", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body.toLowerCase()).toContain("layer");
  });

  it("tour renders a dependency-ordered walkthrough", () => {
    seed();
    const r = handleGraphVfs("tour", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body.toLowerCase()).toContain("tour");
  });

  it("path/<from>/<to> renders a path or a clear no-path/ambiguous message", () => {
    seed();
    const r = handleGraphVfs("path/foo/UserModel", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(typeof r.body).toBe("string");
  });

  it("path/ with a single pattern → not-found guidance", () => {
    const r = handleGraphVfs("path/onlyone", cwd);
    expect(r.kind).toBe("not-found");
    if (r.kind === "not-found") expect(r.message).toContain("two patterns");
  });

  // ── codex review regressions on the render modules ────────────────────

  it("tour: an exported node whose only incoming edge is from an UNRESOLVED source stays an entry point", () => {
    // Seed a custom snapshot: src/a.ts:foo is exported, its only incoming edge
    // comes from an id NOT in nodes[] (an external/unresolved caller).
    mkdirSync(snapshotsDir, { recursive: true });
    const snap = makeSnapshot("babe1234");
    snap.links = [{ source: "external:ghost:function", target: "src/a.ts:foo:function", relation: "calls", confidence: "EXTRACTED" }];
    writeFileSync(join(snapshotsDir, "babe1234.json"), JSON.stringify(snap));
    writeLastBuild(baseDir, { ts: Date.now(), commit_sha: "babe1234", snapshot_sha256: "e".repeat(64), node_count: snap.nodes.length, edge_count: 1 }, wt);
    const r = handleGraphVfs("tour", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // foo must appear under Entry points, not be suppressed by the phantom caller.
      const entrySection = r.body.split("## Walkthrough")[0]!;
      expect(entrySection).toContain("src/a.ts:foo:function");
    }
  });

  it("neighborhood: an edge to an UNRESOLVED target is not reported as a cross-file neighbor", () => {
    mkdirSync(snapshotsDir, { recursive: true });
    const snap = makeSnapshot("face1234");
    // foo (in src/a.ts) imports an unresolved id — must NOT show as Outgoing cross-file.
    snap.links = [{ source: "src/a.ts:foo:function", target: "external:lodash:module", relation: "imports", confidence: "EXTRACTED" }];
    writeFileSync(join(snapshotsDir, "face1234.json"), JSON.stringify(snap));
    writeLastBuild(baseDir, { ts: Date.now(), commit_sha: "face1234", snapshot_sha256: "f".repeat(64), node_count: snap.nodes.length, edge_count: 1 }, wt);
    const r = handleGraphVfs("neighborhood/src/a.ts", cwd);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).not.toContain("external:lodash:module");
      expect(r.body).toContain("Outgoing: (none)");
    }
  });
});
