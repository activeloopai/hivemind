import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  poolOptions: null as Record<string, unknown> | null,
  poolQueries: [] as Array<{ text: string; values: unknown[] }>,
  clientQueries: [] as Array<{ text: string; values: unknown[] }>,
  released: 0,
  ended: 0,
}));

function normalize(query: unknown, values: unknown[] = []): { text: string; values: unknown[] } {
  if (typeof query === "string") return { text: query, values };
  const cfg = query as { text: string; values?: unknown[] };
  return { text: cfg.text, values: cfg.values ?? [] };
}

vi.mock("pg", () => ({
  Pool: class {
    constructor(options: Record<string, unknown>) {
      state.poolOptions = options;
    }

    async query(query: unknown, values: unknown[] = []) {
      const normalized = normalize(query, values);
      state.poolQueries.push(normalized);
      if (normalized.text.includes("information_schema.tables")) {
        return { rows: [{ table_name: "memory" }, { table_name: "sessions" }], rowCount: 2 };
      }
      if (normalized.text.includes("information_schema.columns")) {
        return { rows: [{ column_name: "id" }, { column_name: "path" }], rowCount: 2 };
      }
      if (/^SELECT/i.test(normalized.text)) return { rows: [{ ok: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 3 };
    }

    async connect() {
      return {
        query: async (query: unknown, values: unknown[] = []) => {
          const normalized = normalize(query, values);
          state.clientQueries.push(normalized);
          if (/^SELECT/i.test(normalized.text)) return { rows: [{ tx: true }], rowCount: 1 };
          return { rows: [], rowCount: 2 };
        },
        release: () => { state.released++; },
      };
    }

    async end() { state.ended++; }
  },
}));

import { PostgresBackend } from "../../src/storage/postgres.js";

const names = {
  memory: "memory",
  sessions: "sessions",
  skills: "skills",
  rules: "rules",
  goals: "goals",
  kpis: "kpis",
  docs: "docs",
  codebase: "codebase",
};

beforeEach(() => {
  state.poolOptions = null;
  state.poolQueries.length = 0;
  state.clientQueries.length = 0;
  state.released = 0;
  state.ended = 0;
});

describe("PostgreSQL backend pool wrapper", () => {
  it("validates schemas and configures a schema-scoped pool", () => {
    expect(() => new PostgresBackend("postgresql://example/db", "bad;drop", "memory", names))
      .toThrow("Invalid PostgreSQL schema");
    new PostgresBackend("postgresql://example/db", "valid_schema", "memory", names);
    expect(state.poolOptions).toMatchObject({
      connectionString: "postgresql://example/db",
      max: 5,
      options: "-c search_path=valid_schema -c statement_timeout=10000",
    });
  });

  it("queries, executes, introspects, converts dates, and closes", async () => {
    const backend = new PostgresBackend("postgresql://example/db", "test_schema", "memory", names);
    const when = new Date("2026-01-01T00:00:00.000Z");
    await expect(backend.query("SELECT $1 AS value", [when])).resolves.toEqual([{ ok: 1 }]);
    expect(state.poolQueries.at(-1)?.values).toEqual(["2026-01-01T00:00:00.000Z"]);
    await expect(backend.execute("UPDATE memory SET path = $1", ["/a"])).resolves.toEqual({ rowCount: 3 });
    await expect(backend.listTables()).resolves.toEqual(["memory", "sessions"]);
    await expect(backend.getColumns("memory")).resolves.toEqual(["id", "path"]);
    expect(state.poolQueries.at(-1)?.values).toEqual(["test_schema", "memory"]);
    await backend.close();
    expect(state.ended).toBe(1);
  });

  it("honors already-aborted query signals", async () => {
    const backend = new PostgresBackend("postgresql://example/db", "test_schema", "memory", names);
    await expect(backend.query("SELECT 1", AbortSignal.abort())).rejects.toThrow("Query aborted");
  });

  it("commits transactions and delegates query, execute, and nested transactions", async () => {
    const backend = new PostgresBackend("postgresql://example/db", "test_schema", "memory", names);
    const result = await backend.transaction(async tx => {
      await expect(tx.query("SELECT $1", [new Date("2026-02-01T00:00:00.000Z")]))
        .resolves.toEqual([{ tx: true }]);
      await expect(tx.execute("UPDATE memory SET path = $1", ["/tx"]))
        .resolves.toEqual({ rowCount: 2 });
      return tx.transaction(async nested => nested.query("SELECT 2"));
    });
    expect(result).toEqual([{ tx: true }]);
    expect(state.clientQueries.map(call => call.text)).toEqual([
      "BEGIN",
      "SELECT $1",
      "UPDATE memory SET path = $1",
      "SELECT 2",
      "COMMIT",
    ]);
    expect(state.clientQueries[1]?.values).toEqual(["2026-02-01T00:00:00.000Z"]);
    expect(state.released).toBe(1);
  });

  it("rolls back and releases the client when a transaction fails", async () => {
    const backend = new PostgresBackend("postgresql://example/db", "test_schema", "memory", names);
    await expect(backend.transaction(async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(state.clientQueries.map(call => call.text)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(state.released).toBe(1);
  });

  it("rejects aborted transaction queries", async () => {
    const backend = new PostgresBackend("postgresql://example/db", "test_schema", "memory", names);
    await expect(backend.transaction(tx => tx.query("SELECT 1", AbortSignal.abort())))
      .rejects.toThrow("Query aborted");
    expect(state.clientQueries.map(call => call.text)).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
