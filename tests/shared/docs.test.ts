import { describe, expect, it, beforeEach, vi } from "vitest";

// The read-stability gate (stableUnionRows) re-reads with delays in production
// to defeat the Deeplake partial-read bug. In these unit tests we stub it to a
// single pass-through query so call-count / SQL-shape assertions stay exact and
// fast. The gate's own behavior is covered in docs-stable-read.test.ts.
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));
import {
  insertDoc,
  insertDocResilient,
  upsertDoc,
  editDoc,
  setDoc,
  archiveDoc,
  listDocs,
  listDocMeta,
  listDocsByIds,
  getDocLatest,
  parseAnchors,
  _MAX_CONTENT_LENGTH,
  type DocRow,
} from "../../src/docs/index.js";

/**
 * Mock query helper. Each script step receives the SQL and returns rows
 * (or throws). The harness captures every SQL string for shape + count
 * assertions — see CLAUDE.md "mock the network boundary, not the module
 * under test" for the rationale.
 */
function mockQuery(script: Array<(sql: string) => unknown>) {
  const calls: string[] = [];
  let step = 0;
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (step < script.length) {
      const out = script[step++](sql);
      return Array.isArray(out) ? (out as Array<Record<string, unknown>>) : [];
    }
    return [];
  });
  return { calls, query };
}

const TBL = "hivemind_docs";

/**
 * Build a fake row matching DOCS_COLUMNS shape as the Deeplake client
 * returns it — note `anchors` arrives as a JSON STRING (TEXT column).
 */
function fakeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "row-uuid",
    doc_id: "src/shell/deeplake-fs.ts",
    path: "/docs/myproj/deeplake-fs.ts.md",
    content: "# deeplake-fs\n\nThe VFS.",
    anchors: JSON.stringify([{ symbol_id: "src/shell/deeplake-fs.ts:readFile:function", content_hash: "abc123" }]),
    tier: "fast",
    status: "active",
    project: "myproj",
    version: 1,
    created_at: "2026-05-20T10:00:00.000Z",
    updated_at: "2026-05-20T10:00:00.000Z",
    agent: "manual",
    plugin_version: "0.7.105",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ── insertDoc ─────────────────────────────────────────────────────────────────

describe("insertDoc", () => {
  it("INSERTs a v1 row, both timestamps equal, content + anchors as E-strings", async () => {
    const { calls, query } = mockQuery([() => []]);
    const result = await insertDoc(query, TBL, {
      doc_id: "src/shell/deeplake-fs.ts",
      path: "/docs/myproj/deeplake-fs.ts.md",
      content: "# deeplake-fs",
      anchors: [{ symbol_id: "src/shell/deeplake-fs.ts:readFile:function", content_hash: "abc123" }],
      project: "myproj",
    });
    expect(result).toEqual({ doc_id: "src/shell/deeplake-fs.ts", version: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^INSERT INTO "hivemind_docs"/);
    // version literal is 1, never quoted
    expect(calls[0]).toMatch(/, 1, /);
    expect(calls[0]).toContain("'active'");
    expect(calls[0]).toContain("'myproj'");
    // content + anchors use E-string literals so backslashes / quotes stay safe
    expect(calls[0]).toContain(`E'# deeplake-fs'`);
    expect(calls[0]).toContain(`E'[{"symbol_id":"src/shell/deeplake-fs.ts:readFile:function","content_hash":"abc123"}]'`);
    // tier defaults to fast on first insert
    expect(calls[0]).toContain("'fast'");
    // created_at and updated_at are stamped identically at insert time
    const stamps = calls[0].match(/'(\d{4}-\d{2}-\d{2}T[\d:.]+Z)'/g);
    expect(stamps).not.toBeNull();
    expect(stamps!.length).toBeGreaterThanOrEqual(2);
    expect(stamps![0]).toBe(stamps![1]);
  });

  it("PRESERVES newlines in markdown content (docs are multi-line, unlike rules)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertDoc(query, TBL, {
      doc_id: "a.ts",
      path: "/docs/p/a.ts.md",
      content: "# Title\n\n- bullet one\n- bullet two",
    });
    // Newlines survive into the E-string body — no rejection, no mangling.
    expect(calls[0]).toContain("# Title\n\n- bullet one\n- bullet two");
  });

  it("escapes SQL-special characters in content and anchors", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertDoc(query, TBL, {
      doc_id: "a.ts",
      path: "/docs/p/a.ts.md",
      content: "don't `rm -rf /` \\ ever",
    });
    expect(calls[0]).toContain(`E'don''t \`rm -rf /\` \\\\ ever'`);
  });

  it("defaults anchors to [] and tier to fast when omitted", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertDoc(query, TBL, { doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "x" });
    expect(calls[0]).toContain(`E'[]'`);
    expect(calls[0]).toContain("'fast'");
    expect(calls[0]).toContain("'manual'");
  });

  it("writes the slow tier when requested", async () => {
    const { calls, query } = mockQuery([() => []]);
    await insertDoc(query, TBL, { doc_id: "_project", path: "/docs/p/_project.md", content: "x", tier: "slow" });
    expect(calls[0]).toContain("'slow'");
  });

  it("rejects empty content", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertDoc(query, TBL, { doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "" }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(0);
  });

  it("rejects empty doc_id", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      insertDoc(query, TBL, { doc_id: "", path: "/docs/p/a.ts.md", content: "x" }),
    ).rejects.toThrow(/doc_id must not be empty/);
    expect(calls).toHaveLength(0);
  });

  it(`rejects content longer than ${_MAX_CONTENT_LENGTH} chars`, async () => {
    const { calls, query } = mockQuery([() => []]);
    const oversized = "x".repeat(_MAX_CONTENT_LENGTH + 1);
    await expect(
      insertDoc(query, TBL, { doc_id: "a.ts", path: "/docs/p/a.ts.md", content: oversized }),
    ).rejects.toThrow(/exceeds 50000 chars/);
    expect(calls).toHaveLength(0);
  });

  it("rejects SQL-identifier injection in the table name", async () => {
    const { query } = mockQuery([() => []]);
    await expect(
      insertDoc(query, `x"; DROP TABLE y; --`, { doc_id: "a.ts", path: "/p", content: "x" }),
    ).rejects.toThrow();
  });
});

