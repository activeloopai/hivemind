import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  parseSourceLocation,
  readSymbolSource,
  computeSymbolHash,
  buildAnchor,
  anchorStatus,
  computeStaleDocs,
  widenByBlastRadius,
  computeImpactedDocs,
  type DocRow,
  type DocAnchor,
} from "../../src/docs/index.js";
import type { GraphNode, GraphSnapshot, GraphEdge } from "../../src/graph/types.js";

// ── fixture builders ──────────────────────────────────────────────────────────

function node(id: string, source_file: string, source_location: string): GraphNode {
  const [, name, kind] = id.split(":");
  return {
    id,
    label: name ?? id,
    kind: (kind as GraphNode["kind"]) ?? "function",
    source_file,
    source_location,
    language: "typescript",
    exported: true,
  };
}

function edge(source: string, target: string, relation: GraphEdge["relation"] = "calls"): GraphEdge {
  return { source, target, relation, confidence: "EXTRACTED" };
}

function snap(nodes: GraphNode[], links: GraphEdge[] = []): GraphSnapshot {
  return { nodes, links } as unknown as GraphSnapshot;
}

function doc(doc_id: string, anchors: DocAnchor[]): DocRow {
  return {
    id: `row-${doc_id}`,
    doc_id,
    path: `/docs/p/${doc_id}.md`,
    content: "# doc",
    anchors,
    tier: "fast",
    status: "active",
    project: "p",
    version: 1,
    created_at: "2026-06-22T00:00:00Z",
    updated_at: "2026-06-22T00:00:00Z",
    agent: "manual",
    plugin_version: "0",
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ── parseSourceLocation ─────────────────────────────────────────────────────

describe("parseSourceLocation", () => {
  it("parses single-line and range forms", () => {
    expect(parseSourceLocation("L10")).toEqual({ startLine: 10, endLine: 10 });
    expect(parseSourceLocation("L10-20")).toEqual({ startLine: 10, endLine: 20 });
    expect(parseSourceLocation("L10-L20")).toEqual({ startLine: 10, endLine: 20 });
  });
  it("rejects garbage and inverted / zero ranges", () => {
    expect(parseSourceLocation("")).toBeNull();
    expect(parseSourceLocation("10")).toBeNull();
    expect(parseSourceLocation("Lx")).toBeNull();
    expect(parseSourceLocation("L0")).toBeNull();
    expect(parseSourceLocation("L20-L10")).toBeNull();
  });
});

// ── source reading + hashing (real files on disk) ───────────────────────────

describe("readSymbolSource / computeSymbolHash", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-anchor-"));
    // 5-line file; the symbol "foo" is lines 2-3.
    writeFileSync(join(dir, "a.ts"), "// header\nfunction foo() {\n  return 1;\n}\n// tail\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads exactly the symbol's line slice", () => {
    const src = readSymbolSource(node("a.ts:foo:function", "a.ts", "L2-L3"), dir);
    expect(src).toBe("function foo() {\n  return 1;");
  });

  it("hashes the slice content (robust to lines moving)", () => {
    const h1 = computeSymbolHash(node("a.ts:foo:function", "a.ts", "L2-L3"), dir);
    expect(h1).toBe(sha("function foo() {\n  return 1;"));
    // Same body at a different location → SAME hash (location-independent).
    writeFileSync(join(dir, "b.ts"), "\n\n\nfunction foo() {\n  return 1;\n}\n");
    const h2 = computeSymbolHash(node("a.ts:foo:function", "b.ts", "L4-L5"), dir);
    expect(h2).toBe(h1);
  });

  it("returns null for missing file or out-of-range lines", () => {
    expect(computeSymbolHash(node("x:foo:function", "missing.ts", "L1"), dir)).toBeNull();
    expect(computeSymbolHash(node("a.ts:foo:function", "a.ts", "L99-L100"), dir)).toBeNull();
  });

  it("buildAnchor returns {symbol_id, content_hash} or null", () => {
    const n = node("a.ts:foo:function", "a.ts", "L2-L3");
    expect(buildAnchor(n, dir)).toEqual({ symbol_id: n.id, content_hash: sha("function foo() {\n  return 1;") });
    expect(buildAnchor(node("a.ts:foo:function", "gone.ts", "L1"), dir)).toBeNull();
  });
});

// ── anchorStatus ────────────────────────────────────────────────────────────

describe("anchorStatus", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-status-"));
    writeFileSync(join(dir, "a.ts"), "function foo() {\n  return 1;\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fresh when the stored hash matches current code", () => {
    const n = node("a.ts:foo:function", "a.ts", "L1-L2");
    const a = buildAnchor(n, dir)!;
    expect(anchorStatus(a, snap([n]), dir)).toEqual({ state: "fresh" });
  });

  it("changed when the code differs from the stored hash", () => {
    const n = node("a.ts:foo:function", "a.ts", "L1-L2");
    const stale: DocAnchor = { symbol_id: n.id, content_hash: "deadbeef" };
    const st = anchorStatus(stale, snap([n]), dir);
    expect(st.state).toBe("changed");
  });

  it("missing when the symbol is no longer in the graph", () => {
    const a: DocAnchor = { symbol_id: "a.ts:gone:function", content_hash: "x" };
    expect(anchorStatus(a, snap([]), dir)).toEqual({ state: "missing" });
  });

  it("unreadable when the symbol exists but its source can't be read", () => {
    const n = node("a.ts:foo:function", "a.ts", "L50-L60");
    const a: DocAnchor = { symbol_id: n.id, content_hash: "x" };
    expect(anchorStatus(a, snap([n]), dir)).toEqual({ state: "unreadable" });
  });
});

