import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteBackend } from "../../src/storage/sqlite.js";
import { cosineSimilarity, parseStoredVector, scoreVectorRows } from "../../src/storage/vector-search.js";
import { vectorScanLimit } from "../../src/storage/vector-search.js";
import { escapedStringPrefix, jsonLiteral, likeOperator, nullExpression, textExpression } from "../../src/storage/sql-dialect.js";

let root: string;
let path: string;

const names = {
  memory: "memory",
  sessions: "sessions",
  skills: "skills",
  rules: "hivemind_rules",
  goals: "hivemind_goals",
  kpis: "hivemind_kpis",
  docs: "hivemind_docs",
  codebase: "codebase",
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hivemind-sqlite-test-"));
  path = join(root, "memory.sqlite3");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("SQLite storage contract", () => {
  it("creates and idempotently heals every owned table", async () => {
    const backend = new SqliteBackend(path, "memory", names);
    await backend.execute(`CREATE TABLE "memory" (id TEXT)`);
    await backend.initializeSchema();
    await backend.initializeSchema();
    expect(await backend.listTables()).toEqual([
      "codebase", "hivemind_docs", "hivemind_goals", "hivemind_kpis",
      "hivemind_rules", "memory", "sessions", "skills",
    ]);
    expect(await backend.getColumns("memory")).toContain("summary_embedding");
    await backend.close();
  });

  it("round-trips parameters, quotes, JSON, and vectors", async () => {
    const backend = new SqliteBackend(path, "sessions", names);
    await backend.ensureSessionsTable("sessions");
    await backend.execute(
      `INSERT INTO "sessions" (id, path, filename, message, message_embedding, author) VALUES ($1, $2, $3, $4, $5, $6)`,
      ["id'1", "/sessions/a'b.jsonl", "a'b.jsonl", { text: "it's valid" }, [0.1, 0.2], "o'hara"],
    );
    const rows = await backend.query(`SELECT id, path, message, message_embedding, author FROM "sessions"`);
    expect(rows).toEqual([{
      id: "id'1",
      path: "/sessions/a'b.jsonl",
      message: { text: "it's valid" },
      message_embedding: [0.1, 0.2],
      author: "o'hara",
    }]);
    await backend.close();
  });

  it("commits successful transactions and rolls back failures", async () => {
    const backend = new SqliteBackend(path, "memory", names);
    await backend.ensureTable();
    await backend.transaction(async tx => {
      await tx.execute(`INSERT INTO "memory" (id, path) VALUES ($1, $2)`, ["1", "/ok"]);
    });
    await expect(backend.transaction(async tx => {
      await tx.execute(`INSERT INTO "memory" (id, path) VALUES ($1, $2)`, ["2", "/rollback"]);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect((await backend.query(`SELECT path FROM "memory" ORDER BY path`)).map(row => row.path)).toEqual(["/ok"]);
    await backend.close();
  });

  it("upserts queued VFS rows without duplicating paths", async () => {
    const backend = new SqliteBackend(path, "memory", names);
    await backend.ensureTable();
    backend.appendRows([{ path: "/note.md", filename: "note.md", contentText: "first", mimeType: "text/markdown", sizeBytes: 5 }]);
    await backend.commit();
    backend.appendRows([{ path: "/note.md", filename: "note.md", contentText: "second", mimeType: "text/markdown", sizeBytes: 6 }]);
    await backend.commit();
    expect(await backend.query(`SELECT path, summary FROM "memory"`)).toEqual([{ path: "/note.md", summary: "second" }]);
    await backend.close();
  });

  it("supports maintenance helpers, empty commits, and idempotent close", async () => {
    const backend = new SqliteBackend(path, "memory", names);
    await backend.ensureTable();
    await backend.commit();
    await backend.updateColumns("/missing", {});
    backend.appendRows([{ path: "/note.md", filename: "note.md", contentText: "body", mimeType: "text/plain", sizeBytes: 4 }]);
    await backend.commit();
    await backend.updateColumns("/note.md", { description: "updated", size_bytes: 7 });
    await backend.createIndex("description");
    expect(await backend.knownTablesOrNull()).toContain("memory");
    expect(await backend.query(`SELECT description, size_bytes FROM "memory" WHERE path = $1`, ["/note.md"]))
      .toEqual([{ description: "updated", size_bytes: 7 }]);
    await backend.close();
    await backend.close();
    await expect(backend.query("SELECT 1")).rejects.toThrow("SQLite backend is closed");
  });

  it("binds dates, booleans, arrays, objects, and nulls and validates query parameters", async () => {
    const backend = new SqliteBackend(path, "sessions", names);
    await backend.ensureSessionsTable("sessions");
    await backend.execute(
      `INSERT INTO "sessions" (id, path, filename, message, message_embedding, creation_date) VALUES ($1, $2, $3, $4, $5, $6)`,
      ["types", "/types", "types", { ok: true }, [1, 2], new Date("2026-01-01T00:00:00.000Z")],
    );
    await backend.execute(`UPDATE "sessions" SET size_bytes = $1, message = $2 WHERE id = $3`, [true, null, "types"]);
    expect(await backend.query(`SELECT size_bytes, message, message_embedding, creation_date FROM "sessions"`))
      .toEqual([{ size_bytes: 1, message: null, message_embedding: [1, 2], creation_date: "2026-01-01T00:00:00.000Z" }]);
    await expect(backend.query("SELECT $2", ["only-one"])).rejects.toThrow("Missing SQL parameter $2");
    await expect(backend.query("SELECT 1", AbortSignal.abort())).rejects.toThrow("Query aborted");
    await expect(backend.query("SELECT 1", [], AbortSignal.abort())).rejects.toThrow("Query aborted");
    await backend.close();
  });

  it("supports query DML, RETURNING rows, and nested transaction views", async () => {
    const backend = new SqliteBackend(path, "memory", names);
    await backend.ensureTable();
    expect(await backend.query(`INSERT INTO "memory" (id, path) VALUES ($1, $2)`, ["q", "/q"])).toEqual([]);
    expect(await backend.query(`INSERT INTO "memory" (id, path) VALUES ($1, $2) RETURNING path`, ["r", "/r"]))
      .toEqual([{ path: "/r" }]);
    const nested = await backend.transaction(tx => tx.transaction(inner => inner.query(
      `SELECT path FROM "memory" ORDER BY path`,
    )));
    expect(nested).toEqual([{ path: "/q" }, { path: "/r" }]);
    await backend.close();
  });
});

describe("application vector scoring", () => {
  it("computes normalized cosine and skips malformed vectors", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBe(1);
    expect(parseStoredVector("[0,1]")).toEqual([0, 1]);
    expect(parseStoredVector("broken")).toBeNull();
    const scored = scoreVectorRows([
      { id: "best", embedding: "[1,0]" },
      { id: "other", embedding: [0, 1] },
      { id: "bad", embedding: "nope" },
    ], "embedding", [1, 0]);
    expect(scored.map(item => item.row.id)).toEqual(["best", "other"]);
  });

  it("rejects empty, mismatched, non-finite, zero, and malformed vectors", () => {
    expect(parseStoredVector(null)).toBeNull();
    expect(parseStoredVector([])).toBeNull();
    expect(parseStoredVector("not-json")).toBeNull();
    expect(parseStoredVector([1, Number.NaN])).toBeNull();
    expect(cosineSimilarity([], [])).toBeNull();
    expect(cosineSimilarity([1], [1, 2])).toBeNull();
    expect(cosineSimilarity([Number.NaN], [1])).toBeNull();
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
    expect(scoreVectorRows([{ embedding: [1] }], "embedding", [1, 0])).toEqual([]);
  });

  it("uses a positive vector scan limit and falls back for invalid values", () => {
    const previous = process.env.HIVEMIND_VECTOR_SCAN_LIMIT;
    try {
      process.env.HIVEMIND_VECTOR_SCAN_LIMIT = "17";
      expect(vectorScanLimit()).toBe(17);
      process.env.HIVEMIND_VECTOR_SCAN_LIMIT = "0";
      expect(vectorScanLimit()).toBe(2000);
      process.env.HIVEMIND_VECTOR_SCAN_LIMIT = "invalid";
      expect(vectorScanLimit()).toBe(2000);
    } finally {
      if (previous === undefined) delete process.env.HIVEMIND_VECTOR_SCAN_LIMIT;
      else process.env.HIVEMIND_VECTOR_SCAN_LIMIT = previous;
    }
  });
});

describe("SQL dialect rendering", () => {
  it("renders native SQLite expressions and PostgreSQL casts", () => {
    expect(textExpression("message", "sqlite")).toBe("message");
    expect(textExpression("message", "postgres")).toBe("message::text");
    expect(nullExpression("bigint", "sqlite")).toBe("NULL");
    expect(nullExpression("bigint", "postgres")).toBe("NULL::bigint");
    expect(likeOperator("ILIKE", "sqlite")).toBe("LIKE");
    expect(likeOperator("LIKE", "sqlite")).toBe("LIKE");
    expect(likeOperator("ILIKE", "postgres")).toBe("ILIKE");
    expect(escapedStringPrefix("sqlite")).toBe("");
    expect(escapedStringPrefix("postgres")).toBe("E");
    expect(jsonLiteral('{"ok":true}', "sqlite")).toBe(`'{"ok":true}'`);
    expect(jsonLiteral('{"ok":true}', "postgres")).toBe(`'{"ok":true}'::jsonb`);
  });
});
