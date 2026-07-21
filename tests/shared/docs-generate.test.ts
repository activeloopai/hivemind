import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import { normalizeForHash, hashSource } from "../../src/docs/anchors.js";
import { globToRegExp, selectTargets, generateDocs, DEFAULT_EXCLUDE_GLOBS, buildBatchGeneratePrompt, parseBatchDocs } from "../../src/docs/generate.js";
import type { GenDocInput } from "../../src/docs/generate.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, file: string, loc: string, kind: GraphNode["kind"] = "function"): GraphNode {
  return { id, label: id, kind, source_file: file, source_location: loc, language: "typescript", exported: true };
}
function snap(nodes: GraphNode[]): GraphSnapshot {
  return { nodes, links: [] } as unknown as GraphSnapshot;
}
function mockQuery(rowsPerCall: Array<Record<string, unknown>> = []) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => { calls.push(sql); return rowsPerCall; });
  return { calls, query };
}

// ── normalizeForHash (the false-positive fix) ─────────────────────────────────

describe("normalizeForHash", () => {
  it("ignores comments — a comment-only edit yields the SAME hash", () => {
    const a = "function f() {\n  // does a thing\n  return 1;\n}";
    const b = "function f() {\n  // does a completely different thing\n  return 1;\n}";
    expect(hashSource(a)).toBe(hashSource(b));
  });
  it("ignores trailing whitespace and blank lines", () => {
    const a = "function f() {\n  return 1;\n}";
    const b = "function f() {   \n\n  return 1;\n\n}\n";
    expect(hashSource(a)).toBe(hashSource(b));
  });
  it("strips block comments too", () => {
    expect(normalizeForHash("a();/* x */\nb();")).toBe("a();\nb();");
  });
  it("STILL detects a real code change (different identifier / literal)", () => {
    expect(hashSource("return 1;")).not.toBe(hashSource("return 2;"));
    expect(hashSource("const x = 1;")).not.toBe(hashSource("const y = 1;"));
  });
  it("does NOT truncate string literals containing // or # (drift-detection blindness fix)", () => {
    // A change after "//" inside a string MUST change the hash.
    expect(hashSource('const url = "https://api.example.com";')).not.toBe(hashSource('const url = "https://api.OTHER.com";'));
    expect(hashSource('x = "a#b"', "python")).not.toBe(hashSource('x = "a#c"', "python"));
    // Real comments (start-of-line or after whitespace) are still ignored.
    expect(hashSource("return 1; // old note")).toBe(hashSource("return 1; // new note"));
  });

  it("uses # comments for python and preserves indentation", () => {
    expect(normalizeForHash("def f():\n    # comment\n    return 1", "python")).toBe("def f():\n    return 1");
  });
});

// ── globToRegExp ──────────────────────────────────────────────────────────────

describe("globToRegExp", () => {
  it("matches ** across directories and * within a segment", () => {
    expect(globToRegExp("**/*.test.ts").test("src/a/b.test.ts")).toBe(true);
    expect(globToRegExp("**/*.test.ts").test("src/b.ts")).toBe(false);
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
  });
  it("escapes regex metacharacters and matches dotfiles", () => {
    expect(globToRegExp("**/*.config.*").test("src/app.config.js")).toBe(true);
    expect(globToRegExp("**/*.d.ts").test("types/x.d.ts")).toBe(true);
  });
});

// ── selectTargets ─────────────────────────────────────────────────────────────