// ── insertDocResilient (timeout-safe write — the bulk-generate reliability fix) ─

describe("insertDocResilient", () => {
  const noSleep = async () => {};
  const timeout = () => {
    throw new Error("Query timeout after 10000ms");
  };

  it("retries a timed-out INSERT and succeeds on the next attempt", async () => {
    // INSERT times out → read-back finds nothing → INSERT again → ok.
    const { calls, query } = mockQuery([timeout, () => [], () => []]);
    const result = await insertDocResilient(
      query,
      TBL,
      { doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "x" },
      { sleep: noSleep },
    );
    expect(result).toEqual({ doc_id: "a.ts", version: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(/^INSERT INTO/);
    expect(calls[1]).toMatch(/^SELECT/); // the landed-check read-back
    expect(calls[2]).toMatch(/^INSERT INTO/);
  });

  it("does NOT re-insert when the timed-out write actually landed (no forked v1)", async () => {
    // INSERT times out client-side but committed server-side → read-back finds
    // the row → return it, issue no second INSERT.
    const { calls, query } = mockQuery([timeout, () => [fakeRow({ doc_id: "a.ts", version: 1 })]]);
    const result = await insertDocResilient(
      query,
      TBL,
      { doc_id: "a.ts", path: "/docs/p/a.ts.md", content: "x" },
      { sleep: noSleep },
    );
    expect(result).toEqual({ doc_id: "a.ts", version: 1 });
    expect(calls).toHaveLength(2);
    expect(calls.filter(c => c.startsWith("INSERT INTO"))).toHaveLength(1);
  });

  it("surfaces a non-timeout error immediately without retrying", async () => {
    const { calls, query } = mockQuery([
      () => {
        throw new Error("Query failed: 403: forbidden");
      },
    ]);
    await expect(
      insertDocResilient(query, TBL, { doc_id: "a.ts", path: "/p", content: "x" }, { sleep: noSleep }),
    ).rejects.toThrow(/403/);
    expect(calls).toHaveLength(1);
  });

  it("gives up after the retry budget and throws the timeout", async () => {
    // Every INSERT times out, read-back never finds the row.
    const { calls, query } = mockQuery([timeout, () => [], timeout, () => [], timeout]);
    await expect(
      insertDocResilient(
        query,
        TBL,
        { doc_id: "a.ts", path: "/p", content: "x" },
        { retries: 2, sleep: noSleep },
      ),
    ).rejects.toThrow(/timeout/);
    // 3 INSERT attempts (retries=2) + 2 read-backs between them.
    expect(calls.filter(c => c.startsWith("INSERT INTO"))).toHaveLength(3);
  });
});

// ── upsertDoc (idempotent generate-write — the duplicate-row fix) ─────────────

describe("upsertDoc", () => {
  const noSleep = async () => {};
  const timeout = () => { throw new Error("Query timeout after 10000ms"); };

  it("DELETEs by deterministic id=project|scope|doc_id then INSERTs exactly one row", async () => {
    const { calls, query } = mockQuery([() => [], () => []]);
    const res = await upsertDoc(query, TBL, { doc_id: "src/a.ts", path: "/docs/p/a.ts.md", content: "x", project: "p" });
    expect(res).toEqual({ doc_id: "src/a.ts", version: 1 });
    expect(calls).toHaveLength(2);
    // The DELETE clears the namespaced id AND the legacy bare-doc_id row, so
    // pre-scope tables converge instead of accumulating a duplicate doc_id.
    // The legacy clause is constrained to THIS project AND THIS scope — another
    // project's legacy row, or a SIBLING scope (a branch overlay / the canonical
    // main row) with the same bare doc_id, must survive in a shared table.
    expect(calls[0]).toBe(
      `DELETE FROM "hivemind_docs" WHERE id = 'p|main|src/a.ts' OR (doc_id = 'src/a.ts' AND project = 'p' AND scope = 'main')`,
    );
    expect(calls[1]).toMatch(/^INSERT INTO "hivemind_docs"/);
    // id column is the deterministic composite, NOT a random uuid
    expect(calls[1]).toContain(`'p|main|src/a.ts', 'src/a.ts',`);
    expect(calls[1]).toContain(`'p', 'main', E'{}', 1, `); // project, scope, source_fp, version 1
  });

  it("writing a branch overlay scopes the DELETE — never touches the main row", async () => {
    // The regression that motivated the scope guard: a branch/user overlay
    // (scope = u:<user>|b:<branch>) shares (project, doc_id) with the canonical
    // main row. Without the scope guard, the legacy convergence clause would
    // delete main when writing the overlay, silently destroying the shared doc.
    const { calls, query } = mockQuery([() => [], () => []]);
    await upsertDoc(query, TBL, {
      doc_id: "src/a.ts", path: "/docs/p/a.ts.md", content: "x", project: "p",
      scope: "u:alice|b:feature",
    });
    // DELETE targets ONLY this overlay's id + same-scope duplicates. The main
    // row (scope='main') is not in the predicate, so it survives.
    expect(calls[0]).toBe(
      `DELETE FROM "hivemind_docs" WHERE id = 'p|u:alice|b:feature|src/a.ts' ` +
      `OR (doc_id = 'src/a.ts' AND project = 'p' AND scope = 'u:alice|b:feature')`,
    );
    expect(calls[0]).not.toContain("scope = 'main'");
    expect(calls[1]).toContain(`'p', 'u:alice|b:feature', E'{}', 1, `); // project, overlay scope, source_fp
  });

  it("retry after a timeout re-runs DELETE+INSERT — never forks a second row", async () => {
    // 1st DELETE ok, INSERT times out; retry: DELETE ok, INSERT ok.
    const { calls, query } = mockQuery([() => [], timeout, () => [], () => []]);
    const res = await upsertDoc(query, TBL, { doc_id: "src/a.ts", path: "/p", content: "x" }, { sleep: noSleep });
    expect(res).toEqual({ doc_id: "src/a.ts", version: 1 });
    // exactly one INSERT succeeds; the DELETE on retry guarantees single-row.
    // Deterministic script: DELETE ok, INSERT timeout, DELETE ok, INSERT ok —
    // exact counts, so an extra retry loop or forked write fails the test.
    const inserts = calls.filter(c => c.startsWith("INSERT INTO"));
    const deletes = calls.filter(c => c.startsWith("DELETE FROM"));
    expect(inserts).toHaveLength(2);
    expect(deletes).toHaveLength(2); // every INSERT preceded by a DELETE
  });

  it("surfaces a non-timeout error immediately (no retry)", async () => {
    const { calls, query } = mockQuery([() => [], () => { throw new Error("403 forbidden"); }]);
    await expect(
      upsertDoc(query, TBL, { doc_id: "src/a.ts", path: "/p", content: "x" }, { sleep: noSleep }),
    ).rejects.toThrow(/403/);
    expect(calls).toHaveLength(2); // DELETE + the failing INSERT, no retry
  });
});

// ── editDoc ───────────────────────────────────────────────────────────────────

describe("editDoc", () => {
  it("reads latest, then UPDATEs in place bumping version; created_at untouched, updated_at advances", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ id: "row-1", version: 1, content: "old", created_at: "2026-05-20T10:00:00.000Z" })],
      () => [],
    ]);
    const result = await editDoc(query, TBL, { doc_id: "src/shell/deeplake-fs.ts", content: "new" });
    expect(result).toEqual({ doc_id: "src/shell/deeplake-fs.ts", version: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^SELECT .* FROM "hivemind_docs" WHERE doc_id = 'src\/shell\/deeplake-fs.ts'$/);
    // UPDATE-in-place, targeting the exact row by id.
    expect(calls[1]).toMatch(/^UPDATE "hivemind_docs" SET/);
    expect(calls[1]).toContain(`E'new'`);
    expect(calls[1]).toContain("version = 2");
    expect(calls[1]).toContain(`WHERE id = 'row-1'`);
    // created_at is immutable → the UPDATE must NOT touch it.
    expect(calls[1]).not.toContain("created_at");
    // updated_at advances to a fresh "now" timestamp.
    expect(calls[1]).toMatch(/updated_at = '\d{4}-\d{2}-\d{2}T[\d:.]+Z'/);
  });

  it("carries over previous content + anchors when only status changes", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 3, content: "preserve me" })],
      () => [],
    ]);
    const result = await editDoc(query, TBL, { doc_id: "src/shell/deeplake-fs.ts", status: "archived" });
    expect(result.version).toBe(4);
    expect(calls[1]).toContain(`E'preserve me'`);
    expect(calls[1]).toContain("'archived'");
    // prior anchors round-trip through serialize unchanged
    expect(calls[1]).toContain(`content_hash":"abc123`);
  });

  it("replaces anchors when new ones are supplied", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1 })],
      () => [],
    ]);
    await editDoc(query, TBL, {
      doc_id: "src/shell/deeplake-fs.ts",
      content: "refreshed",
      anchors: [{ symbol_id: "src/shell/deeplake-fs.ts:writeFile:function", content_hash: "def456" }],
    });
    expect(calls[1]).toContain("def456");
    expect(calls[1]).not.toContain("abc123");
  });

  it("throws when doc_id does not exist (SELECT only, no wasted INSERT)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(
      editDoc(query, TBL, { doc_id: "missing.ts", content: "x" }),
    ).rejects.toThrow(/Doc not found: missing.ts/);
    expect(calls).toHaveLength(1);
  });

  it("rejects empty content on edit, leaving the SELECT-but-no-INSERT trail", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ version: 1 })],
      () => [],
    ]);
    await expect(
      editDoc(query, TBL, { doc_id: "src/shell/deeplake-fs.ts", content: "" }),
    ).rejects.toThrow(/must not be empty/);
    expect(calls).toHaveLength(1); // SELECT only
  });
});

