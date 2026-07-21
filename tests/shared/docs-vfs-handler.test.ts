import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Pass-through the read-stability gate so SQL shapes stay exact (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import { handleDocsVfs } from "../../src/docs/vfs-handler.js";

const TBL = "hivemind_docs";

function metaRow(doc_id: string, over: Record<string, unknown> = {}) {
  return { id: `id-${doc_id}`, doc_id, version: 1, updated_at: "2026-07-01T10:00:00.000Z", status: "active", tier: "fast", ...over };
}
function fullRow(doc_id: string, content: string, over: Record<string, unknown> = {}) {
  return {
    id: `id-${doc_id}`, doc_id, path: `/docs/p/${doc_id}.md`, content,
    anchors: "[]", tier: "fast", status: "active", project: "p", version: 1,
    created_at: "2026-07-01T10:00:00.000Z", updated_at: "2026-07-01T10:00:00.000Z",
    agent: "m", plugin_version: "0", ...over,
  };
}

/** Route the query by SQL shape so one fake stands in for all three reads. */
function router(meta: Record<string, unknown>[], byIds: Record<string, unknown>[], latest: Record<string, unknown>[]) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (/SELECT id, doc_id, version/.test(sql)) return meta;
    if (/doc_id IN \(/.test(sql)) return byIds;
    if (/WHERE doc_id = /.test(sql)) return latest;
    return [];
  });
  return { calls, query };
}

describe("handleDocsVfs", () => {
  const corpus = [metaRow("src/graph/diff.ts"), metaRow("src/graph/cache.ts"), metaRow("src/docs/read.ts")];

  it("renders the root index (top directories) for '' and 'index.md'", async () => {
    for (const sub of ["", "index.md"]) {
      const { query } = router(corpus, [], []);
      const r = await handleDocsVfs(sub, query, TBL);
      expect(r.kind).toBe("ok");
      expect(r.kind === "ok" && r.body).toContain("# Docs Index");
      expect(r.kind === "ok" && r.body).toContain("[src/](src/index.md)");
    }
  });

  it("renders a directory index scoped by prefix, with summaries for direct files", async () => {
    const dirMeta = [metaRow("src/graph/diff.ts"), metaRow("src/graph/extract/python.ts")];
    const { calls, query } = router(dirMeta, [fullRow("src/graph/diff.ts", "# diff\n\nCompares snapshots.")], []);
    const r = await handleDocsVfs("src/graph/index.md", query, TBL);
    expect(r.kind).toBe("ok");
    // Metadata read is directory-scoped.
    expect(calls.some((c) => c.includes("doc_id LIKE 'src/graph/%'"))).toBe(true);
    if (r.kind === "ok") {
      expect(r.body).toContain("# Docs: src/graph/");
      expect(r.body).toContain("[extract/](extract/index.md)"); // subdir
      expect(r.body).toContain("Compares snapshots."); // summary of the direct file
    }
  });

  it("returns the doc content for a leaf '<file>.md'", async () => {
    const { calls, query } = router([], [], [fullRow("src/graph/diff.ts", "# diff\n\nThe diff doc body.")]);
    const r = await handleDocsVfs("src/graph/diff.ts.md", query, TBL);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("# src/graph/diff.ts");
      expect(r.body).toContain("The diff doc body.");
    }
    // It resolved by exact doc_id, stripping the .md suffix.
    expect(calls.some((c) => c.includes("WHERE doc_id = 'src/graph/diff.ts'"))).toBe(true);
  });

  it("prepends a staleness banner when a member file's fingerprint drifted from HEAD", async () => {
    const { query } = router([], [], [
      fullRow("src/graph/diff.ts", "# diff\n\nBody.", { source_fp: JSON.stringify({ "src/graph/diff.ts": "oldsha" }) }),
    ]);
    const git = (args: string[]) => (args[0] === "ls-tree" ? "100644 blob newsha\tsrc/graph/diff.ts\n" : null);
    const r = await handleDocsVfs("src/graph/diff.ts.md", query, TBL, { readerScope: "main", git });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("This page may be stale");
      expect(r.body).toContain("src/graph/diff.ts"); // names the changed file
      expect(r.body).toContain("Body."); // still serves the content
    }
  });

  it("no banner when the fingerprint still matches HEAD", async () => {
    const { query } = router([], [], [
      fullRow("src/graph/diff.ts", "# diff\n\nBody.", { source_fp: JSON.stringify({ "src/graph/diff.ts": "samesha" }) }),
    ]);
    const git = (args: string[]) => (args[0] === "ls-tree" ? "100644 blob samesha\tsrc/graph/diff.ts\n" : null);
    const r = await handleDocsVfs("src/graph/diff.ts.md", query, TBL, { readerScope: "main", git });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.body).not.toContain("may be stale");
  });

  it("serves THIS machine's private branch doc ahead of the cloud (and marks it private)", async () => {
    const privDir = mkdtempSync(join(tmpdir(), "vfs-priv-"));
    process.env.HIVEMIND_DOCS_PRIVATE_DIR = privDir;
    try {
      const { writePrivateDoc } = await import("../../src/docs/private-store.js");
      writePrivateDoc("p", "b:feat", {
        doc_id: "src/graph/diff.ts", path: "/docs/p/src/graph/diff.ts.md",
        content: "# private\n\nMy unpushed doc.", source_fp: `{"src/graph/diff.ts":"h"}`, tier: "fast", updated_at: "t1",
      });
      // Cloud has a main row; the private one must win for a b:feat reader.
      const { query } = router([], [], [fullRow("src/graph/diff.ts", "# cloud main", { scope: "main" })]);
      const git = (a: string[]) => (a[0] === "ls-tree" ? "100644 blob h\tsrc/graph/diff.ts\n" : null);
      const r = await handleDocsVfs("src/graph/diff.ts.md", query, TBL, { project: "p", readerScope: "b:feat", git });
      expect(r.kind).toBe("ok");
      if (r.kind === "ok") {
        expect(r.body).toContain("My unpushed doc.");
        expect(r.body).toContain("visibility: private");
        expect(r.body).not.toContain("cloud main");
      }
    } finally {
      delete process.env.HIVEMIND_DOCS_PRIVATE_DIR;
      rmSync(privDir, { recursive: true, force: true });
    }
  });

  it("returns not-found for a leaf whose doc does not exist", async () => {
    const { query } = router([], [], []);
    const r = await handleDocsVfs("src/graph/nope.ts.md", query, TBL);
    expect(r.kind).toBe("not-found");
    expect(r.kind === "not-found" && r.message).toContain("No such file");
  });
});

