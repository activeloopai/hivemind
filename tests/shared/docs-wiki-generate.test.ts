import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import {
  appendFilesIndex,
  buildWikiPagePrompt,
  buildWikiNotesPrompt,
  buildWikiSynthesisPrompt,
  chunkFiles,
  splitOversizedFile,
  validateWikiNarrative,
  generateWikiPages,
  wikiDocId,
  wikiGroupEligible,
  type WikiFileSource,
} from "../../src/docs/wiki-generate.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, file: string, loc: string): GraphNode {
  return { id, label: id, kind: "function", source_file: file, source_location: loc, language: "typescript", exported: true };
}
function snap(nodes: GraphNode[]): GraphSnapshot {
  return { nodes, links: [] } as unknown as GraphSnapshot;
}
function mockQuery() {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => { calls.push(sql); return []; });
  return { calls, query };
}

const src = (file: string, content: string): WikiFileSource => ({ file, content });

// ── chunkFiles / capFileContent ───────────────────────────────────────────────

describe("chunkFiles", () => {
  it("packs everything into one chunk when it fits the budget", () => {
    const chunks = chunkFiles([src("a.ts", "x".repeat(100)), src("b.ts", "y".repeat(100))], 10_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((s) => s.file)).toEqual(["a.ts", "b.ts"]);
  });

  it("splits when the budget is exceeded, preserving order", () => {
    const chunks = chunkFiles(
      [src("a.ts", "x".repeat(400)), src("b.ts", "y".repeat(400)), src("c.ts", "z".repeat(400))],
      500,
    );
    expect(chunks.map((c) => c.map((s) => s.file))).toEqual([["a.ts"], ["b.ts"], ["c.ts"]]);
  });

  it("a file bigger than the budget is SPLIT into labeled parts — never truncated", () => {
    const chunks = chunkFiles([src("huge.ts", "x".repeat(1100)), src("b.ts", "y")], 500);
    const all = chunks.flat();
    const parts = all.filter((s) => s.file.startsWith("huge.ts"));
    expect(parts.map((s) => s.file)).toEqual(["huge.ts [part 1/3]", "huge.ts [part 2/3]", "huge.ts [part 3/3]"]);
    // 100% of the source survives — the audit showed the model fabricates
    // claims about code it never saw, so tails must never be dropped.
    expect(parts.map((s) => s.content).join("")).toBe("x".repeat(1100));
    expect(all.some((s) => s.file === "b.ts")).toBe(true);
  });
});

describe("splitOversizedFile", () => {
  it("returns the file untouched when it fits", () => {
    expect(splitOversizedFile(src("a.ts", "short"), 100)).toEqual([src("a.ts", "short")]);
  });
});

describe("validateWikiNarrative (garbage-but-green guard)", () => {
  it("rejects a model REFUSAL saved as a page (the properties/ bug)", () => {
    const refusal = "I can only see a test file for CF encoding. Could you provide the implementation files?";
    expect(validateWikiNarrative(refusal).ok).toBe(false);
    expect(validateWikiNarrative(refusal).reason).toMatch(/refused/);
  });
  it("rejects empty and heading-less bodies", () => {
    expect(validateWikiNarrative("   ").ok).toBe(false);
    expect(validateWikiNarrative("just a plain paragraph with no structure").ok).toBe(false);
  });
  it("accepts a real page", () => {
    expect(validateWikiNarrative("## Purpose\nDoes things.").ok).toBe(true);
  });
});

// ── appendFilesIndex (mechanical, code-owned) ─────────────────────────────────

