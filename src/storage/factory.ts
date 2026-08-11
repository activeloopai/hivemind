import type { Config, StorageConfig } from "../config.js";
import { DeeplakeApi, type WriteRow } from "../deeplake-api.js";
import type {
  BackendTableNames,
  ExecuteResult,
  QueryRow,
  SqlValue,
  StorageBackend,
} from "./backend.js";

function tableNames(config: StorageConfig): BackendTableNames {
  return {
    memory: config.tableName,
    sessions: config.sessionsTableName,
    skills: config.skillsTableName,
    rules: config.rulesTableName,
    goals: config.goalsTableName,
    kpis: config.kpisTableName,
    docs: config.docsTableName,
    codebase: config.codebaseTableName,
  };
}

function asStorageConfig(config: Config | StorageConfig): StorageConfig {
  if ("kind" in config) return config;
  if (config.storage) return config.storage;
  // Keep accepting the original Deeplake-shaped Config. Besides preserving the
  // public API, this avoids forcing integrations that mock Config to learn
  // about the new storage helpers.
  return {
    kind: "deeplake",
    token: config.token,
    apiUrl: config.apiUrl,
    orgId: config.orgId,
    orgName: config.orgName,
    userName: config.userName,
    workspaceId: config.workspaceId,
    tableName: config.tableName,
    sessionsTableName: config.sessionsTableName,
    skillsTableName: config.skillsTableName,
    rulesTableName: config.rulesTableName,
    goalsTableName: config.goalsTableName,
    kpisTableName: config.kpisTableName,
    docsTableName: config.docsTableName,
    codebaseTableName: config.codebaseTableName,
    memoryPath: config.memoryPath,
    vectorScanLimit: config.vectorScanLimit ?? 2000,
  };
}

class LazySqliteBackend implements StorageBackend {
  readonly kind = "sqlite" as const;
  readonly dialect = "sqlite" as const;
  readonly capabilities = {
    serverVectorSearch: false,
    transactions: true,
    json: "text",
    vectors: "json-text",
  } as const;
  private backendPromise: Promise<StorageBackend> | null = null;
  private pendingRows: WriteRow[] = [];

  constructor(
    private readonly config: Extract<StorageConfig, { kind: "sqlite" }>,
    readonly tableName: string,
  ) {}

  private backend(): Promise<StorageBackend> {
    if (!this.backendPromise) {
      this.backendPromise = import("./sqlite.js").then(({ SqliteBackend }) =>
        new SqliteBackend(this.config.path, this.tableName, tableNames(this.config)),
      );
    }
    return this.backendPromise;
  }

  async query(sql: string, paramsOrSignal?: readonly SqlValue[] | AbortSignal, signal?: AbortSignal): Promise<QueryRow[]> {
    return (await this.backend()).query(sql, paramsOrSignal, signal);
  }
  async execute(sql: string, params?: readonly SqlValue[]): Promise<ExecuteResult> {
    return (await this.backend()).execute(sql, params);
  }
  async transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T> {
    return (await this.backend()).transaction(fn);
  }
  async listTables(forceRefresh?: boolean): Promise<string[]> { return (await this.backend()).listTables(forceRefresh); }
  async knownTablesOrNull(): Promise<string[] | null> { return (await this.backend()).knownTablesOrNull(); }
  async getColumns(table: string): Promise<string[]> { return (await this.backend()).getColumns(table); }
  async initializeSchema(): Promise<void> { await (await this.backend()).initializeSchema(); }
  async close(): Promise<void> { if (this.backendPromise) await (await this.backendPromise).close(); }
  appendRows(rows: WriteRow[]): void { this.pendingRows.push(...rows); }
  async commit(): Promise<void> {
    const backend = await this.backend();
    if (this.pendingRows.length > 0) {
      backend.appendRows(this.pendingRows);
      this.pendingRows = [];
    }
    await backend.commit();
  }
  async updateColumns(path: string, columns: Record<string, string | number>): Promise<void> {
    await (await this.backend()).updateColumns(path, columns);
  }
  async createIndex(column: string): Promise<void> { await (await this.backend()).createIndex(column); }
  async ensureTable(name?: string): Promise<void> { await (await this.backend()).ensureTable(name); }
  async ensureSessionsTable(name: string): Promise<void> { await (await this.backend()).ensureSessionsTable(name); }
  async ensureSkillsTable(name: string): Promise<void> { await (await this.backend()).ensureSkillsTable(name); }
  async ensureRulesTable(name: string): Promise<void> { await (await this.backend()).ensureRulesTable(name); }
  async ensureGoalsTable(name: string): Promise<void> { await (await this.backend()).ensureGoalsTable(name); }
  async ensureKpisTable(name: string): Promise<void> { await (await this.backend()).ensureKpisTable(name); }
  async ensureDocsTable(name: string): Promise<void> { await (await this.backend()).ensureDocsTable(name); }
  async ensureCodebaseTable(name: string): Promise<void> { await (await this.backend()).ensureCodebaseTable(name); }
}

