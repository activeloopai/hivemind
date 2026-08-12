import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageBackend, StorageKind } from "../../src/storage/backend.js";
import type { StorageConfig } from "../../src/config.js";

const state = vi.hoisted(() => ({
  constructorCalls: [] as Array<{ kind: StorageKind; args: unknown[] }>,
  backends: [] as StorageBackend[],
}));

function fakeBackend(kind: StorageKind, tableName: string): StorageBackend {
  const backend = {
    kind,
    dialect: kind === "sqlite" ? "sqlite" : kind === "postgres" ? "postgres" : "deeplake",
    capabilities: {
      serverVectorSearch: kind === "deeplake",
      transactions: kind !== "deeplake",
      json: kind === "sqlite" ? "text" : "native",
      vectors: kind === "sqlite" ? "json-text" : kind === "postgres" ? "array" : "server",
    },
    tableName,
    query: vi.fn().mockResolvedValue([{ ok: 1 }]),
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    transaction: vi.fn(async (fn: (tx: StorageBackend) => Promise<unknown>) => fn(backend as StorageBackend)),
    listTables: vi.fn().mockResolvedValue(["memory"]),
    knownTablesOrNull: vi.fn().mockResolvedValue(["memory"]),
    getColumns: vi.fn().mockResolvedValue(["id"]),
    initializeSchema: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    appendRows: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    updateColumns: vi.fn().mockResolvedValue(undefined),
    createIndex: vi.fn().mockResolvedValue(undefined),
    ensureTable: vi.fn().mockResolvedValue(undefined),
    ensureSessionsTable: vi.fn().mockResolvedValue(undefined),
    ensureSkillsTable: vi.fn().mockResolvedValue(undefined),
    ensureRulesTable: vi.fn().mockResolvedValue(undefined),
    ensureGoalsTable: vi.fn().mockResolvedValue(undefined),
    ensureKpisTable: vi.fn().mockResolvedValue(undefined),
    ensureDocsTable: vi.fn().mockResolvedValue(undefined),
    ensureCodebaseTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageBackend;
  state.backends.push(backend);
  return backend;
}

vi.mock("../../src/storage/sqlite.js", () => ({
  SqliteBackend: class {
    constructor(...args: unknown[]) {
      state.constructorCalls.push({ kind: "sqlite", args });
      return fakeBackend("sqlite", String(args[1]));
    }
  },
}));

vi.mock("../../src/storage/postgres.js", () => ({
  PostgresBackend: class {
    constructor(...args: unknown[]) {
      state.constructorCalls.push({ kind: "postgres", args });
      return fakeBackend("postgres", String(args[2]));
    }
  },
}));

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(...args: unknown[]) {
      state.constructorCalls.push({ kind: "deeplake", args });
      return fakeBackend("deeplake", String(args[4]));
    }
  },
}));

import { createStorageBackend } from "../../src/storage/factory.js";

function config(kind: "sqlite" | "postgres"): StorageConfig {
  const common = {
    userName: "alice",
    workspaceId: "default",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    rulesTableName: "rules",
    goalsTableName: "goals",
    kpisTableName: "kpis",
    docsTableName: "docs",
    codebaseTableName: "codebase",
    memoryPath: "/tmp/memory",
    vectorScanLimit: 100,
    orgId: "local" as const,
    orgName: "local" as const,
  };
  return kind === "sqlite"
    ? { ...common, kind, path: "/tmp/test.sqlite3" }
    : { ...common, kind, connectionUrl: "postgresql://example/test", schema: "test_schema" };
}

beforeEach(() => {
  state.constructorCalls.length = 0;
  state.backends.length = 0;
});

describe.each(["sqlite", "postgres"] as const)("lazy %s storage factory", kind => {
  it("loads on demand, flushes queued rows, and delegates the complete backend contract", async () => {
    const wrapper = createStorageBackend(config(kind), "alternate");
    expect(state.constructorCalls).toEqual([]);
    wrapper.appendRows([{ path: "/a", filename: "a", contentText: "a", mimeType: "text/plain", sizeBytes: 1 }]);
    await wrapper.commit();

    const concrete = state.backends[0];
    expect(state.constructorCalls[0]?.kind).toBe(kind);
    expect(concrete.tableName).toBe("alternate");
    expect(concrete.appendRows).toHaveBeenCalledTimes(1);
    expect(concrete.commit).toHaveBeenCalledTimes(1);

    const signal = new AbortController().signal;
    await expect(wrapper.query("SELECT 1", [], signal)).resolves.toEqual([{ ok: 1 }]);
    await expect(wrapper.execute("UPDATE x", [1])).resolves.toEqual({ rowCount: 1 });
    await expect(wrapper.transaction(async tx => tx.query("SELECT 2"))).resolves.toEqual([{ ok: 1 }]);
    await expect(wrapper.listTables(true)).resolves.toEqual(["memory"]);
    await expect(wrapper.knownTablesOrNull()).resolves.toEqual(["memory"]);
    await expect(wrapper.getColumns("memory")).resolves.toEqual(["id"]);
    await wrapper.initializeSchema();
    await wrapper.updateColumns("/a", { size_bytes: 2 });
    await wrapper.createIndex("path");
    await wrapper.ensureTable("memory");
    await wrapper.ensureSessionsTable("sessions");
    await wrapper.ensureSkillsTable("skills");
    await wrapper.ensureRulesTable("rules");
    await wrapper.ensureGoalsTable("goals");
    await wrapper.ensureKpisTable("kpis");
    await wrapper.ensureDocsTable("docs");
    await wrapper.ensureCodebaseTable("codebase");
    await wrapper.close();

    expect(concrete.close).toHaveBeenCalledTimes(1);
    expect(concrete.ensureCodebaseTable).toHaveBeenCalledWith("codebase");
  });

  it("does not load the provider merely to close an unused wrapper", async () => {
    const wrapper = createStorageBackend(config(kind));
    await wrapper.close();
    expect(state.constructorCalls).toEqual([]);
  });
});

describe("Deeplake compatibility factory", () => {
  it("constructs Deeplake directly from a legacy Config shape", () => {
    const legacy = {
      token: "token",
      apiUrl: "https://api.example",
      orgId: "org",
      orgName: "Org",
      userName: "alice",
      workspaceId: "ws",
      tableName: "memory",
      sessionsTableName: "sessions",
      skillsTableName: "skills",
      rulesTableName: "rules",
      goalsTableName: "goals",
      kpisTableName: "kpis",
      docsTableName: "docs",
      codebaseTableName: "codebase",
      memoryPath: "/tmp/memory",
    };
    const backend = createStorageBackend(legacy, "sessions");
    expect(backend.kind).toBe("deeplake");
    expect(state.constructorCalls[0]?.kind).toBe("deeplake");
    expect(state.constructorCalls[0]?.args.slice(0, 5)).toEqual([
      "token", "https://api.example", "org", "ws", "sessions",
    ]);
  });

  it("uses the nested storage config when one is present", () => {
    const storage = config("sqlite");
    const backend = createStorageBackend({ storage } as never);
    expect(backend.kind).toBe("sqlite");
  });
});
