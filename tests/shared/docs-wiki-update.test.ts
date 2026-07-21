import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import {
  buildUpdatePrompt,
  shouldEscalate,
  updateWikiPage,
  NO_CHANGE,
  DEFAULT_MAX_PATCHES,
  DEFAULT_WIKI_MAX_CHANGED_LINES,
} from "../../src/docs/wiki-update.js";
import { appendFilesIndex, collectWikiAnchors } from "../../src/docs/wiki-generate.js";
import type { DocRow } from "../../src/docs/read.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, file: string, loc: string): GraphNode {
  return { id, label: id, kind: "function", source_file: file, source_location: loc, language: "typescript", exported: true };
}
function snap(nodes: GraphNode[]): GraphSnapshot {
  return { nodes, links: [] } as unknown as GraphSnapshot;
}

const noEscalation = { membershipChanged: false, signatureChanges: 0, patchCount: 0 };

describe("shouldEscalate", () => {
  it("passes a quiet window through", () => {
    expect(shouldEscalate(noEscalation)).toEqual({ escalate: false, reasons: [] });
  });
  it("fires on membership change, mass signature changes, and patch-budget exhaustion", () => {
    expect(shouldEscalate({ ...noEscalation, membershipChanged: true }).escalate).toBe(true);
    expect(shouldEscalate({ ...noEscalation, signatureChanges: 6 }).escalate).toBe(true);
    expect(shouldEscalate({ ...noEscalation, patchCount: DEFAULT_MAX_PATCHES }).escalate).toBe(true);
    const all = shouldEscalate({ membershipChanged: true, signatureChanges: 99, patchCount: 99 });
    expect(all.reasons).toHaveLength(3);
  });
  it("thresholds are overridable", () => {
    expect(shouldEscalate({ ...noEscalation, signatureChanges: 6, maxSignatureChanges: 10 }).escalate).toBe(false);
    expect(shouldEscalate({ ...noEscalation, patchCount: 3, maxPatches: 3 }).escalate).toBe(true);
  });
});

describe("buildUpdatePrompt", () => {
  it("embeds the page, the diff, and the NO_CHANGE + no-rephrase contract", () => {
    const p = buildUpdatePrompt("src/docs", "## Purpose\nOld truth.", "- old\n+ new");
    expect(p).toContain("`src/docs`");
    expect(p).toContain("Old truth.");
    expect(p).toContain("- old\n+ new");
    expect(p).toContain(NO_CHANGE);
    expect(p).toContain("Do NOT rephrase");
  });
});