describe("handleDocsVfs — find/ search route", () => {
  const hitRows = [
    { path: "src/auth.ts", content: "# src/auth.ts\nHandles login and tokens." },
    { path: "src/session.ts", content: "# src/session.ts\nSession lifecycle." },
  ];

  it("empty query → usage message, no SQL", async () => {
    const query = vi.fn(async () => []);
    const r = await handleDocsVfs("find", query, TBL);
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && r.body).toContain("Usage:");
    expect(query).not.toHaveBeenCalled();
  });

  it("lexical (no embedder): lists ranked docs, marks (keyword)", async () => {
    const query = vi.fn(async (_sql: string) => hitRows);
    const r = await handleDocsVfs("find/login token", query, TBL);
    expect(r.kind).toBe("ok");
    const body = r.kind === "ok" ? r.body : "";
    expect(body).toContain('2 doc(s) match "login token" (keyword)');
    expect(body).toContain("## src/auth.ts");
    expect(body).toContain("## src/session.ts");
    // searched with an ILIKE over content, no cosine (no embedding provided)
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("ILIKE");
    expect(sql).not.toContain("<#>");
  });

  it("semantic (embedder returns a vector): marks (semantic + keyword) and runs cosine", async () => {
    const query = vi.fn(async (_sql: string) => hitRows);
    const embedQuery = vi.fn(async () => [0.1, 0.2, 0.3]);
    const r = await handleDocsVfs("find/where are tokens minted", query, TBL, { embedQuery });
    expect(embedQuery).toHaveBeenCalledOnce();
    const body = r.kind === "ok" ? r.body : "";
    expect(body).toContain("(semantic + keyword)");
    expect((query.mock.calls[0][0] as string)).toContain("content_embedding <#>");
  });

  it("no matches → friendly empty message", async () => {
    const query = vi.fn(async () => []);
    const r = await handleDocsVfs("find/nonexistent thing", query, TBL);
    expect(r.kind === "ok" && r.body).toContain('No docs match "nonexistent thing"');
  });

  it("does NOT swallow docs under a real find/ source directory — .md paths fall through to leaf resolution", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("WHERE doc_id = 'find/lookup.ts'")
        ? [{ id: "r1", doc_id: "find/lookup.ts", path: "/docs/p/find/lookup.ts.md", content: "# find/lookup.ts\n\nLookup doc body.", anchors: "[]", tier: "fast", status: "active", project: "", scope: "main", version: 1, created_at: "t", updated_at: "t", agent: "m", plugin_version: "0" }]
        : []);
    const r = await handleDocsVfs("find/lookup.ts.md", query, TBL);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body).toContain("Lookup doc body.");
      expect(r.body).not.toContain("doc(s) match"); // not the search route
    }
    expect(query.mock.calls.some((c) => (c[0] as string).includes("WHERE doc_id = 'find/lookup.ts'"))).toBe(true);
  });
});