// ── setDoc (idempotent upsert — the fork-history fix) ─────────────────────────

describe("editDoc embedding policy (stale vectors)", () => {
  const prevRow = () => [{ id: "r1", doc_id: "a.ts", version: 1, content: "old body", anchors: "[]", tier: "fast", status: "active", project: "p", created_at: "t", updated_at: "t" }];

  it("CONTENT change without a fresh vector NULLs the embedding (reindex heals missing, never stale)", async () => {
    const { calls, query } = mockQuery([prevRow, () => []]);
    await editDoc(query, TBL, { doc_id: "a.ts", content: "new body" });
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).toContain("content_embedding = NULL");
  });

  it("STATUS-ONLY edit leaves the existing embedding untouched", async () => {
    const { calls, query } = mockQuery([prevRow, () => []]);
    await editDoc(query, TBL, { doc_id: "a.ts", status: "archived" });
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).not.toContain("content_embedding");
  });

  it("a fresh vector always wins", async () => {
    const { calls, query } = mockQuery([prevRow, () => []]);
    await editDoc(query, TBL, { doc_id: "a.ts", content: "new body", content_embedding: [0.5] });
    const update = calls.find((c) => /^UPDATE/i.test(c))!;
    expect(update).toContain("content_embedding = ARRAY[0.5]");
  });
});

