import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Stub the read-stability gate to a single pass-through query (see docs.test.ts).
vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import {
  ensureGitignoreEntries,
  localDocPath,
  pullDocs,
  pullContextKey,
  readPullManifest,
  writePullManifest,
  GITIGNORE_ENTRIES,
} from "../../src/docs/pull.js";

const P = "0f992ca17378e7ca";

function makeQuery(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => { calls.push(sql); return rows; });
  return { calls, query };
}

const row = (doc_id: string, content: string, updated_at: string, status = "active") => ({
  id: `${P}|main|${doc_id}`, doc_id, content, status, updated_at,
});

const rowForContext = (
  project: string,
  scope: string,
  doc_id: string,
  content: string,
  updated_at: string,
  status = "active",
) => ({ id: `${project}|${scope}|${doc_id}`, doc_id, content, status, updated_at });

describe("localDocPath", () => {
  it("wiki pages and file docs materialize in DISTINCT namespaces (no collision)", () => {
    // A root-level file can produce a wiki key equal to its own path — the
    // .wiki suffix keeps `wiki/main.ts` and file doc `main.ts` apart.
    expect(localDocPath("wiki/main.ts")).not.toBe(localDocPath("main.ts"));
  });
  it("maps wiki pages and file docs to sibling *.hivemind.md paths", () => {
    expect(localDocPath("wiki/xarray/plot")).toBe("xarray/plot.wiki.hivemind.md");
    expect(localDocPath("src/foo.ts")).toBe("src/foo.ts.hivemind.md");
  });
  it("rejects doc_ids that would escape the repo", () => {
    expect(localDocPath("../etc/passwd")).toBeNull();
    expect(localDocPath("a/../../x")).toBeNull();
    expect(localDocPath("/abs/path")).toBeNull();
    expect(localDocPath("wiki/")).toBeNull();
  });
});