describe("appendFilesIndex", () => {
  it("appends a ## Files section listing every member file", () => {
    const out = appendFilesIndex("## Purpose\nStuff.", ["a/x.ts", "a/y.ts"]);
    expect(out).toContain("## Files");
    expect(out).toContain("- `a/x.ts`");
    expect(out).toContain("- `a/y.ts`");
  });

  it("is idempotent: strips a model-emitted or previous ## Files section first", () => {
    const withIndex = appendFilesIndex("## Purpose\nStuff.", ["a/x.ts"]);
    const again = appendFilesIndex(withIndex, ["a/x.ts", "a/z.ts"]);
    expect(again.match(/## Files/g)).toHaveLength(1);
    expect(again).toContain("- `a/z.ts`");
  });

  it("strips a mid-document ## Files section without eating later sections", () => {
    const narrative = "## Purpose\nStuff.\n\n## Files\n- `stale.ts`\n\n## Invariants\nImportant.";
    const out = appendFilesIndex(narrative, ["a/x.ts"]);
    expect(out).toContain("## Invariants");
    expect(out).not.toContain("stale.ts");
    expect(out.match(/## Files/g)).toHaveLength(1);
  });
});

// ── prompts ───────────────────────────────────────────────────────────────────

describe("wiki prompts", () => {
  it("page prompt embeds the subsystem key and every source block", () => {
    const p = buildWikiPagePrompt("src/docs", [src("src/docs/a.ts", "code-a"), src("src/docs/b.ts", "code-b")]);
    expect(p).toContain("`src/docs`");
    expect(p).toContain("### src/docs/a.ts");
    expect(p).toContain("code-b");
    expect(p).toContain("Do NOT include a file listing");
  });
  it("notes prompt states the chunk position; synthesis prompt embeds all notes", () => {
    const n = buildWikiNotesPrompt("k", [src("a.ts", "x")], 1, 3);
    expect(n).toContain("part 2 of 3");
    const s = buildWikiSynthesisPrompt("k", ["note-one", "note-two"]);
    expect(s).toContain("note-one");
    expect(s).toContain("notes part 2");
  });
});

// ── generateWikiPages (orchestrator) ──────────────────────────────────────────

describe("generateWikiPages", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-wiki-"));
    mkdirSync(join(dir, "pkg", "core"), { recursive: true });
    mkdirSync(join(dir, "pkg", "io"), { recursive: true });
    writeFileSync(join(dir, "pkg", "core", "a.ts"), "export function foo() {\n  return 1;\n}\n");
    writeFileSync(join(dir, "pkg", "io", "b.ts"), "export function bar() {\n  return 2;\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const s = () => snap([
    node("pkg/core/a.ts:foo:function", "pkg/core/a.ts", "L1-L3"),
    node("pkg/io/b.ts:bar:function", "pkg/io/b.ts", "L1-L3"),
  ]);

  it("writes one page per subsystem: tier=slow, scope, anchors, mechanical index", async () => {
    const { calls, query } = mockQuery();
    const run = vi.fn(async () => "## Purpose\nCore logic.");
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir, minGroupFiles: 0,
      project: "proj", existing: new Set(), run,
    });
    expect(report.created).toBe(2);
    expect(run).toHaveBeenCalledTimes(2); // one single-shot prompt per group
    const inserts = calls.filter((c) => /^INSERT/i.test(c.trim()));
    expect(inserts).toHaveLength(2); // exactly one INSERT per page
    const core = inserts.find((c) => c.includes("wiki/pkg/core"))!;
    expect(core).toContain("'slow'");                       // tier
    expect(core).toContain(`'proj|main|wiki/pkg/core'`);    // composite row id, scope=main
    expect(core).toContain("pkg/core/a.ts:foo:function");   // anchored symbol
    expect(core).toContain("## Files");                     // mechanical index present
    expect(core).toContain("- `pkg/core/a.ts`");
  });

  it("skips subsystems that already have a page unless force", async () => {
    const { query } = mockQuery();
    const run = vi.fn(async () => "x");
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir, minGroupFiles: 0,
      existing: new Set([wikiDocId("pkg/core"), wikiDocId("pkg/io")]), run,
    });
    expect(report.created).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("a failed generation writes NOTHING (missing beats stale-but-green)", async () => {
    const { calls, query } = mockQuery();
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir, minGroupFiles: 0,
      existing: new Set(), run: async () => { throw new Error("LLM down"); },
    });
    expect(report.failed).toBe(2);
    expect(calls.filter((c) => /^(INSERT|DELETE)/i.test(c.trim()))).toHaveLength(0);
    expect(report.outcomes[0].reason).toMatch(/LLM down/);
  });

  it("empty model output is a failure, not an empty page", async () => {
    const { calls, query } = mockQuery();
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir, minGroupFiles: 0,
      existing: new Set(), run: async () => "   ",
    });
    expect(report.failed).toBe(2);
    expect(calls.filter((c) => /^INSERT/i.test(c.trim()))).toHaveLength(0);
  });

  it("large subsystems map-reduce: N notes prompts + 1 synthesis prompt", async () => {
    const prompts: string[] = [];
    const run = vi.fn(async (p: string) => { prompts.push(p); return "## Notes\nok"; });
    const { query } = mockQuery();
    // Force multi-chunk with a tiny budget: each file lands in its own chunk.
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", minGroupFiles: 0, snap: snap([
        node("pkg/core/a.ts:foo:function", "pkg/core/a.ts", "L1-L3"),
      ]), repoRoot: dir,
      existing: new Set(), run, chunkChars: 60,
      include: ["pkg/core/*"],
    });
    expect(report.created).toBe(1);
    expect(run).toHaveBeenCalledTimes(1); // one file → one chunk → single-shot
    // Now with two files in ONE group split across chunks:
    writeFileSync(join(dir, "pkg", "core", "c.ts"), "export function baz() {\n  return 3;\n}\n");
    prompts.length = 0;
    run.mockClear();
    const report2 = await generateWikiPages({
      query, tableName: "hivemind_docs", minGroupFiles: 0, snap: snap([
        node("pkg/core/a.ts:foo:function", "pkg/core/a.ts", "L1-L3"),
        node("pkg/core/c.ts:baz:function", "pkg/core/c.ts", "L1-L3"),
      ]), repoRoot: dir,
      existing: new Set(), run, chunkChars: 60, force: true,
    });
    expect(report2.created).toBe(1);
    expect(run).toHaveBeenCalledTimes(3); // 2 notes + 1 synthesis
    expect(prompts[0]).toContain("part 1 of 2");
    expect(prompts[2]).toContain("synthesized from the reading notes");
  });

  it("a group below the min-size thresholds is SKIPPED (ceremony/refusal prevention)", async () => {
    const { calls, query } = mockQuery();
    const run = vi.fn(async () => "## X\nok");
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir,
      existing: new Set(), run, // default thresholds: 1 tiny file per group
    });
    expect(report.skipped).toBe(2);
    expect(report.outcomes[0].reason).toMatch(/below min size/);
    expect(run).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("a refusal from the model is FAILED, never persisted (garbage-but-green guard)", async () => {
    const { calls, query } = mockQuery();
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", snap: s(), repoRoot: dir, minGroupFiles: 0,
      existing: new Set(), run: async () => "I can only see a test file. Could you provide the implementation?",
    });
    expect(report.failed).toBe(2);
    expect(report.outcomes[0].reason).toMatch(/refused/);
    expect(calls.filter((c) => /^INSERT/i.test(c.trim()))).toHaveLength(0);
  });

  it("runPage authors the FINAL page; run only takes notes (model split)", async () => {
    writeFileSync(join(dir, "pkg", "core", "c.ts"), "export function baz() {\n  return 3;\n}\n");
    const notesRun = vi.fn(async () => "## Notes\n- pkg/core/a.ts: foo");
    const pageRun = vi.fn(async (_p: string) => "## Purpose\nAuthored by the strong model.");
    const { calls, query } = mockQuery();
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", minGroupFiles: 0, snap: snap([
        node("pkg/core/a.ts:foo:function", "pkg/core/a.ts", "L1-L3"),
        node("pkg/core/c.ts:baz:function", "pkg/core/c.ts", "L1-L3"),
      ]), repoRoot: dir,
      existing: new Set(), run: notesRun, runPage: pageRun, chunkChars: 60,
    });
    expect(report.created).toBe(1);
    expect(notesRun).toHaveBeenCalledTimes(2);            // 2 chunks -> 2 notes calls (cheap model)
    expect(pageRun).toHaveBeenCalledTimes(1);             // 1 synthesis call (strong model)
    expect(pageRun.mock.calls[0][0]).toContain("synthesized from the reading notes");
    const insert = calls.find((c) => /^INSERT/i.test(c.trim()))!;
    expect(insert).toContain("Authored by the strong model.");
  });

  it("group with no readable sources is skipped, not written", async () => {
    const { calls, query } = mockQuery();
    const report = await generateWikiPages({
      query, tableName: "hivemind_docs", minGroupFiles: 0, snap: snap([
        node("gone/x/void.ts:f:function", "gone/x/void.ts", "L1"),
      ]), repoRoot: dir,
      existing: new Set(), run: async () => "x",
    });
    expect(report.skipped).toBe(1);
    expect(calls.filter((c) => /^INSERT/i.test(c.trim()))).toHaveLength(0);
  });
});

