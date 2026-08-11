import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteBackend } from "../../src/storage/sqlite.js";
import { cosineSimilarity, parseStoredVector, scoreVectorRows } from "../../src/storage/vector-search.js";

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
});