class LazyPostgresBackend implements StorageBackend {
  readonly kind = "postgres" as const;
  readonly dialect = "postgres" as const;
  readonly capabilities = {
    serverVectorSearch: false,
    transactions: true,
    json: "native",
    vectors: "array",
  } as const;
  private backendPromise: Promise<StorageBackend> | null = null;
  private pendingRows: WriteRow[] = [];

  constructor(
    private readonly config: Extract<StorageConfig, { kind: "postgres" }>,
    readonly tableName: string,
  ) {}

  private backend(): Promise<StorageBackend> {
    if (!this.backendPromise) {
      this.backendPromise = import("./postgres.js").then(({ PostgresBackend }) =>
        new PostgresBackend(
          this.config.connectionUrl,
          this.config.schema,
          this.tableName,
          tableNames(this.config),
        ),
      );
    }
    return this.backendPromise;
  }

  async query(sql: string, paramsOrSignal?: readonly SqlValue[] | AbortSignal, signal?: AbortSignal): Promise<QueryRow[]> {
    return (await this.backend()).query(sql, paramsOrSignal, signal);
  }
  async execute(sql: string, params?: readonly SqlValue[]): Promise<ExecuteResult> {
    return (await this.backend()).execute(sql, params);
  }
  async transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T> {
    return (await this.backend()).transaction(fn);
  }
  async listTables(forceRefresh?: boolean): Promise<string[]> { return (await this.backend()).listTables(forceRefresh); }
  async knownTablesOrNull(): Promise<string[] | null> { return (await this.backend()).knownTablesOrNull(); }
  async getColumns(table: string): Promise<string[]> { return (await this.backend()).getColumns(table); }
  async initializeSchema(): Promise<void> { await (await this.backend()).initializeSchema(); }
  async close(): Promise<void> { if (this.backendPromise) await (await this.backendPromise).close(); }

  appendRows(rows: WriteRow[]): void { this.pendingRows.push(...rows); }
  async commit(): Promise<void> {
    const backend = await this.backend();
    if (this.pendingRows.length > 0) {
      backend.appendRows(this.pendingRows);
      this.pendingRows = [];
    }
    await backend.commit();
  }
  async updateColumns(path: string, columns: Record<string, string | number>): Promise<void> {
    await (await this.backend()).updateColumns(path, columns);
  }
  async createIndex(column: string): Promise<void> { await (await this.backend()).createIndex(column); }
  async ensureTable(name?: string): Promise<void> { await (await this.backend()).ensureTable(name); }
  async ensureSessionsTable(name: string): Promise<void> { await (await this.backend()).ensureSessionsTable(name); }
  async ensureSkillsTable(name: string): Promise<void> { await (await this.backend()).ensureSkillsTable(name); }
  async ensureRulesTable(name: string): Promise<void> { await (await this.backend()).ensureRulesTable(name); }
  async ensureGoalsTable(name: string): Promise<void> { await (await this.backend()).ensureGoalsTable(name); }
  async ensureKpisTable(name: string): Promise<void> { await (await this.backend()).ensureKpisTable(name); }
  async ensureDocsTable(name: string): Promise<void> { await (await this.backend()).ensureDocsTable(name); }
  async ensureCodebaseTable(name: string): Promise<void> { await (await this.backend()).ensureCodebaseTable(name); }
}

/** Create the configured provider without eagerly loading PostgreSQL. */
export function createStorageBackend(config: Config | StorageConfig, tableOverride?: string): StorageBackend {
  const storage = asStorageConfig(config);
  const activeTable = tableOverride ?? storage.tableName;
  const names = tableNames(storage);

  if (storage.kind === "sqlite") return new LazySqliteBackend(storage, activeTable);
  if (storage.kind === "postgres") return new LazyPostgresBackend(storage, activeTable);
  return new DeeplakeApi(
    storage.token,
    storage.apiUrl,
    storage.orgId,
    storage.workspaceId,
    activeTable,
    names,
  );
}
