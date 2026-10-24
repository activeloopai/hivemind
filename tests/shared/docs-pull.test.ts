import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
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
  readPullManifest,
  writePullManifest,
  GITIGNORE_ENTRIES,
} from "../../src/docs/pull.js";
import { archiveDoc, editDoc, setDoc } from "../../src/docs/write.js";

const P = "0f992ca17378e7ca";

function makeQuery(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => { calls.push(sql); return rows; });
  return { calls, query };
}

const row = (doc_id: string, content: string, updated_at: string, status = "active") => ({
  id: `${P}|main|${doc_id}`, doc_id, content, status, updated_at,
});

type FakeDocRow = Record<string, unknown> & {
  id: string;
  doc_id: string;
  project: string;
  scope: string;
};

function sqlValue(token: string): unknown {
  const value = token.trim();
  const quoted = value.match(/^(?:E)?'((?:''|[^'])*)'$/s);
  if (quoted) return quoted[1].replace(/''/g, "'").replace(/\\\\/g, "\\");
  if (value === "NULL") return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function splitSqlList(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  let bracketDepth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'" && quoted && value[i + 1] === "'") {
      i++;
      continue;
    }
    if (value[i] === "'") quoted = !quoted;
    else if (!quoted && value[i] === "[") bracketDepth++;
    else if (!quoted && value[i] === "]") bracketDepth--;
    else if (!quoted && bracketDepth === 0 && value[i] === ",") {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out;
}

/**
 * Small stateful SQL boundary fake for write -> read -> pull lifecycle tests.
 * It applies the identity filters from the generated SQL rather than returning
 * scripted rows regardless of the query, which is what hid the routing bugs.
 */
function makeDocsBackend(initial: FakeDocRow[] = []) {
  const rows = initial.map((item) => ({ ...item }));
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);

    if (sql.startsWith("SELECT")) {
      let selected = rows;
      const docId = sql.match(/doc_id = '([^']+)'/)?.[1];
      const project = sql.match(/(?:^| AND )project = '([^']*)'/)?.[1];
      const scope = sql.match(/(?:^| AND )scope = '([^']+)'/)?.[1];
      const prefix = sql.match(/id LIKE '([^']*)%'/)?.[1];
      if (docId !== undefined) selected = selected.filter((item) => item.doc_id === docId);
      if (project !== undefined) selected = selected.filter((item) => item.project === project);
      if (scope !== undefined) selected = selected.filter((item) => item.scope === scope);
      if (prefix !== undefined) selected = selected.filter((item) => item.id.startsWith(prefix));
      const projection = sql.match(/^SELECT (.*?) FROM /s)?.[1]
        .split(",")
        .map((column) => column.trim());
      return selected.map((item) => projection === undefined
        ? { ...item }
        : Object.fromEntries(projection.map((column) => [column, item[column]])));
    }

    if (sql.startsWith("INSERT")) {
      const match = sql.match(/INSERT INTO "[^"]+" \(([^)]+)\) VALUES \((.*)\)$/s);
      if (!match) throw new Error(`Unsupported INSERT: ${sql}`);
      const columns = match[1].split(",").map((column) => column.trim());
      const values = splitSqlList(match[2]).map(sqlValue);
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])) as FakeDocRow);
      return [];
    }

    if (sql.startsWith("DELETE")) {
      const keepId = sql.match(/id <> '([^']+)'/)?.[1];
      const docId = sql.match(/doc_id = '([^']+)'/)?.[1];
      const scope = sql.match(/scope = '([^']+)'/)?.[1];
      const projectList = sql.match(/project IN \(([^)]+)\)/)?.[1];
      if (keepId === undefined || docId === undefined || scope === undefined || projectList === undefined) {
        throw new Error(`Unsupported DELETE: ${sql}`);
      }
      const projects = new Set(splitSqlList(projectList).map((value) => String(sqlValue(value))));
      for (let i = rows.length - 1; i >= 0; i--) {
        const item = rows[i];
        if (item.id !== keepId && item.doc_id === docId && item.scope === scope && projects.has(item.project)) {
          rows.splice(i, 1);
        }
      }
      return [];
    }

    if (sql.startsWith("UPDATE")) {
      const match = sql.match(/UPDATE "[^"]+" SET (.*) WHERE (.*)$/s);
      if (!match) throw new Error(`Unsupported UPDATE: ${sql}`);
      const previousId = match[2].match(/id = '([^']+)'/)?.[1];
      const selectedProject = match[2].match(/project = '([^']*)'/)?.[1];
      const selectedScope = match[2].match(/scope = '([^']+)'/)?.[1];
      const item = rows.find((candidate) =>
        candidate.id === previousId &&
        (selectedProject === undefined || candidate.project === selectedProject) &&
        (selectedScope === undefined || candidate.scope === selectedScope));
      if (!item) return [];
      for (const assignment of splitSqlList(match[1])) {
        const field = assignment.trim().match(/^([a-z_]+) = (.*)$/s);
        if (field) item[field[1]] = sqlValue(field[2]);
      }
      return [];
    }

    throw new Error(`Unsupported SQL: ${sql}`);
  });
  return { calls, query, rows };
}

