import { describe, expect, it } from "vitest";
import { buildDocsIndex, dirOf, firstDocLine, type DocMeta } from "../../src/docs/index-render.js";

function m(doc_id: string, over: Partial<DocMeta> = {}): DocMeta {
  return { doc_id, version: 1, updated_at: "2026-07-01T10:00:00.000Z", status: "active", tier: "fast", ...over };
}

describe("dirOf", () => {
  it("returns the parent directory, or '' for a top-level file", () => {
    expect(dirOf("src/graph/diff.ts")).toBe("src/graph");
    expect(dirOf("index.ts")).toBe("");
  });
});

describe("firstDocLine", () => {
  it("skips the leading heading, blank lines, and the --- separator", () => {
    expect(firstDocLine("# Title\n\n---\nThe real summary line.\nmore")).toBe("The real summary line.");
  });
  it("truncates long lines with an ellipsis", () => {
    expect(firstDocLine("x".repeat(200), 20)).toMatch(/…$/);
    expect(firstDocLine("x".repeat(200), 20).length).toBeLessThanOrEqual(20);
  });
  it("returns empty string when there is no prose", () => {
    expect(firstDocLine("# Only\n## Headings")).toBe("");
  });
});

describe("buildDocsIndex", () => {
  const corpus: DocMeta[] = [
    m("src/graph/diff.ts", { version: 2 }),
    m("src/graph/cache.ts"),
    m("src/graph/extract/python.ts"),
    m("src/graph/extract/rust.ts"),
    m("src/docs/read.ts"),
    m("README.md"), // top-level file
    m("src/graph/gone.ts", { status: "archived" }),
  ];

  it("root groups by immediate subdirectory and lists top-level files, not the whole tree", () => {
    const out = buildDocsIndex(corpus, "");
    // Immediate children of root: the `src` directory + the README file.
    expect(out).toContain("[src/](src/index.md)");
    expect(out).toContain("[README.md](README.md.md)");
    // It must NOT flatten deep files into the root view.
    expect(out).not.toContain("diff.ts");
    expect(out).not.toContain("python.ts");
  });

  it("drilling into a directory shows its immediate subdirs AND its direct files", () => {
    const out = buildDocsIndex(corpus, "src/graph");
    expect(out).toContain("# Docs: src/graph/");
    expect(out).toContain("[extract/](extract/index.md)"); // subdir with 2 docs
    expect(out).toContain("| [extract/](extract/index.md) | 2 |");
    expect(out).toContain("[diff.ts](diff.ts.md)"); // direct file
    expect(out).toContain("[cache.ts](cache.ts.md)");
    expect(out).toContain("v2"); // diff.ts is version 2
    // extract/*.ts are under a subdir, not direct files here
    expect(out).not.toContain("[python.ts]");
  });

  it("shows the Summary column only when a summary is provided", () => {
    const withSummary = buildDocsIndex(corpus, "src/docs", new Map([["src/docs/read.ts", "Read helpers."]]));
    expect(withSummary).toContain("| File | Version | Updated | Summary |");
    expect(withSummary).toContain("Read helpers.");
    const without = buildDocsIndex(corpus, "src/docs");
    expect(without).toContain("| File | Version | Updated |");
    expect(without).not.toContain("Summary");
  });

  it("excludes archived docs from the tree but counts them in the footer", () => {
    const out = buildDocsIndex(corpus, "src/graph");
    expect(out).not.toContain("gone.ts"); // archived → not shown
    // 6 active total across the corpus, 1 archived.
    expect(out).toMatch(/6 active doc\(s\), 1 archived\./);
  });

  it("renders an empty-state line when a directory has no docs", () => {
    expect(buildDocsIndex([], "")).toContain("no docs yet");
    expect(buildDocsIndex(corpus, "src/nowhere")).toContain("no docs under src/nowhere/");
  });
});