describe("setDoc", () => {
  it("INSERTs v1 when the doc_id does not exist yet", async () => {
    const { calls, query } = mockQuery([
      () => [], // getDocLatest → none
      () => [], // INSERT
    ]);
    const result = await setDoc(query, TBL, {
      doc_id: "src/a.ts",
      path: "/docs/p/a.ts.md",
      content: "first",
      project: "p",
    });
    expect(result).toEqual({ doc_id: "src/a.ts", version: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^SELECT .* WHERE doc_id = 'src\/a.ts'/);
    expect(calls[1]).toMatch(/^INSERT INTO "hivemind_docs"/);
    expect(calls[1]).toMatch(/, 1, /);
  });

  it("propagates a new project on a version bump (not frozen at the old value)", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ doc_id: "src/a.ts", version: 1, project: "old-proj" })],
      () => [],
    ]);
    await setDoc(query, TBL, {
      doc_id: "src/a.ts",
      path: "/docs/p/a.ts.md",
      content: "updated",
      project: "new-proj",
    });
    expect(calls[1]).toContain("'new-proj'");
    expect(calls[1]).not.toContain("'old-proj'");
  });

  it("UPDATEs the existing row in place (bumping version), never a second row", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ id: "row-9", doc_id: "src/a.ts", version: 4, created_at: "2026-01-01T00:00:00.000Z" })],
      () => [],
    ]);
    const result = await setDoc(query, TBL, {
      doc_id: "src/a.ts",
      path: "/docs/p/a.ts.md",
      content: "updated",
      project: "p",
    });
    expect(result).toEqual({ doc_id: "src/a.ts", version: 5 });
    expect(calls).toHaveLength(2);
    // A single UPDATE of the existing row — one row per doc, no new INSERT.
    expect(calls[1]).toMatch(/^UPDATE "hivemind_docs" SET/);
    expect(calls[1]).not.toMatch(/^INSERT/);
    expect(calls[1]).toContain("version = 5");
    expect(calls[1]).toContain(`WHERE id = 'row-9'`);
    // created_at is immutable → not part of the UPDATE.
    expect(calls[1]).not.toContain("created_at");
    expect(calls[1]).toContain(`E'updated'`);
  });
});