describe("updateWikiPage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-wupd-"));
    mkdirSync(join(dir, "pkg", "core"), { recursive: true });
    writeFileSync(join(dir, "pkg", "core", "a.ts"), "export function foo() {\n  return 1;\n}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const FILES = ["pkg/core/a.ts"];
  const SNAP = () => snap([node("pkg/core/a.ts:foo:function", "pkg/core/a.ts", "L1-L3")]);

  function page(content: string, anchors: DocRow["anchors"] = []): DocRow {
    return {
      id: "p|main|wiki/pkg/core", doc_id: "wiki/pkg/core", path: "/docs/p/wiki/pkg/core.md",
      content, anchors, tier: "slow", status: "active", project: "p", scope: "main",
      version: 1, created_at: "t0", updated_at: "t0", agent: "docs-wiki", plugin_version: "0",
    };
  }

  function mockQuery(selects: Array<Array<Record<string, unknown>>>) {
    const calls: string[] = [];
    let i = 0;
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (/^SELECT/i.test(sql.trim())) return selects[Math.min(i++, selects.length - 1)] ?? [];
      return [];
    });
    return { calls, query };
  }

  /** A page whose content and anchors already match the current mechanics. */
  function freshPage(narrative: string): DocRow {
    const anchors = collectWikiAnchors(SNAP(), FILES, dir);
    return page(appendFilesIndex(narrative, FILES), anchors);
  }

  const rowFor = (p: DocRow): Record<string, unknown> => ({ ...p, anchors: JSON.stringify(p.anchors) });

  it("NO_CHANGE with fresh mechanics: no write at all", async () => {
    const { calls, query } = mockQuery([]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: freshPage("## Purpose\nTruth."), pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "(no relevant diff)",
      run: async () => NO_CHANGE, escalation: noEscalation,
    });
    expect(out).toEqual({ action: "no_change" });
    expect(calls).toHaveLength(0);
  });

  it("NO_CHANGE with drifted anchors: mechanics refreshed via ONE UPDATE", async () => {
    const p = page(appendFilesIndex("## Purpose\nTruth.", FILES), [{ symbol_id: "stale", content_hash: "old" }]);
    const { calls, query } = mockQuery([[rowFor(p)]]); // editDoc's getDocLatest read
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "d",
      run: async () => NO_CHANGE, escalation: noEscalation,
    });
    expect(out).toEqual({ action: "mechanics_refreshed", version: 2 });
    const writes = calls.filter((c) => /^UPDATE/i.test(c));
    expect(writes).toHaveLength(1); // single UPDATE — coalescing rule
    expect(writes[0]).toContain("pkg/core/a.ts:foo:function"); // fresh anchor
    // editDoc's read is project-scoped (shared-table safety).
    expect(calls[0]).toContain(`project = 'p'`);
  });

  it("a real patch within budget lands as ONE UPDATE with the mechanical index intact", async () => {
    const p = freshPage("## Purpose\nfoo returns 0.");
    const { calls, query } = mockQuery([[rowFor(p)]]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "- return 0\n+ return 1",
      run: async () => "## Purpose\nfoo returns 1.", escalation: noEscalation,
    });
    expect(out.action).toBe("patched");
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).toContain("foo returns 1.");
    expect(update).toContain("## Files"); // mechanics re-appended by code
    expect(calls.filter((c) => /^UPDATE/i.test(c))).toHaveLength(1);
  });

  it("on a branch, patches a main-based page as a copy-on-write overlay (never UPDATEs main)", async () => {
    // page resolved to scope 'main' (the base), but we write to 'b:feat'. The
    // write must CREATE the overlay via upsert (DELETE+INSERT at the overlay id),
    // and must not UPDATE the main row.
    const p = freshPage("## Purpose\nfoo returns 0.");
    const { calls, query } = mockQuery([]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, scope: "b:feat", pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "- return 0\n+ return 1",
      run: async () => "## Purpose\nfoo returns 1.", escalation: noEscalation,
    });
    expect(out.action).toBe("patched");
    expect(calls.some((c) => /^UPDATE/i.test(c))).toBe(false); // main untouched
    const insert = calls.find((c) => /^INSERT/i.test(c))!;
    expect(insert).toContain("'p|b:feat|wiki/pkg/core'"); // overlay row id
    expect(insert).toContain("foo returns 1.");
    const del = calls.find((c) => /^DELETE/i.test(c))!;
    expect(del).toContain("scope = 'b:feat'");   // delete confined to the overlay scope
    expect(del).not.toContain("scope = 'main'"); // main row is safe
  });

  it("strips a chatty preamble before the first heading — caught live in the tick e2e", async () => {
    const p = freshPage("## Purpose\nfoo returns 0.");
    const { calls, query } = mockQuery([[rowFor(p)]]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "- return 0\n+ return 1",
      run: async () => "Looking at the diff, the page is contradicted.\n\nHere's the corrected page:\n\n## Purpose\nfoo returns 1.",
      escalation: noEscalation,
    });
    expect(out.action).toBe("patched");
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).toContain("foo returns 1.");
    expect(update).not.toContain("Looking at the diff");
    expect(update).not.toContain("corrected page");
  });

  it("unwraps an outer code fence around the patched page", async () => {
    const p = freshPage("## Purpose\nfoo returns 0.");
    const { calls, query } = mockQuery([[rowFor(p)]]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "- return 0\n+ return 1",
      run: async () => "```markdown\n## Purpose\nfoo returns 1.\n```",
      escalation: noEscalation,
    });
    expect(out.action).toBe("patched");
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).toContain("foo returns 1.");
    expect(update).not.toContain("```markdown");
  });

  it("a heading-less reply is a failed patch, never stored as documentation", async () => {
    const p = freshPage("## Purpose\nfoo returns 0.");
    const { calls, query } = mockQuery([]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "d",
      run: async () => "I checked the diff and the page seems mostly fine to me.",
      escalation: noEscalation,
    });
    expect(out).toEqual({ action: "failed", reason: "patch response has no markdown heading — not a page" });
    expect(calls).toHaveLength(0); // nothing written
  });

  it("a patch that rewrites the whole page escalates instead of writing", async () => {
    const p = freshPage("## Purpose\nA.\nB.\nC.");
    const { calls, query } = mockQuery([]);
    const huge = "## Purpose\n" + Array.from({ length: DEFAULT_WIKI_MAX_CHANGED_LINES + 20 }, (_, i) => `rewritten line ${i}`).join("\n");
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: p, pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "d",
      run: async () => huge, escalation: noEscalation,
    });
    expect(out.action).toBe("escalate");
    expect((out as { reasons: string[] }).reasons.join(" ")).toMatch(/bounded-change budget/);
    expect(calls.filter((c) => /^UPDATE/i.test(c))).toHaveLength(0);
  });

  it("pre-flight escalation short-circuits BEFORE calling the LLM", async () => {
    const run = vi.fn(async () => NO_CHANGE);
    const { query } = mockQuery([]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: freshPage("x"), pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "d",
      run, escalation: { ...noEscalation, membershipChanged: true },
    });
    expect(out.action).toBe("escalate");
    expect(run).not.toHaveBeenCalled();
  });

  it("LLM failure is reported, nothing written (missing beats stale-green)", async () => {
    const { calls, query } = mockQuery([]);
    const out = await updateWikiPage({
      query, tableName: "hivemind_docs", page: freshPage("x"), pageKey: "pkg/core",
      files: FILES, snap: SNAP(), repoRoot: dir, diff: "d",
      run: async () => { throw new Error("LLM down"); }, escalation: noEscalation,
    });
    expect(out).toEqual({ action: "failed", reason: "update failed: LLM down" });
    expect(calls).toHaveLength(0);
  });
});