function storedRow(overrides: Partial<FakeDocRow> = {}): FakeDocRow {
  return {
    id: `${P}|main|src/manual.ts`,
    doc_id: "src/manual.ts",
    path: "/docs/p/src/manual.ts.md",
    content: "# Before",
    anchors: "[]",
    tier: "fast",
    status: "active",
    project: P,
    scope: "main",
    source_fp: "{}",
    version: 1,
    created_at: "2026-07-08T10:00:00.000Z",
    updated_at: "2026-07-08T10:00:00.000Z",
    agent: "manual",
    plugin_version: "",
    content_embedding: null,
    ...overrides,
  } as FakeDocRow;
}

describe("document project-move conflicts", () => {
  it.each([
    ["edit", 1], ["edit", 5], ["edit", 9],
    ["set", 1], ["set", 5], ["set", 9],
  ])("rejects %s when the destination exists at version %s without mutating either project", async (operation, version) => {
    const source = storedRow({ id: "legacy-source", version: 5, content: "# Source" });
    const destination = storedRow({ id: "target|main|src/manual.ts", project: "target", version, content: "# Destination" });
    const sourceDuplicate = storedRow({ id: `${P}|main|src/manual.ts`, version: 4 });
    const backend = makeDocsBackend([source, destination, sourceDuplicate]);
    const before = structuredClone(backend.rows);
    const input = { doc_id: "src/manual.ts", project: "target", content: "# Moved", path: "/docs/target/src/manual.ts.md" };

    await expect(operation === "edit"
      ? editDoc(backend.query, "hivemind_docs", input, { project: P })
      : setDoc(backend.query, "hivemind_docs", input, { project: P }))
      .rejects.toThrow(/destination.*already contains/i);

    expect(backend.rows).toEqual(before);
    expect(backend.calls.every((sql) => sql.startsWith("SELECT"))).toBe(true);
    expect(backend.calls.at(-1)).toContain("AND project = 'target' AND scope = 'main'");
  });

  it("preserves an archived destination instead of silently replacing its history", async () => {
    const backend = makeDocsBackend([
      storedRow({ version: 5 }),
      storedRow({ id: "target|main|src/manual.ts", project: "target", status: "archived", version: 1 }),
    ]);
    const before = structuredClone(backend.rows);
    await expect(editDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts", project: "target",
    }, { project: P })).rejects.toThrow(/destination.*already contains/i);
    expect(backend.rows).toEqual(before);
    expect(backend.calls.every((sql) => sql.startsWith("SELECT"))).toBe(true);
  });

  it("does not bypass the destination check when a set selector finds no source", async () => {
    const backend = makeDocsBackend([
      storedRow({ id: "target|main|src/manual.ts", project: "target", version: 9 }),
    ]);
    const before = structuredClone(backend.rows);
    await expect(setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts", project: "target", content: "# New", path: "/docs/target/manual.md",
    }, { project: P })).rejects.toThrow(/destination.*already contains/i);
    expect(backend.rows).toEqual(before);
    expect(backend.calls.every((sql) => sql.startsWith("SELECT"))).toBe(true);
  });

  it("propagates destination lookup failure before any mutation", async () => {
    const backend = makeDocsBackend([storedRow({ version: 5 })]);
    const before = structuredClone(backend.rows);
    const underlying = backend.query.getMockImplementation()!;
    const failure = new Error("destination lookup unavailable");
    backend.query.mockImplementation(async (sql) => {
      if (sql.startsWith("SELECT") && sql.includes("AND project = 'target'")) throw failure;
      return underlying(sql);
    });
    await expect(editDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts", project: "target",
    }, { project: P })).rejects.toBe(failure);
    expect(backend.rows).toEqual(before);
    expect(backend.calls.every((sql) => sql.startsWith("SELECT"))).toBe(true);
  });

  it("moves to an empty destination scope while preserving other projects and scopes", async () => {
    const source = storedRow({ id: "legacy-source", scope: "b:feature", version: 5 });
    const otherScope = storedRow({ id: "target|main|src/manual.ts", project: "target", version: 99 });
    const otherProject = storedRow({ id: "other|b:feature|src/manual.ts", project: "other", scope: "b:feature", version: 99 });
    const backend = makeDocsBackend([source, otherScope, otherProject]);
    const result = await editDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts", project: "target",
    }, { project: P, scope: "b:feature" });
    expect(result).toEqual({ doc_id: "src/manual.ts", version: 6 });
    expect(backend.rows.find((row) => row.id === "target|b:feature|src/manual.ts")).toMatchObject({
      project: "target", scope: "b:feature", version: 6,
      content: source.content, created_at: source.created_at,
    });
    expect(backend.rows.find((row) => row.id === otherScope.id)).toEqual(otherScope);
    expect(backend.rows.find((row) => row.id === otherProject.id)).toEqual(otherProject);
    expect(backend.calls.find((sql) => sql.startsWith("DELETE"))).toContain(`project IN ('${P}')`);
    expect(backend.calls.find((sql) => sql.startsWith("DELETE"))).not.toContain("'target'");
  });
});

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

  it("round-trips a manually set doc through composite-id pull selection", async () => {
    const backend = makeDocsBackend();
    await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Manual doc",
      project: P,
    }, { project: P });
    const report = await pullDocs({ query: backend.query, tableName: "hivemind_docs", repoRoot: dir, project: P });

    expect(report.written).toEqual(["src/manual.ts.hivemind.md"]);
    expect(readFileSync(join(dir, "src/manual.ts.hivemind.md"), "utf-8")).toBe("# Manual doc\n");
  });

  it("routes a new branch doc through the selected project and scope", async () => {
    const backend = makeDocsBackend();
    await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/branch.ts",
      path: "/docs/p/src/branch.ts.md",
      content: "# Branch doc",
    }, { project: P, scope: "b:feature" });

    const report = await pullDocs({
      query: backend.query,
      tableName: "hivemind_docs",
      repoRoot: dir,
      project: P,
      scope: "b:feature",
    });

    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|b:feature|src/branch.ts`,
      project: P,
      scope: "b:feature",
    });
    expect(report.written).toEqual(["src/branch.ts.hivemind.md"]);
  });

  it("reconciles a UUID-backed active row and duplicate into one pull-visible identity", async () => {
    const backend = makeDocsBackend([
      storedRow({ id: "legacy-uuid", version: 4, content: "# Legacy" }),
      storedRow({ version: 3, content: "# Stale deterministic duplicate" }),
    ]);

    const result = await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Reconciled",
      project: P,
    }, { project: P, scope: "main" });
    const report = await pullDocs({ query: backend.query, tableName: "hivemind_docs", repoRoot: dir, project: P });

    expect(result.version).toBe(5);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|main|src/manual.ts`,
      content: "# Reconciled",
      status: "active",
      version: 5,
      created_at: "2026-07-08T10:00:00.000Z",
    });
    expect(report.written).toEqual(["src/manual.ts.hivemind.md"]);
    expect(readFileSync(join(dir, "src/manual.ts.hivemind.md"), "utf-8")).toBe("# Reconciled\n");
  });

  it("reconciles a UUID-backed row when archiving so pull removes the local doc", async () => {
    const localPath = join(dir, "src", "manual.ts.hivemind.md");
    const backend = makeDocsBackend([storedRow({ id: "legacy-uuid", version: 7 })]);
    await pullDocs({ query: backend.query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    expect(existsSync(localPath)).toBe(false); // UUID rows are invisible until reconciled.
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(localPath, "# Before\n", { flag: "w" });

    const result = await archiveDoc(
      backend.query,
      "hivemind_docs",
      { doc_id: "src/manual.ts" },
      { project: P, scope: "main" },
    );
    const report = await pullDocs({
      query: backend.query,
      tableName: "hivemind_docs",
      repoRoot: dir,
      project: P,
      force: true,
    });

    expect(result.version).toBe(8);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|main|src/manual.ts`,
      status: "archived",
      version: 8,
    });
    expect(report.removed).toEqual(["src/manual.ts.hivemind.md"]);
    expect(existsSync(localPath)).toBe(false);
  });

  it("reconciles a UUID-backed branch row using the selected scope even when reads omit scope", async () => {
    const backend = makeDocsBackend([
      storedRow({ id: "legacy-branch-uuid", scope: "b:feature", version: 6 }),
    ]);

    const result = await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Branch legacy edit",
      project: P,
    }, { project: P, scope: "b:feature" });
    const report = await pullDocs({
      query: backend.query,
      tableName: "hivemind_docs",
      repoRoot: dir,
      project: P,
      scope: "b:feature",
    });

    expect(result.version).toBe(7);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|b:feature|src/manual.ts`,
      project: P,
      scope: "b:feature",
      version: 7,
    });
    expect(report.written).toEqual(["src/manual.ts.hivemind.md"]);
  });

  it("keeps a UUID-backed archived row archived while reconciling it for pull", async () => {
    const localPath = join(dir, "src", "manual.ts.hivemind.md");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(localPath, "# Old local copy\n");
    const backend = makeDocsBackend([
      storedRow({ id: "legacy-archived-uuid", status: "archived", version: 9 }),
    ]);

    const result = await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Updated archive record",
      project: P,
    }, { project: P, scope: "main" });
    const report = await pullDocs({
      query: backend.query,
      tableName: "hivemind_docs",
      repoRoot: dir,
      project: P,
      force: true,
    });

    expect(result.version).toBe(10);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|main|src/manual.ts`,
      status: "archived",
      content: "# Updated archive record",
      version: 10,
    });
    expect(report.removed).toEqual(["src/manual.ts.hivemind.md"]);
    expect(existsSync(localPath)).toBe(false);
  });

  it("keeps foreign projects and sibling scopes untouched when write options are omitted", async () => {
    const backend = makeDocsBackend([
      storedRow({ id: `${P}|main|src/manual.ts`, version: 2 }),
      storedRow({ id: `foreign|main|src/manual.ts`, project: "foreign", version: 99 }),
      storedRow({ id: `${P}|b:other|src/manual.ts`, scope: "b:other", version: 98 }),
    ]);

    const result = await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Local main edit",
      project: P,
    });

    expect(result.version).toBe(3);
    expect(backend.rows).toHaveLength(3);
    expect(backend.rows.find((item) => item.id === `${P}|main|src/manual.ts`)).toMatchObject({
      content: "# Local main edit",
      version: 3,
    });
    expect(backend.rows.find((item) => item.id === `foreign|main|src/manual.ts`)).toMatchObject({
      project: "foreign",
      version: 99,
    });
    expect(backend.rows.find((item) => item.id === `${P}|b:other|src/manual.ts`)).toMatchObject({
      scope: "b:other",
      version: 98,
    });
  });

  it("removes a stale UUID duplicate when the canonical row is newer", async () => {
    const backend = makeDocsBackend([
      storedRow({ id: `${P}|main|src/manual.ts`, version: 5 }),
      storedRow({ id: "legacy-uuid", version: 4 }),
    ]);

    const result = await setDoc(backend.query, "hivemind_docs", {
      doc_id: "src/manual.ts",
      path: "/docs/p/src/manual.ts.md",
      content: "# Canonical wins",
      project: P,
    }, { project: P, scope: "main" });

    expect(result.version).toBe(6);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0]).toMatchObject({
      id: `${P}|main|src/manual.ts`,
      content: "# Canonical wins",
      version: 6,
    });
  });

  it("delta protocol: the cursor bounds the next read; --force ignores it", async () => {
    writePullManifest(dir, { cursor: "2026-07-08T11:00:00Z" });
    const { calls, query } = makeQuery([]);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P });
    // INCLUSIVE (>=): a strict > would skip a doc written with exactly the
    // cursor timestamp after the previous SELECT — forever.
    expect(calls[0]).toContain(`updated_at >= '2026-07-08T11:00:00Z'`);
    await pullDocs({ query, tableName: "hivemind_docs", repoRoot: dir, project: P, force: true });
    expect(calls[1]).not.toContain("updated_at >=");
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