describe("pullDocs", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "docs-pull-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("materializes active docs, targets rows by composite-id prefix, advances the cursor", async () => {
    const { calls, query } = makeQuery([
      row("wiki/xarray/plot", "# Plot page", "2026-07-08T10:00:00Z"),
      row("src/foo.ts", "# Foo doc", "2026-07-08T11:00:00Z"),
    ]);
    const report = await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    expect(report.written.sort()).toEqual(["src/foo.ts.hivemind.md", "xarray/plot.wiki.hivemind.md"]);
    expect(readFileSync(join(dir, "xarray/plot.wiki.hivemind.md"), "utf-8")).toBe("# Plot page\n");
    // Read filters by id prefix, NOT the scope column (works on unhealed tables).
    expect(calls[0]).toContain(`id LIKE '${P}|main|%'`);
    expect(calls[0]).not.toMatch(/\bscope\b/);
    expect(report.cursor).toBe("2026-07-08T11:00:00Z");
    expect(readPullManifest(dir).cursor).toBe("2026-07-08T11:00:00Z");
  });

  it("delta protocol: the cursor bounds the next read; --force ignores it", async () => {
    writePullManifest(dir, {
      cursor: "2026-07-08T11:00:00Z",
      contexts: { [pullContextKey(P, "main")]: "2026-07-08T11:00:00Z" },
      activeContext: pullContextKey(P, "main"),
    });
    const { calls, query } = makeQuery([]);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    // INCLUSIVE (>=): a strict > would skip a doc written with exactly the
    // cursor timestamp after the previous SELECT — forever.
    expect(calls[0]).toContain(`updated_at >= '2026-07-08T11:00:00Z'`);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P, force: true });
    expect(calls[1]).not.toContain("updated_at >=");
  });

  it("does not apply one project's or branch's cursor to another pull context", async () => {
    const featureRow = {
      id: `${P}|b:feature|src/feature.ts`,
      doc_id: "src/feature.ts",
      content: "# Feature doc",
      status: "active",
      updated_at: "2026-07-08T09:00:00Z",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes(`${P}|main|`)) return [row("src/main.ts", "# Main doc", "2026-07-08T10:00:00Z")];
      if (sql.includes(`${P}|b:feature|`) && sql.includes("updated_at >=")) return [];
      if (sql.includes(`${P}|b:feature|`)) return [featureRow];
      return [];
    });

    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P, scope: "main" });
    const report = await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P, scope: "b:feature" });

    expect(report.written).toEqual(["src/feature.ts.hivemind.md"]);
    expect(readFileSync(join(dir, "src/feature.ts.hivemind.md"), "utf-8")).toBe("# Feature doc\n");
  });

  it("rematerializes a previously visited context after another context overwrites a shared path", async () => {
    const rows = [
      rowForContext("project-a", "main", "src/shared.ts", "# A shared", "2026-09-22T10:00:00Z"),
      rowForContext("project-a", "main", "src/anchor.ts", "# A anchor", "2026-09-22T11:00:00Z"),
      rowForContext("project-b", "b:feature", "src/shared.ts", "# B shared", "2026-09-22T09:00:00Z"),
    ];
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      const prefix = sql.match(/id LIKE '([^']*)%/)?.[1] ?? "";
      const cursor = sql.match(/updated_at >= '([^']*)'/)?.[1] ?? "";
      return rows.filter((candidate) =>
        candidate.id.startsWith(prefix) && (cursor === "" || candidate.updated_at >= cursor),
      );
    });

    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: "project-a", scope: "main" });
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: "project-b", scope: "b:feature" });
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: "project-a", scope: "main" });

    expect(calls.at(-1)).not.toContain("updated_at >=");
    expect(readFileSync(join(dir, "src/shared.ts.hivemind.md"), "utf-8")).toBe("# A shared\n");
    expect(readFileSync(join(dir, "src/anchor.ts.hivemind.md"), "utf-8")).toBe("# A anchor\n");
    expect(readPullManifest(dir).activeContext).toBe(pullContextKey("project-a", "main"));
  });

  it("fails safe with a full read when context ownership metadata is ambiguous", async () => {
    writePullManifest(dir, {
      cursor: "2026-09-22T11:00:00Z",
      contexts: { [pullContextKey(P, "main")]: "2026-09-22T11:00:00Z" },
    });
    const { calls, query } = makeQuery([row("src/older.ts", "# Older doc", "2026-09-22T10:00:00Z")]);

    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });

    expect(calls[0]).not.toContain("updated_at >=");
    expect(readFileSync(join(dir, "src/older.ts.hivemind.md"), "utf-8")).toBe("# Older doc\n");
  });

  it("is deterministic and mtime-stable: an unchanged doc is not rewritten", async () => {
    const rows = [row("src/foo.ts", "same", "2026-07-08T10:00:00Z")];
    const { query } = makeQuery(rows);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    const before = statSync(join(dir, "src/foo.ts.hivemind.md")).mtimeMs;
    const r2 = await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P, force: true });
    expect(r2.written).toEqual([]);
    expect(r2.unchanged).toBe(1);
    expect(statSync(join(dir, "src/foo.ts.hivemind.md")).mtimeMs).toBe(before);
  });

  it("an archived doc removes its local file", async () => {
    const { query } = makeQuery([row("src/foo.ts", "x", "2026-07-08T10:00:00Z")]);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    expect(existsSync(join(dir, "src/foo.ts.hivemind.md"))).toBe(true);
    const { query: q2 } = makeQuery([row("src/foo.ts", "x", "2026-07-08T12:00:00Z", "archived")]);
    const r2 = await pullDocs({ query: q2, tableName: "hivemind_docs", repoRoot: dir, project: P });
    expect(r2.removed).toEqual(["src/foo.ts.hivemind.md"]);
    expect(existsSync(join(dir, "src/foo.ts.hivemind.md"))).toBe(false);
  });

  it("skips the reserved _meta row and unmappable doc_ids without touching disk", async () => {
    const { query } = makeQuery([
      row("_meta", '{"claimed_by":null}', "2026-07-08T10:00:00Z"),
      row("../evil", "x", "2026-07-08T10:00:00Z"),
    ]);
    const report = await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    expect(report.written).toEqual([]);
    expect(existsSync(join(dir, "..", "evil.hivemind.md"))).toBe(false);
  });
});

describe("ensureGitignoreEntries", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "docs-gi-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates .gitignore with both entries when missing", () => {
    expect(ensureGitignoreEntries(dir)).toBe(true);
    const body = readFileSync(join(dir, ".gitignore"), "utf-8");
    for (const e of GITIGNORE_ENTRIES) expect(body).toContain(e);
  });

  it("is idempotent and preserves existing content byte-for-byte", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n*.hivemind.md\n");
    expect(ensureGitignoreEntries(dir)).toBe(true); // adds only .hivemind/
    const body = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(body.startsWith("node_modules/\n*.hivemind.md\n")).toBe(true);
    expect(body.match(/\*\.hivemind\.md/g)).toHaveLength(1); // not duplicated
    expect(ensureGitignoreEntries(dir)).toBe(false); // second run: no-op
  });
});