// ── archiveDoc (soft delete primitive) ────────────────────────────────────────

describe("archiveDoc", () => {
  it("appends a version with status='archived', preserving content", async () => {
    const { calls, query } = mockQuery([
      () => [fakeRow({ doc_id: "src/gone.ts", version: 2, content: "keep me" })],
      () => [],
    ]);
    const result = await archiveDoc(query, TBL, { doc_id: "src/gone.ts" });
    expect(result.version).toBe(3);
    expect(calls[1]).toContain("'archived'");
    expect(calls[1]).toContain(`E'keep me'`);
  });

  it("throws when archiving a doc that does not exist", async () => {
    const { calls, query } = mockQuery([() => []]);
    await expect(archiveDoc(query, TBL, { doc_id: "nope.ts" })).rejects.toThrow(/Doc not found/);
    expect(calls).toHaveLength(1);
  });
});

// ── listDocs ──────────────────────────────────────────────────────────────────

describe("listDocs", () => {
  it("returns latest version per doc_id, active only, newest-first by updated_at, default limit 200", async () => {
    const { calls, query } = mockQuery([
      () => [
        fakeRow({ id: "a2", doc_id: "A", version: 2, content: "A v2", updated_at: "2026-05-20T10:02:00Z" }),
        fakeRow({ id: "a1", doc_id: "A", version: 1, content: "A v1", updated_at: "2026-05-20T10:01:00Z" }),
        fakeRow({ id: "b1", doc_id: "B", version: 1, content: "B v1", updated_at: "2026-05-20T10:00:00Z" }),
        fakeRow({ id: "c1", doc_id: "C", version: 1, status: "archived", content: "C arch", updated_at: "2026-05-20T09:59:00Z" }),
      ],
      () => [],
    ]);
    const rows = await listDocs(query, TBL);
    expect(rows.map(r => r.doc_id)).toEqual(["A", "B"]);
    expect(rows[0].content).toBe("A v2");
    expect(rows[0].version).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^SELECT .* FROM "hivemind_docs" ORDER BY version DESC, updated_at DESC, id DESC$/);
  });

  it("honors status='all'", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ doc_id: "A", version: 1, status: "active" }),
        fakeRow({ doc_id: "B", version: 1, status: "archived" }),
      ],
    ]);
    const rows = await listDocs(query, TBL, { status: "all" });
    expect(rows.map(r => r.doc_id).sort()).toEqual(["A", "B"]);
  });

  it("readerScope resolves each doc to the reader's overlay, else main (branch view)", async () => {
    const { calls, query } = mockQuery([
      () => [
        // page A: main + a b:feat overlay -> reader on b:feat sees the overlay
        fakeRow({ id: "am", doc_id: "A", version: 9, content: "A main", scope: "main" }),
        fakeRow({ id: "ao", doc_id: "A", version: 1, content: "A overlay", scope: "b:feat" }),
        // page B: only main -> falls back to main
        fakeRow({ id: "bm", doc_id: "B", version: 1, content: "B main", scope: "main" }),
        // page C: only a FOREIGN branch overlay -> hidden (no row surfaces)
        fakeRow({ id: "co", doc_id: "C", version: 1, content: "C other", scope: "b:other" }),
      ],
    ]);
    const rows = await listDocs(query, TBL, { readerScope: "b:feat" });
    const byId = new Map(rows.map(r => [r.doc_id, r.content]));
    expect(byId.get("A")).toBe("A overlay");
    expect(byId.get("B")).toBe("B main");
    expect(byId.has("C")).toBe(false); // foreign overlay never surfaces
    expect(calls[0]).toContain(", scope, source_fp FROM"); // scope column selected in this mode
  });

  it("union order cannot resurrect a stale version: v1 seen FIRST, v2 still wins", async () => {
    // stableUnionRows returns first-seen order across re-reads — the SQL
    // ORDER BY does not survive it. The latest pick must be by comparison.
    const { query } = mockQuery([
      () => [
        fakeRow({ id: "x1", doc_id: "X", version: 1, content: "stale", updated_at: "2026-05-20T10:00:00Z" }),
        fakeRow({ id: "x2", doc_id: "X", version: 2, content: "current", updated_at: "2026-05-20T10:05:00Z" }),
      ],
    ]);
    const rows = await listDocs(query, TBL);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(2);
    expect(rows[0].content).toBe("current");
  });

  it("same doc_id in two projects: neither row shadows the other", async () => {
    const bothRows = () => [
      fakeRow({ id: "p1|main|X", doc_id: "X", version: 1, project: "p1", content: "p1 doc", updated_at: "2026-05-20T10:02:00Z" }),
      fakeRow({ id: "p2|main|X", doc_id: "X", version: 1, project: "p2", content: "p2 doc", updated_at: "2026-05-20T10:01:00Z" }),
    ];
    const { query } = mockQuery([bothRows, bothRows]);
    const all = await listDocs(query, TBL);
    expect(all).toHaveLength(2); // both projects listed
    const p2 = await listDocs(query, TBL, { project: "p2" });
    expect(p2).toHaveLength(1);
    expect(p2[0].content).toBe("p2 doc"); // NOT shadowed by p1's newer row
  });

  it("filters by project", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ doc_id: "A", version: 1, project: "p1" }),
        fakeRow({ doc_id: "B", version: 1, project: "p2" }),
      ],
    ]);
    const rows = await listDocs(query, TBL, { project: "p2" });
    expect(rows.map(r => r.doc_id)).toEqual(["B"]);
  });

  it("respects the limit parameter", async () => {
    const { query } = mockQuery([
      () => Array.from({ length: 25 }, (_, i) =>
        fakeRow({
          doc_id: `doc-${i}`,
          version: 1,
          updated_at: `2026-05-20T10:${String(i).padStart(2, "0")}:00Z`,
        }),
      ),
    ]);
    const rows = await listDocs(query, TBL, { limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0].doc_id).toBe("doc-24"); // newest by updated_at
  });

  it("drops malformed rows (NaN version) silently", async () => {
    const { query } = mockQuery([
      () => [
        fakeRow({ doc_id: "good", version: 1 }),
        { doc_id: "bad", version: "not-a-number" },
      ],
    ]);
    const rows = await listDocs(query, TBL);
    expect(rows.map(r => r.doc_id)).toEqual(["good"]);
  });

  it("parses the anchors JSON string back into typed objects", async () => {
    const { query } = mockQuery([() => [fakeRow({ doc_id: "A", version: 1 })]]);
    const rows = await listDocs(query, TBL);
    expect(rows[0].anchors).toEqual([
      { symbol_id: "src/shell/deeplake-fs.ts:readFile:function", content_hash: "abc123" },
    ]);
  });
});

