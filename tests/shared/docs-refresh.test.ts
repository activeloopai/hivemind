import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  gateDocEdit,
  countChangedLines,
  DEFAULT_MAX_CHANGED_LINES,
  GATE_MAX_CONTENT_LENGTH,
  buildRefreshPrompt,
  refreshDocs,
  type DocRow,
  type DocAnchor,
  type ImpactedDoc,
} from "../../src/docs/index.js";
import { buildAnchor } from "../../src/docs/index.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

// ── fixtures ────────────────────────────────────────────────────────────────

function node(id: string, source_file: string, source_location: string, signature?: string): GraphNode {
  return {
    id, label: id, kind: "function", source_file, source_location,
    language: "typescript", exported: true, signature,
  };
}
function snap(nodes: GraphNode[]): GraphSnapshot {
  return { nodes, links: [] } as unknown as GraphSnapshot;
}
function doc(over: Partial<DocRow> = {}): DocRow {
  return {
    id: "row", doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "old doc",
    anchors: [], tier: "fast", status: "active", project: "p", version: 3,
    created_at: "t", updated_at: "t", agent: "m", plugin_version: "0", ...over,
  };
}
function mockQuery(script: Array<(sql: string) => unknown>) {
  const calls: string[] = [];
  let step = 0;
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    const out = step < script.length ? script[step++](sql) : [];
    return Array.isArray(out) ? (out as Array<Record<string, unknown>>) : [];
  });
  return { calls, query };
}

// ── countChangedLines ─────────────────────────────────────────────────────────

describe("countChangedLines", () => {
  it("is 0 for identical text", () => {
    expect(countChangedLines("a\nb\nc", "a\nb\nc")).toBe(0);
  });
  it("counts a single changed line as 2 (1 removed + 1 added)", () => {
    expect(countChangedLines("a\nb\nc", "a\nX\nc")).toBe(2);
  });
  it("counts pure additions and pure removals", () => {
    expect(countChangedLines("", "a\nb")).toBe(2);
    expect(countChangedLines("a\nb", "")).toBe(2);
  });
  it("counts a full rewrite as remove-all + add-all", () => {
    expect(countChangedLines("a\nb", "x\ny\nz")).toBe(5);
  });
});

// ── gateDocEdit ───────────────────────────────────────────────────────────────