describe("wikiGroupEligible (disk-side min-size gate for status displays)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "wiki-elig-")); mkdirSync(join(dir, "pkg")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("mirrors the in-run gate: skipped only when BOTH count and size are below", () => {
    // 2 tiny files: below both -> not eligible
    writeFileSync(join(dir, "pkg", "a.ts"), "x");
    writeFileSync(join(dir, "pkg", "b.ts"), "y");
    expect(wikiGroupEligible(["pkg/a.ts", "pkg/b.ts"], dir)).toBe(false);
    // 2 files but big: file count below, size above -> eligible (AND semantics)
    writeFileSync(join(dir, "pkg", "a.ts"), "z".repeat(9000));
    expect(wikiGroupEligible(["pkg/a.ts", "pkg/b.ts"], dir)).toBe(true);
    // 3 tiny files: count at threshold -> eligible even though size is below
    writeFileSync(join(dir, "pkg", "a.ts"), "x");
    writeFileSync(join(dir, "pkg", "c.ts"), "w");
    expect(wikiGroupEligible(["pkg/a.ts", "pkg/b.ts", "pkg/c.ts"], dir)).toBe(true);
  });

  it("missing files contribute nothing, same as the in-run gate", () => {
    writeFileSync(join(dir, "pkg", "a.ts"), "x");
    expect(wikiGroupEligible(["pkg/a.ts", "pkg/gone1.ts", "pkg/gone2.ts"], dir)).toBe(false);
  });
});