describe("selectTargets", () => {
  const nodes = [
    node("src/a.ts:foo:function", "src/a.ts", "L1"),
    node("src/a.ts:Bar:class", "src/a.ts", "L5", "class"),
    node("src/a.test.ts:t:function", "src/a.test.ts", "L1"),   // excluded by default
    node("src/x.d.ts:T:type_alias", "src/x.d.ts", "L1", "type_alias"), // excluded by default
    node("src/index.ts:re:function", "src/index.ts", "L1"),    // barrel, excluded by default
    node("src/b.ts:C:const", "src/b.ts", "L1", "const"),        // non-documentable kind
  ];
  it("file scope groups documentable symbols per file, default-excluding tests/d.ts/barrels", () => {
    const t = selectTargets(snap(nodes), { scope: "file" });
    expect(t.map((x) => x.doc_id)).toEqual(["src/a.ts"]); // only a.ts survives
    expect(t[0].symbols.map((s) => s.id).sort()).toEqual(["src/a.ts:Bar:class", "src/a.ts:foo:function"]);
  });
  it("symbol scope yields one target per documentable symbol", () => {
    const t = selectTargets(snap(nodes), { scope: "symbol" });
    expect(t.map((x) => x.doc_id).sort()).toEqual(["src/a.ts:Bar:class", "src/a.ts:foo:function"]);
  });
  it("honors an explicit include filter", () => {
    const t = selectTargets(snap(nodes), { scope: "file", include: ["src/b.ts"] });
    expect(t).toEqual([]); // b.ts only had a const (non-documentable)
  });
  it("honors an additional exclude on top of the defaults", () => {
    const t = selectTargets(snap(nodes), { scope: "file", exclude: ["src/a.ts"] });
    expect(t).toEqual([]);
  });
  it("DEFAULT_EXCLUDE_GLOBS covers tests, d.ts, config and barrels", () => {
    expect(DEFAULT_EXCLUDE_GLOBS.some((g) => globToRegExp(g).test("a/b.test.ts"))).toBe(true);
    expect(DEFAULT_EXCLUDE_GLOBS.some((g) => globToRegExp(g).test("a/b.d.ts"))).toBe(true);
  });
});

// ── generateDocs (orchestrator) ───────────────────────────────────────────────

describe("generateDocs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-gen-"));
    writeFileSync(join(dir, "a.ts"), "export function foo() {\n  return 1;\n}\n");
    writeFileSync(join(dir, "a.test.ts"), "export function t() {}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const s = () => snap([
    node("a.ts:foo:function", "a.ts", "L1-L3"),
    node("a.test.ts:t:function", "a.test.ts", "L1"),
  ]);

  it("creates a file-scope doc for non-excluded files, anchored to their symbols", async () => {
    const { calls, query } = mockQuery([]); // setDoc: SELECT [] then INSERT v1
    const generate = vi.fn(async () => "# a.ts\nfoo returns 1.");
    const report = await generateDocs({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      project: "p", existing: new Set(), generate, concurrency: 2,
    });
    expect(report.created).toBe(1);          // a.test.ts excluded by default
    expect(report.targets).toBe(1);
    expect(generate).toHaveBeenCalledOnce();
    const insert = calls.find((c) => /INSERT INTO "hivemind_docs"/.test(c))!;
    expect(insert).toContain("a.ts:foo:function");   // anchored
    expect(insert).toContain("foo returns 1.");
  });

  it("skips files that already have a doc (idempotent) unless --force", async () => {
    const { query } = mockQuery([]);
    const generate = vi.fn(async () => "x");
    const report = await generateDocs({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      existing: new Set(["a.ts"]), generate,
    });
    expect(report.created).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("records a failure when generation throws", async () => {
    const { query } = mockQuery([]);
    const report = await generateDocs({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      existing: new Set(), generate: async () => { throw new Error("LLM down"); },
    });
    expect(report.failed).toBe(1);
    expect(report.outcomes[0].reason).toMatch(/LLM down/);
  });
});

// ── batched generation (parser + prompt) ──────────────────────────────────────

const bIn = (docId: string): GenDocInput => ({ doc_id: docId, file: docId, symbols: [{ id: `${docId}:f`, source: "x" }] });

describe("buildBatchGeneratePrompt", () => {
  it("emits an exact marker + File block for every input file", () => {
    const p = buildBatchGeneratePrompt([bIn("src/a.ts"), bIn("src/b.ts")]);
    expect(p).toContain("<<<DOC file=src/a.ts>>>");
    expect(p).toContain("<<<DOC file=src/b.ts>>>");
    expect(p).toContain("## File: src/a.ts");
    expect(p).toContain("## File: src/b.ts");
  });
});