describe("gateDocEdit", () => {
  const n = node("a.ts:foo:function", "a.ts", "L1");
  const s = snap([n]);
  const anchor: DocAnchor = { symbol_id: n.id, content_hash: "h" };

  it("passes a small edit with valid anchors on a fast doc", () => {
    const r = gateDocEdit({ tier: "fast", prevContent: "old doc", newContent: "new doc", newAnchors: [anchor], snap: s });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it("rejects empty content", () => {
    const r = gateDocEdit({ tier: "fast", prevContent: "x", newContent: "", newAnchors: [], snap: s });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["proposed content is empty"]);
  });
  it("rejects content over the length cap", () => {
    const big = "x".repeat(GATE_MAX_CONTENT_LENGTH + 1);
    const r = gateDocEdit({ tier: "fast", prevContent: "x", newContent: big, newAnchors: [], snap: s });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([`proposed content exceeds ${GATE_MAX_CONTENT_LENGTH} chars (got ${big.length})`]);
  });
  it("rejects automatic refresh of a slow-tier doc", () => {
    const r = gateDocEdit({ tier: "slow", prevContent: "x", newContent: "y", newAnchors: [anchor], snap: s });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["slow-tier docs are human-curated; automatic refresh is not allowed"]);
  });
  it("allowSlow opts a slow-tier edit in (the wiki update-worker's own pipeline)", () => {
    const r = gateDocEdit({ tier: "slow", allowSlow: true, prevContent: "x", newContent: "y", newAnchors: [anchor], snap: s });
    expect(r.ok).toBe(true);
  });
  it("rejects an anchor pointing at a symbol absent from the graph", () => {
    const r = gateDocEdit({ tier: "fast", prevContent: "x", newContent: "y", newAnchors: [{ symbol_id: "a.ts:gone:function", content_hash: "h" }], snap: s });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["anchor references a symbol absent from the graph: a.ts:gone:function"]);
  });
  it("rejects an edit beyond the changed-line budget", () => {
    const huge = Array.from({ length: DEFAULT_MAX_CHANGED_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
    const r = gateDocEdit({ tier: "fast", prevContent: "old doc", newContent: huge, newAnchors: [anchor], snap: s });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([expect.stringMatching(/^edit exceeds the bounded-change budget: \d+ > \d+ lines$/)]);
  });
  it("honors a custom maxChangedLines override", () => {
    const r = gateDocEdit({ tier: "fast", prevContent: "a", newContent: "b\nc\nd", newAnchors: [anchor], snap: s, maxChangedLines: 1 });
    expect(r.ok).toBe(false);
  });
});

// ── buildRefreshPrompt ────────────────────────────────────────────────────────

describe("buildRefreshPrompt", () => {
  it("embeds the current doc, the changed symbol source, and bounded-edit rules", () => {
    const p = buildRefreshPrompt({
      doc: doc({ content: "# My Doc\nbody" }),
      reasons: [{ kind: "code_changed", symbol_id: "a.ts:foo:function" }],
      changedSymbols: [{ symbol_id: "a.ts:foo:function", signature: "function foo(): number", source: "function foo() { return 42; }" }],
    });
    expect(p).toContain("SMALLEST edit");
    expect(p).toContain("# My Doc");
    expect(p).toContain("function foo() { return 42; }");
    expect(p).toContain("a.ts:foo:function");
  });
  it("degrades gracefully when there is no symbol source", () => {
    const p = buildRefreshPrompt({ doc: doc(), reasons: [], changedSymbols: [] });
    expect(p).toContain("(no symbol source available)");
  });
});

// ── refreshDocs (orchestrator) ────────────────────────────────────────────────

describe("refreshDocs", () => {
  let dir: string;
  let foo: GraphNode;
  let s: GraphSnapshot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-refresh-"));
    writeFileSync(join(dir, "a.ts"), "export function foo() {\n  return 1;\n}\n");
    foo = node("a.ts:foo:function", "a.ts", "L1-L3", "function foo(): number");
    s = snap([foo]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const impacted = (): ImpactedDoc[] => [{ doc_id: "a.ts", reasons: [{ kind: "code_changed", symbol_id: foo.id }] }];

  it("refreshes a stale doc: re-anchors, gates, and setDoc version-bumps", async () => {
    const d = doc({ anchors: [{ symbol_id: foo.id, content_hash: "stale" }] });
    const { calls, query } = mockQuery([
      () => [{ id: "r", doc_id: "a.ts", version: 3, content: "old doc", anchors: "[]", tier: "fast", status: "active", project: "p", created_at: "t", updated_at: "t" }], // getDocLatest
      () => [], // INSERT
    ]);
    const generate = vi.fn(async () => "new doc body");
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map([["a.ts", d]]), generate,
    });
    expect(report.refreshed).toBe(1);
    expect(report.outcomes[0]).toMatchObject({ doc_id: "a.ts", status: "refreshed", version: 4 });
    expect(generate).toHaveBeenCalledOnce();
    // 2 queries: getDocLatest + UPDATE-in-place. The UPDATE carries the FRESH
    // anchor (recomputed from current code), not the stale stored hash.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/^UPDATE "hivemind_docs" SET/);
    expect(calls[1]).toContain("new doc body");
    expect(calls[1]).toContain(buildAnchor(foo, dir)!.content_hash);
    expect(calls[1]).not.toContain("stale");
  });

  it("rejects an over-budget rewrite — no write happens", async () => {
    const d = doc({ anchors: [{ symbol_id: foo.id, content_hash: "stale" }] });
    const { calls, query } = mockQuery([]);
    const huge = Array.from({ length: DEFAULT_MAX_CHANGED_LINES + 10 }, (_, i) => `l${i}`).join("\n");
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map([["a.ts", d]]), generate: async () => huge,
    });
    expect(report.rejected).toBe(1);
    expect(report.outcomes[0].status).toBe("rejected");
    expect(report.outcomes[0].reasons).toEqual([expect.stringMatching(/^edit exceeds the bounded-change budget: \d+ > \d+ lines$/)]);
    expect(calls).toHaveLength(0); // nothing written
  });

  it("rejects a slow-tier doc WITHOUT calling the LLM (no token spend, no leak)", async () => {
    const d = doc({ tier: "slow", anchors: [{ symbol_id: foo.id, content_hash: "x" }] });
    const { calls, query } = mockQuery([]);
    const generate = vi.fn(async () => "small");
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map([["a.ts", d]]), generate,
    });
    expect(report.rejected).toBe(1);
    expect(report.outcomes[0].reasons).toEqual(["slow-tier docs are human-curated; automatic refresh is not allowed"]);
    // The generator is never invoked for slow-tier docs.
    expect(generate).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("skips an impacted doc that has no current row", async () => {
    const { query } = mockQuery([]);
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map(), generate: async () => "x",
    });
    expect(report.skipped).toBe(1);
    expect(report.outcomes[0].status).toBe("skipped");
  });

  it("skips when the generator throws", async () => {
    const d = doc({ anchors: [{ symbol_id: foo.id, content_hash: "x" }] });
    const { calls, query } = mockQuery([]);
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map([["a.ts", d]]),
      generate: async () => { throw new Error("LLM down"); },
    });
    expect(report.skipped).toBe(1);
    expect(report.outcomes[0].reasons).toEqual(["generate failed: LLM down"]);
    expect(calls).toHaveLength(0);
  });

  it("archives a fully-orphaned doc (file deleted/renamed) WITHOUT calling the LLM", async () => {
    // doc anchored ONLY to a symbol that's gone; the snapshot has none of it →
    // the documented file was deleted or renamed. Archive, don't re-author.
    const gone = "a.ts:gone:function";
    const d = doc({ anchors: [{ symbol_id: gone, content_hash: "x" }] });
    const emptySnap = snap([]);
    const { calls, query } = mockQuery([
      () => [{ id: "r", doc_id: "a.ts", version: 3, content: "old", anchors: "[]", tier: "fast", status: "active", project: "p", created_at: "t", updated_at: "t" }], // getDocLatest in archiveDoc
      () => [], // INSERT of the archived version
    ]);
    const generate = vi.fn(async () => "should never be called");
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: emptySnap, repoRoot: dir,
      impacted: [{ doc_id: "a.ts", reasons: [{ kind: "symbol_missing", symbol_id: gone }] }],
      docsById: new Map([["a.ts", d]]), generate,
    });
    expect(report.archived).toBe(1);
    expect(report.refreshed).toBe(0);
    expect(report.outcomes[0]).toMatchObject({ doc_id: "a.ts", status: "archived", version: 4 });
    // No token spent on a deleted file.
    expect(generate).not.toHaveBeenCalled();
    // archiveDoc = getDocLatest + UPDATE(status='archived'); nothing else.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/^UPDATE "hivemind_docs" SET/);
    expect(calls[1]).toContain("status = 'archived'");
  });

  it("drops a dangling anchor when its symbol vanished from the graph", async () => {
    // doc anchored to foo + a gone symbol; snapshot only has foo.
    const d = doc({ anchors: [{ symbol_id: foo.id, content_hash: "x" }, { symbol_id: "a.ts:gone:function", content_hash: "y" }] });
    const { calls, query } = mockQuery([
      () => [{ id: "r", doc_id: "a.ts", version: 1, content: "old", anchors: "[]", tier: "fast", status: "active", project: "p", created_at: "t", updated_at: "t" }],
      () => [],
    ]);
    const report = await refreshDocs({
      query, tableName: "hivemind_docs", snap: s, repoRoot: dir,
      impacted: impacted(), docsById: new Map([["a.ts", d]]), generate: async () => "small",
    });
    expect(report.refreshed).toBe(1);
    // The INSERT must carry only foo's anchor, not the gone one.
    expect(calls[1]).toContain(foo.id);
    expect(calls[1]).not.toContain("a.ts:gone:function");
  });
});
