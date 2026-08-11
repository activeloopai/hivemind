import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SqliteBackend } from "../../src/storage/sqlite.js";
import { embeddingSqlLiteral } from "../../src/embeddings/sql.js";
import { buildDirectSessionInsertSql } from "../../src/hooks/shared/session-insert-sql.js";
import { readVirtualPathContent } from "../../src/hooks/virtual-table-query.js";
import { searchDeeplakeTables, searchDocs } from "../../src/shell/grep-core.js";
import { storageQuery } from "../../src/docs/read.js";
import { upsertDoc } from "../../src/docs/write.js";
import { insertRule } from "../../src/rules/write.js";
import { buildPlaceholderInsertSql } from "../../src/hooks/shared/placeholder-summary.js";

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

let root: string;
let backend: SqliteBackend;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "hivemind-sqlite-feature-"));
  backend = new SqliteBackend(join(root, "memory.sqlite3"), "memory", names);
  await backend.initializeSchema();
});

afterEach(async () => {
  await backend.close();
  rmSync(root, { recursive: true, force: true });
});

describe("SQLite feature parity smoke", () => {
  it("captures, reads, and searches memory without SQL translation", async () => {
    const sessionPath = "/sessions/alice/example.jsonl";
    const message = JSON.stringify({ type: "user", content: "Find the blue widget" });
    const insert = buildDirectSessionInsertSql("sessions", {
      id: randomUUID(),
      sessionPath,
      filename: "example.jsonl",
      jsonForSql: message.replace(/'/g, "''"),
      embeddingSql: embeddingSqlLiteral([1, 0], "sqlite"),
      userName: "alice",
      sizeBytes: message.length,
      projectName: "demo",
      description: "Prompt",
      agent: "codex",
      pluginVersion: "test",
      timestamp: new Date().toISOString(),
    }, "sqlite");
    await backend.query(insert);

    backend.appendRows([{
      path: "/summaries/alice/one.md",
      filename: "one.md",
      contentText: "A blue widget summary",
      mimeType: "text/markdown",
      sizeBytes: 21,
    }]);
    await backend.commit();
    await backend.execute(
      `UPDATE "memory" SET summary_embedding = $1 WHERE path = $2`,
      [[1, 0], "/summaries/alice/one.md"],
    );

    expect(await readVirtualPathContent(backend, "memory", "sessions", sessionPath))
      .toContain("Find the blue widget");

    const lexical = await searchDeeplakeTables(backend, "memory", "sessions", {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: "%BLUE%",
      queryEmbedding: null,
      limit: 10,
    });
    expect(lexical.map(row => row.path)).toContain("/summaries/alice/one.md");

    const semantic = await searchDeeplakeTables(backend, "memory", "sessions", {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: "%missing lexical term%",
      queryEmbedding: [1, 0],
      limit: 10,
    });
    expect(semantic[0]?.path).toBe("/summaries/alice/one.md");
  });

  it("searches docs lexically and with application-side cosine scoring", async () => {
    const query = storageQuery(backend);
    await upsertDoc(query, "hivemind_docs", {
      doc_id: "src/auth.ts",
      path: "/docs/src/auth.ts.md",
      content: "Token minting happens here",
      project: "demo",
      content_embedding: [1, 0],
    });

    const lexical = await searchDocs(query, "hivemind_docs", {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: "%TOKEN%",
      queryEmbedding: null,
      project: "demo",
    }, "sqlite");
    expect(lexical.map(row => row.path)).toEqual(["src/auth.ts"]);

    const semantic = await searchDocs(query, "hivemind_docs", {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: "%unrelated%",
      queryEmbedding: [1, 0],
      project: "demo",
    }, "sqlite");
    expect(semantic.map(row => row.path)).toEqual(["src/auth.ts"]);
  });

  it("writes placeholder summaries and rules using SQLite literals", async () => {
    const placeholder = buildPlaceholderInsertSql({
      table: "memory",
      sessionId: "session-1",
      cwd: "/tmp/demo",
      userName: "alice",
      orgName: "local",
      workspaceId: "local",
      agent: "codex",
      pluginVersion: "test",
      dialect: "sqlite",
    });
    await backend.query(placeholder.sql);
    expect(await backend.query(`SELECT description FROM "memory" WHERE path = $1`, [placeholder.summaryPath]))
      .toEqual([{ description: "in progress" }]);

    const query = storageQuery(backend);
    const rule = await insertRule(query, "hivemind_rules", {
      text: "Use the local backend",
      assigned_by: "alice",
    }, "sqlite");
    expect(await backend.query(`SELECT text FROM "hivemind_rules" WHERE rule_id = $1`, [rule.rule_id]))
      .toEqual([{ text: "Use the local backend" }]);
  });
});
