import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configFromStorage, type PostgresStorageConfig } from "../../src/config.js";
import { createStorageBackend } from "../../src/storage/factory.js";
import { PostgresBackend } from "../../src/storage/postgres.js";
import { registerSqlStorageFeatureParity } from "./helpers/sql-storage-feature-parity.js";

const connectionUrl = process.env.HIVEMIND_TEST_POSTGRES_URL;
const run = connectionUrl ? describe : describe.skip;

run("PostgreSQL storage contract", () => {
  it("creates, heals, transacts, and round-trips native JSON and vectors", async () => {
    const schema = `hivemind_test_${process.pid}_${Date.now()}`;
    const names = {
      memory: "memory", sessions: "sessions", skills: "skills", rules: "hivemind_rules",
      goals: "hivemind_goals", kpis: "hivemind_kpis", docs: "hivemind_docs", codebase: "codebase",
    };
    const backend = new PostgresBackend(connectionUrl!, schema, "memory", names);
    try {
      await backend.initializeSchema();
      await backend.initializeSchema();
      expect(await backend.listTables()).toContain("memory");
      expect(await backend.getColumns("memory")).toContain("summary_embedding");

      await backend.execute(
        `INSERT INTO "sessions" (id, path, filename, message, message_embedding, author) VALUES ($1, $2, $3, $4, $5, $6)`,
        ["quote'1", "/sessions/quote.jsonl", "quote.jsonl", { text: "it's valid" }, [0.25, 0.75], "o'hara"],
      );
      expect(await backend.query(`SELECT id, message, message_embedding, author FROM "sessions"`)).toEqual([{
        id: "quote'1", message: { text: "it's valid" }, message_embedding: [0.25, 0.75], author: "o'hara",
      }]);

      await expect(backend.transaction(async tx => {
        await tx.execute(`INSERT INTO "memory" (id, path) VALUES ($1, $2)`, ["rollback", "/rollback"]);
        throw new Error("rollback");
      })).rejects.toThrow("rollback");
      expect(await backend.query(`SELECT id FROM "memory" WHERE id = $1`, ["rollback"])).toEqual([]);
    } finally {
      await backend.execute(`DROP SCHEMA "${schema}" CASCADE`);
      await backend.close();
    }
  }, 30_000);
});

registerSqlStorageFeatureParity("PostgreSQL", Boolean(connectionUrl), async () => {
  const root = mkdtempSync(join(tmpdir(), "hivemind-postgres-parity-"));
  const schema = `hivemind_parity_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const configPath = join(root, "config.json");
  mkdirSync(join(root, ".deeplake"), { recursive: true });
  writeFileSync(join(root, ".deeplake", "credentials.json"), JSON.stringify({
    token: "unused-local-token",
    orgId: "local",
    userName: "alice",
    workspaceId: "default",
  }));
  const storage: PostgresStorageConfig = {
    kind: "postgres",
    connectionUrl: connectionUrl!,
    schema,
    orgId: "local",
    orgName: "local",
    userName: "alice",
    workspaceId: "default",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    rulesTableName: "hivemind_rules",
    goalsTableName: "hivemind_goals",
    kpisTableName: "hivemind_kpis",
    docsTableName: "hivemind_docs",
    codebaseTableName: "codebase",
    memoryPath: join(root, "memory"),
    vectorScanLimit: 100,
  };
  const backend = createStorageBackend(storage);
  return {
    backend,
    config: configFromStorage(storage),
    root,
    childEnv: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      HIVEMIND_BACKEND: "postgres",
      HIVEMIND_POSTGRES_URL: connectionUrl!,
      HIVEMIND_POSTGRES_SCHEMA: schema,
      HIVEMIND_CONFIG_PATH: configPath,
      HIVEMIND_EMBEDDINGS: "false",
      HIVEMIND_MEMORY_PATH: storage.memoryPath,
    },
    malformedVector: [1],
    cleanup: async () => {
      try {
        await backend.execute(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await backend.close();
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
});
