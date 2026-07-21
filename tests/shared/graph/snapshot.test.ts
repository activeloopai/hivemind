import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildSnapshot,
  canonicalSnapshot,
  computeSnapshotSha256,
  graphsRoot,
  repoDir,
  writeSnapshot,
} from "../../../src/graph/snapshot.js";
import type {
  FileExtraction,
  GraphEdge,
  GraphMetadata,
  GraphNode,
  GraphObservation,
  GraphSnapshot,
} from "../../../src/graph/types.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeMetadata(overrides: Partial<GraphMetadata> = {}): GraphMetadata {
  return {
    schema_version: 1,
    generator: "hivemind-graph",
    commit_sha: "abc123",
    repo_key: "test-repo-key",
    ...overrides,
  };
}

function makeObservation(overrides: Partial<GraphObservation> = {}): GraphObservation {
  return {
    ts: "2026-05-20T00:00:00Z",
    branch: "main",
    worktree_path: "/test/path",
    repo_project: "test-repo",
    generator_version: "0.0.0-test",
    source_files_extracted: 0,
    source_files_skipped: 0,
    ...overrides,
  };
}

function makeExtraction(
  sourceFile: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): FileExtraction {
  return {
    source_file: sourceFile,
    language: "typescript",
    nodes,
    edges,
    parse_errors: [],
  };
}

function makeNode(id: string, kind: GraphNode["kind"] = "function"): GraphNode {
  return {
    id,
    label: id.split(":")[1] ?? id,
    kind,
    source_file: id.split(":")[0] ?? "",
    source_location: "L1",
    language: "typescript",
    exported: false,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("graphsRoot / repoDir", () => {
  it("graphsRoot honors HIVEMIND_GRAPHS_HOME", () => {
    const prev = process.env.HIVEMIND_GRAPHS_HOME;
    process.env.HIVEMIND_GRAPHS_HOME = "/x/y/z";
    try {
      expect(graphsRoot()).toBe("/x/y/z");
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
      else process.env.HIVEMIND_GRAPHS_HOME = prev;
    }
  });

  it("repoDir composes graphsRoot + repoKey", () => {
    const prev = process.env.HIVEMIND_GRAPHS_HOME;
    process.env.HIVEMIND_GRAPHS_HOME = "/tmp/x";
    try {
      expect(repoDir("abc")).toBe(join("/tmp/x", "abc"));
    } finally {
      if (prev === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
      else process.env.HIVEMIND_GRAPHS_HOME = prev;
    }
  });
});

describe("buildSnapshot — aggregation and sorting", () => {
  it("aggregates nodes across multiple extractions", () => {
    const e1 = makeExtraction("a.ts", [makeNode("a.ts:foo:function")], []);
    const e2 = makeExtraction("b.ts", [makeNode("b.ts:bar:function")], []);
    const snap = buildSnapshot([e1, e2], makeMetadata(), makeObservation());
    expect(snap.nodes).toHaveLength(2);
    expect(snap.nodes.map((n) => n.id)).toEqual(["a.ts:foo:function", "b.ts:bar:function"]);
  });

  it("sorts nodes by id (case-sensitive string compare)", () => {
    const e = makeExtraction("x.ts", [
      makeNode("x.ts:zebra:function"),
      makeNode("x.ts:apple:function"),
      makeNode("x.ts:Mango:function"),
    ], []);
    const snap = buildSnapshot([e], makeMetadata(), makeObservation());
    expect(snap.nodes.map((n) => n.id)).toEqual([
      "x.ts:Mango:function",
      "x.ts:apple:function",
      "x.ts:zebra:function",
    ]);
  });

  it("sorts edges by (source, target, relation, ord)", () => {
    const edges: GraphEdge[] = [
      { source: "b", target: "a", relation: "calls", confidence: "EXTRACTED" },
      { source: "a", target: "z", relation: "calls", confidence: "EXTRACTED" },
      { source: "a", target: "a", relation: "calls", confidence: "EXTRACTED", ord: 2 },
      { source: "a", target: "a", relation: "calls", confidence: "EXTRACTED", ord: 1 },
      { source: "a", target: "a", relation: "imports", confidence: "EXTRACTED" },
    ];
    const e = makeExtraction("f.ts", [], edges);
    const snap = buildSnapshot([e], makeMetadata(), makeObservation());
    expect(snap.links.map((l) => `${l.source}|${l.target}|${l.relation}|${l.ord ?? 0}`)).toEqual([
      "a|a|calls|1",
      "a|a|calls|2",
      "a|a|imports|0",
      "a|z|calls|0",
      "b|a|calls|0",
    ]);
  });

  it("preserves directed=true and multigraph=true in the snapshot", () => {
    const snap = buildSnapshot([], makeMetadata(), makeObservation());
    expect(snap.directed).toBe(true);
    expect(snap.multigraph).toBe(true);
  });
});

describe("canonicalSnapshot — stable serialization", () => {
  it("produces identical bytes on repeated calls", () => {
    const snap = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:a:function")], [])],
      makeMetadata(),
      makeObservation(),
    );
    expect(canonicalSnapshot(snap)).toBe(canonicalSnapshot(snap));
  });

  it("sorts object keys alphabetically at every level", () => {
    // Build two GraphMetadata instances with REVERSED literal key order to
    // verify the canonical serialization doesn't depend on JS insertion order.
    // V8 preserves insertion order for string keys, so without the
    // recursive key-sort in canonicalSnapshot these would serialize differently.
    const meta1: GraphMetadata = {
      schema_version: 1,
      generator: "hivemind-graph",
      commit_sha: "x",
      repo_key: "k",
    };
    const meta2: GraphMetadata = {
      repo_key: "k",
      commit_sha: "x",
      generator: "hivemind-graph",
      schema_version: 1,
    };

    const s1 = buildSnapshot([], meta1, makeObservation());
    const s2 = buildSnapshot([], meta2, makeObservation());
    expect(canonicalSnapshot(s1)).toBe(canonicalSnapshot(s2));
  });
});

describe("computeSnapshotSha256 — content-hash contract", () => {
  it("is deterministic across repeated calls", () => {
    const snap = buildSnapshot([], makeMetadata(), makeObservation());
    const h1 = computeSnapshotSha256(snap);
    const h2 = computeSnapshotSha256(snap);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is INDEPENDENT of volatile observation fields (ts, branch, worktree_path, version, file counts)", () => {
    const snap1 = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:x:function")], [])],
      makeMetadata(),
      makeObservation({
        ts: "2026-01-01T00:00:00Z",
        branch: "main",
        worktree_path: "/home/alice/repo",
        repo_project: "repo",
        generator_version: "1.0.0",
        source_files_extracted: 1,
        source_files_skipped: 0,
      }),
    );
    const snap2 = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:x:function")], [])],
      makeMetadata(),
      makeObservation({
        ts: "2099-12-31T23:59:59Z",
        branch: "feature/x",
        worktree_path: "/home/bob/elsewhere",
        repo_project: "different-name",
        generator_version: "999.999.999",
        source_files_extracted: 99,
        source_files_skipped: 99,
      }),
    );
    expect(computeSnapshotSha256(snap1)).toBe(computeSnapshotSha256(snap2));
  });

  it("DOES change when nodes change", () => {
    const a = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:x:function")], [])],
      makeMetadata(),
      makeObservation(),
    );
    const b = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:y:function")], [])],
      makeMetadata(),
      makeObservation(),
    );
    expect(computeSnapshotSha256(a)).not.toBe(computeSnapshotSha256(b));
  });

  it("DOES change when stable metadata changes (e.g., commit_sha)", () => {
    const a = buildSnapshot([], makeMetadata({ commit_sha: "abc" }), makeObservation());
    const b = buildSnapshot([], makeMetadata({ commit_sha: "def" }), makeObservation());
    expect(computeSnapshotSha256(a)).not.toBe(computeSnapshotSha256(b));
  });
});