// ── getDocLatest ──────────────────────────────────────────────────────────────

describe("getDocLatest", () => {
  it("returns the latest row, picking max version in JS, escaped doc_id", async () => {
    // Reads ALL version rows for the doc (no LIMIT 1 — unsafe on this backend)
    // and picks the max version in JS.
    const { calls, query } = mockQuery([
      () => [
        fakeRow({ id: "r1", doc_id: "X'Y", version: 3, content: "old" }),
        fakeRow({ id: "r2", doc_id: "X'Y", version: 5, content: "current" }),
      ],
    ]);
    // A doc_id with an embedded quote proves sqlStr escaping end-to-end —
    // a plain-substring assertion on 'X' would survive a broken sqlStr.
    const row = await getDocLatest(query, TBL, "X'Y");
    expect(row?.version).toBe(5);
    expect(row?.content).toBe("current");
    expect(calls[0]).toContain(`doc_id = 'X''Y'`);
    expect(calls[0]).not.toMatch(/LIMIT 1/);
  });

  it("returns null when nothing matches", async () => {
    const { query } = mockQuery([() => []]);
    expect(await getDocLatest(query, TBL, "missing")).toBeNull();
  });

  it("escapes the doc_id in the WHERE clause", async () => {
    const { calls, query } = mockQuery([() => []]);
    await getDocLatest(query, TBL, "x' OR '1'='1");
    expect(calls[0]).toContain(`doc_id = 'x'' OR ''1''=''1'`);
  });

  it("optional project selector scopes the read server-side (shared-table safety)", async () => {
    const { calls, query } = mockQuery([() => []]);
    await getDocLatest(query, TBL, "X", { project: "p2" });
    expect(calls[0]).toContain(`doc_id = 'X' AND project = 'p2'`);
  });

  it("optional scope selector confines resolution to one identity (branch overlay safety)", async () => {
    // With branch overlays, the same (project, doc_id) exists at scope 'main'
    // AND at 'b:<branch>'. A write-resolution read must pin the scope so editing
    // an overlay never resolves (and then version-bumps) the main row.
    const { calls, query } = mockQuery([() => []]);
    await getDocLatest(query, TBL, "X", { project: "p2", scope: "b:feat" });
    expect(calls[0]).toContain(`doc_id = 'X' AND project = 'p2' AND scope = 'b:feat'`);
  });

  it("readerScope selects the scope column and returns the reader's overlay over main", async () => {
    // Read-side precedence: the SELECT must include `scope` (not filter by it —
    // all candidates are fetched), and the reader on b:feat gets the overlay
    // even though main has a higher version.
    const { calls, query } = mockQuery([() => [
      fakeRow({ id: "m", doc_id: "X", version: 7, content: "MAIN", scope: "main" }),
      fakeRow({ id: "o", doc_id: "X", version: 1, content: "OVERLAY", scope: "b:feat" }),
    ]]);
    const row = await getDocLatest(query, TBL, "X", { projectOrLegacy: "p", readerScope: "b:feat" });
    expect(calls[0]).toContain(", scope, source_fp FROM");   // scope column is selected
    expect(calls[0]).not.toContain("AND scope =");  // NOT filtered — all scopes fetched
    expect(row?.content).toBe("OVERLAY");
  });

  it("readerScope falls back to main when the reader's branch has no overlay", async () => {
    const { query } = mockQuery([() => [
      fakeRow({ id: "m", doc_id: "X", version: 3, content: "MAIN", scope: "main" }),
      fakeRow({ id: "o", doc_id: "X", version: 9, content: "OTHER", scope: "b:other" }),
    ]]);
    const row = await getDocLatest(query, TBL, "X", { projectOrLegacy: "p", readerScope: "b:feat" });
    expect(row?.content).toBe("MAIN"); // never another branch's overlay
  });

  it("readerScope degrades to a scope-less read when the column is missing", async () => {
    // First SELECT (with scope) throws 'column does not exist'; the catch retries
    // the scope-less SELECT, and every row reads as main.
    let call = 0;
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (call++ === 0 && sql.includes(", scope, source_fp FROM")) throw new Error(`column "scope" does not exist`);
      return [fakeRow({ doc_id: "X", version: 2, content: "LEGACY" })];
    });
    const row = await getDocLatest(query, TBL, "X", { projectOrLegacy: "p", readerScope: "b:feat" });
    expect(row?.content).toBe("LEGACY");
    expect(calls[0]).toContain(", scope, source_fp FROM");
    expect(calls[1]).not.toContain(", scope, source_fp FROM");
  });
});