// ── computeStaleDocs (direct hash staleness) ────────────────────────────────

describe("computeStaleDocs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-stale-"));
    writeFileSync(join(dir, "a.ts"), "function foo() {\n  return 1;\n}\n");
    writeFileSync(join(dir, "b.ts"), "function bar() {\n  return 2;\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("flags ONLY the doc whose anchored code changed", () => {
    const foo = node("a.ts:foo:function", "a.ts", "L1-L2");
    const bar = node("b.ts:bar:function", "b.ts", "L1-L2");
    const freshFoo = buildAnchor(foo, dir)!; // correct hash → fresh
    const staleBar: DocAnchor = { symbol_id: bar.id, content_hash: "wrong000" }; // → changed
    const result = computeStaleDocs({
      snap: snap([foo, bar]),
      docs: [doc("a.ts", [freshFoo]), doc("b.ts", [staleBar])],
      repoRoot: dir,
    });
    expect(result.map(r => r.doc_id)).toEqual(["b.ts"]);
    expect(result[0].reasons).toEqual([{ kind: "code_changed", symbol_id: bar.id }]);
  });

  it("reports symbol_missing when the anchored symbol vanished from the graph", () => {
    const result = computeStaleDocs({
      snap: snap([]),
      docs: [doc("a.ts", [{ symbol_id: "a.ts:foo:function", content_hash: "x" }])],
      repoRoot: dir,
    });
    expect(result[0].reasons).toEqual([{ kind: "symbol_missing", symbol_id: "a.ts:foo:function" }]);
  });

  it("returns nothing when every anchor is fresh", () => {
    const foo = node("a.ts:foo:function", "a.ts", "L1-L2");
    const result = computeStaleDocs({
      snap: snap([foo]),
      docs: [doc("a.ts", [buildAnchor(foo, dir)!])],
      repoRoot: dir,
    });
    expect(result).toEqual([]);
  });
});

// ── widenByBlastRadius (relational staleness) ───────────────────────────────

describe("widenByBlastRadius", () => {
  // bar() calls foo(); baz() is unrelated.
  const foo = node("a.ts:foo:function", "a.ts", "L1");
  const bar = node("b.ts:bar:function", "b.ts", "L1");
  const baz = node("c.ts:baz:function", "c.ts", "L1");
  const s = snap([foo, bar, baz], [edge(bar.id, foo.id, "calls")]);

  it("flags the CALLER's doc when the callee changed, not the unrelated doc", () => {
    const result = widenByBlastRadius({
      snap: s,
      changedSymbolIds: [foo.id], // foo changed
      docs: [
        doc("b.ts", [{ symbol_id: bar.id, content_hash: "h" }]), // bar calls foo → flagged
        doc("c.ts", [{ symbol_id: baz.id, content_hash: "h" }]), // baz unrelated → not
      ],
    });
    expect(result.map(r => r.doc_id)).toEqual(["b.ts"]);
    expect(result[0].reasons).toEqual([{ kind: "caller_changed", symbol_id: bar.id }]);
  });

  it("does NOT re-flag the changed symbol's own doc (left to the direct pass)", () => {
    const result = widenByBlastRadius({
      snap: s,
      changedSymbolIds: [foo.id],
      docs: [doc("a.ts", [{ symbol_id: foo.id, content_hash: "h" }])],
    });
    expect(result).toEqual([]);
  });

  it("returns nothing when no symbols changed", () => {
    expect(widenByBlastRadius({ snap: s, changedSymbolIds: [], docs: [doc("b.ts", [])] })).toEqual([]);
  });
});

// ── computeImpactedDocs (direct ∪ relational) ───────────────────────────────

describe("computeImpactedDocs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-impacted-"));
    writeFileSync(join(dir, "a.ts"), "function foo() {\n  return 1;\n}\n");
    writeFileSync(join(dir, "b.ts"), "function bar() {\n  return foo();\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("unions a directly-changed doc with the doc of its caller (one reason each)", () => {
    const foo = node("a.ts:foo:function", "a.ts", "L1-L2");
    const bar = node("b.ts:bar:function", "b.ts", "L1-L2");
    const s = snap([foo, bar], [edge(bar.id, foo.id, "calls")]);
    // foo's anchor is stale (code_changed); bar's anchor is fresh but bar calls foo.
    const staleFoo: DocAnchor = { symbol_id: foo.id, content_hash: "wrong000" };
    const freshBar = buildAnchor(bar, dir)!;
    const result = computeImpactedDocs({
      snap: s,
      docs: [doc("a.ts", [staleFoo]), doc("b.ts", [freshBar])],
      repoRoot: dir,
    });
    const byId = Object.fromEntries(result.map(r => [r.doc_id, r.reasons]));
    expect(Object.keys(byId).sort()).toEqual(["a.ts", "b.ts"]);
    expect(byId["a.ts"]).toEqual([{ kind: "code_changed", symbol_id: foo.id }]);
    expect(byId["b.ts"]).toEqual([{ kind: "caller_changed", symbol_id: bar.id }]);
  });

  it("flags nothing when all anchors are fresh and no diff seeds widening", () => {
    const foo = node("a.ts:foo:function", "a.ts", "L1-L2");
    const result = computeImpactedDocs({
      snap: snap([foo]),
      docs: [doc("a.ts", [buildAnchor(foo, dir)!])],
      repoRoot: dir,
    });
    expect(result).toEqual([]);
  });
});