describe("parseBatchDocs", () => {
  const inputs = [bIn("src/a.ts"), bIn("src/b.ts"), bIn("src/c.ts")];

  it("splits a marked response into doc_id -> content", () => {
    const resp = [
      "<<<DOC file=src/a.ts>>>", "# A", "does A",
      "<<<DOC file=src/b.ts>>>", "# B", "does B",
      "<<<DOC file=src/c.ts>>>", "# C",
    ].join("\n");
    const m = parseBatchDocs(resp, inputs);
    expect(m.size).toBe(3);
    expect(m.get("src/a.ts")).toBe("# A\ndoes A");
    expect(m.get("src/b.ts")).toBe("# B\ndoes B");
    expect(m.get("src/c.ts")).toBe("# C");
  });

  it("omits a file the model dropped (caller falls back to single)", () => {
    const resp = "<<<DOC file=src/a.ts>>>\n# A\n<<<DOC file=src/c.ts>>>\n# C";
    const m = parseBatchDocs(resp, inputs);
    expect(m.has("src/b.ts")).toBe(false); // dropped → absent
    expect([...m.keys()].sort()).toEqual(["src/a.ts", "src/c.ts"]);
  });

  it("ignores a hallucinated path not in the batch", () => {
    const resp = "<<<DOC file=src/a.ts>>>\n# A\n<<<DOC file=totally/made-up.ts>>>\n# nope";
    const m = parseBatchDocs(resp, inputs);
    expect(m.size).toBe(1);
    expect(m.get("src/a.ts")).toBe("# A");
  });

  it("drops an empty body", () => {
    const resp = "<<<DOC file=src/a.ts>>>\n   \n<<<DOC file=src/b.ts>>>\n# B";
    const m = parseBatchDocs(resp, inputs);
    expect(m.has("src/a.ts")).toBe(false);
    expect(m.get("src/b.ts")).toBe("# B");
  });
});

// ── generateDocs BATCH path (fallback on omitted files) ───────────────────────

describe("generateDocs — batch path", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-batch-"));
    writeFileSync(join(dir, "a.ts"), "export function foo() {\n  return 1;\n}\n");
    writeFileSync(join(dir, "b.ts"), "export function bar() {\n  return 2;\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const s = () => snap([
    node("a.ts:foo:function", "a.ts", "L1-L3"),
    node("b.ts:bar:function", "b.ts", "L1-L3"),
  ]);

  it("uses the batch generator, and falls back to single for files it omits", async () => {
    const { query } = mockQuery([]);
    // batch returns ONLY a.ts → b.ts must fall back to the single generator.
    const batchGenerate = vi.fn(async (inputs: GenDocInput[]) => {
      const m = new Map<string, string>();
      for (const i of inputs) if (i.doc_id === "a.ts") m.set("a.ts", "# a batched");
      return m;
    });
    const generate = vi.fn(async (i: GenDocInput) => `# ${i.doc_id} single`);
    const report = await generateDocs({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      existing: new Set(), generate, batchSize: 5, batchGenerate, concurrency: 1,
    });
    expect(report.created).toBe(2);                 // both landed
    expect(batchGenerate).toHaveBeenCalledOnce();    // one batch call for both
    expect(generate).toHaveBeenCalledOnce();         // only the omitted b.ts
    expect(generate.mock.calls[0][0].doc_id).toBe("b.ts");
  });

  it("falls back to single for the whole batch when the batch call throws", async () => {
    const { query } = mockQuery([]);
    const batchGenerate = vi.fn(async () => { throw new Error("batch LLM down"); });
    const generate = vi.fn(async (i: GenDocInput) => `# ${i.doc_id}`);
    const report = await generateDocs({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      existing: new Set(), generate, batchSize: 5, batchGenerate, concurrency: 1,
    });
    expect(report.created).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2); // both fell back
  });
});