// ── listDocMeta (light index read — no content) ──────────────────────────────

describe("listDocMeta", () => {
  it("selects id (for the union key) but NOT content/anchors, dedups latest per doc", async () => {
    const { calls, query } = mockQuery([
      () => [
        fakeRow({ id: "r1", doc_id: "a.ts", version: 1 }),
        fakeRow({ id: "r2", doc_id: "a.ts", version: 2 }),
        fakeRow({ id: "r3", doc_id: "b.ts", version: 1 }),
      ],
    ]);
    const meta = await listDocMeta(query, TBL);
    // The query must be metadata-only: id for the stability-gate union key,
    // never the heavy content/anchors columns.
    expect(calls[0]).toMatch(/SELECT id, doc_id, version, updated_at, status, tier/);
    expect(calls[0]).not.toContain("content");
    expect(calls[0]).not.toContain("anchors");
    // latest-per-doc: a.ts collapses to v2, b.ts stays v1.
    const byId = new Map(meta.map((r) => [r.doc_id, r.version]));
    expect(byId.get("a.ts")).toBe(2);
    expect(byId.get("b.ts")).toBe(1);
    expect(meta).toHaveLength(2);
  });

  it("scopes to a directory prefix with an escaped LIKE", async () => {
    const { calls, query } = mockQuery([() => []]);
    await listDocMeta(query, TBL, { dirPrefix: "src/graph" });
    expect(calls[0]).toContain(`WHERE doc_id LIKE 'src/graph/%'`);
  });

  it("omits the WHERE clause when no dirPrefix is given", async () => {
    const { calls, query } = mockQuery([() => []]);
    await listDocMeta(query, TBL);
    expect(calls[0]).not.toContain("WHERE");
  });
});