describe("writeSnapshot — atomic file I/O", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "graphs-test-"));
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("writes snapshots/<commit-sha>.json + latest-commit.txt when commit_sha is set", () => {
    const snap = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:a:function")], [])],
      makeMetadata({ commit_sha: "deadbeef" }),
      makeObservation(),
    );
    const r = writeSnapshot(snap, tmpRoot);
    expect(r.snapshotPath).toBe(join(tmpRoot, "snapshots", "deadbeef.json"));
    expect(r.latestCommitPath).toBe(join(tmpRoot, "latest-commit.txt"));
    expect(existsSync(r.snapshotPath)).toBe(true);
    expect(readFileSync(r.latestCommitPath!, "utf8")).toBe("deadbeef\n");
  });

  it("on-disk snapshot bytes match canonicalSnapshot exactly", () => {
    const snap = buildSnapshot(
      [makeExtraction("f.ts", [makeNode("f.ts:a:function")], [])],
      makeMetadata({ commit_sha: "abc" }),
      makeObservation(),
    );
    const r = writeSnapshot(snap, tmpRoot);
    expect(readFileSync(r.snapshotPath, "utf8")).toBe(canonicalSnapshot(snap));
  });

  it("returns the snapshot_sha256 matching computeSnapshotSha256", () => {
    const snap = buildSnapshot([], makeMetadata({ commit_sha: "x" }), makeObservation());
    const r = writeSnapshot(snap, tmpRoot);
    expect(r.snapshotSha256).toBe(computeSnapshotSha256(snap));
  });

  it("uses snapshot_sha256 as filename when commit_sha is null", () => {
    const snap = buildSnapshot([], makeMetadata({ commit_sha: null }), makeObservation());
    const r = writeSnapshot(snap, tmpRoot);
    expect(r.latestCommitPath).toBeNull();
    expect(r.snapshotPath).toBe(join(tmpRoot, "snapshots", `${r.snapshotSha256}.json`));
    expect(existsSync(r.snapshotPath)).toBe(true);
    expect(existsSync(join(tmpRoot, "latest-commit.txt"))).toBe(false);
  });

  it("re-writing the same snapshot is idempotent (same bytes, no temp files left over)", () => {
    const snap = buildSnapshot([], makeMetadata({ commit_sha: "same" }), makeObservation());
    const r1 = writeSnapshot(snap, tmpRoot);
    const before = readFileSync(r1.snapshotPath, "utf8");
    const r2 = writeSnapshot(snap, tmpRoot);
    const after = readFileSync(r2.snapshotPath, "utf8");
    expect(after).toBe(before);
    // No leftover .tmp.* files (CodeRabbit P1: `require()` is undefined
    // in ESM; readdirSync is imported with the other fs bindings above).
    const leftovers = readdirSync(join(tmpRoot, "snapshots")).filter((f) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
  });
});