// ── listDocsByIds (filtered read for index summaries + the scale path) ────────

describe("listDocsByIds", () => {
  it("readerScope resolves per doc_id by branch precedence, never a foreign overlay", async () => {
    const { query } = mockQuery([() => [
      fakeRow({ id: "am", doc_id: "a.ts", version: 9, content: "a main", scope: "main" }),
      fakeRow({ id: "ao", doc_id: "a.ts", version: 1, content: "a overlay", scope: "b:feat" }),
      fakeRow({ id: "bx", doc_id: "b.ts", version: 5, content: "b other", scope: "b:other" }), // foreign only
    ]]);
    const rows = await listDocsByIds(query, TBL, ["a.ts", "b.ts"], { readerScope: "b:feat" });
    const byId = new Map(rows.map((r) => [r.doc_id, r.content]));
    expect(byId.get("a.ts")).toBe("a overlay"); // reader's overlay wins over main
    expect(byId.has("b.ts")).toBe(false);        // foreign overlay hidden
  });

  it("builds a de-duplicated IN list and returns latest-per-doc", async () => {
    const { calls, query } = mockQuery([
      () => [
        fakeRow({ id: "r1", doc_id: "a.ts", version: 1, content: "old" }),
        fakeRow({ id: "r2", doc_id: "a.ts", version: 3, content: "new" }),
        fakeRow({ id: "r3", doc_id: "b.ts", version: 1, content: "b" }),
      ],
    ]);
    const rows = await listDocsByIds(query, TBL, ["a.ts", "b.ts", "a.ts"]);
    expect(calls[0]).toContain(`doc_id IN ('a.ts', 'b.ts')`); // deduped
    const a = rows.find((r) => r.doc_id === "a.ts");
    expect(a?.version).toBe(3);
    expect(a?.content).toBe("new");
    expect(rows).toHaveLength(2);
  });

  it("short-circuits to [] with no query on empty input", async () => {
    const { calls, query } = mockQuery([]);
    expect(await listDocsByIds(query, TBL, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("escapes doc_ids in the IN list", async () => {
    const { calls, query } = mockQuery([() => []]);
    await listDocsByIds(query, TBL, ["x' OR '1'='1"]);
    expect(calls[0]).toContain(`'x'' OR ''1''=''1'`);
  });

  it("optional project selector scopes the IN read server-side", async () => {
    const { calls, query } = mockQuery([() => []]);
    await listDocsByIds(query, TBL, ["a.ts"], { project: "p1" });
    expect(calls[0]).toContain(`doc_id IN ('a.ts') AND project = 'p1'`);
  });
});

// ── parseAnchors ──────────────────────────────────────────────────────────────

describe("parseAnchors", () => {
  it("parses a JSON string into typed anchors", () => {
    expect(parseAnchors('[{"symbol_id":"a:b:function","content_hash":"h"}]')).toEqual([
      { symbol_id: "a:b:function", content_hash: "h" },
    ]);
  });

  it("degrades to [] on empty / malformed / non-array input", () => {
    expect(parseAnchors("")).toEqual([]);
    expect(parseAnchors("not json")).toEqual([]);
    expect(parseAnchors('{"not":"array"}')).toEqual([]);
    expect(parseAnchors(null)).toEqual([]);
    expect(parseAnchors(undefined)).toEqual([]);
  });

  it("filters out items missing symbol_id or content_hash", () => {
    expect(
      parseAnchors('[{"symbol_id":"a:b:fn","content_hash":"h"},{"symbol_id":"x"},{"content_hash":"y"},42]'),
    ).toEqual([{ symbol_id: "a:b:fn", content_hash: "h" }]);
  });

  it("accepts an already-parsed array (defensive)", () => {
    expect(parseAnchors([{ symbol_id: "a:b:fn", content_hash: "h" }] as unknown)).toEqual([
      { symbol_id: "a:b:fn", content_hash: "h" },
    ]);
  });
});
