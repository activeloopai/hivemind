import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { WriteRow } from "../deeplake-api.js";
import type { BackendTableNames, ExecuteResult, QueryRow, SqlValue, StorageBackend } from "./backend.js";
import { SqlStorageBackend } from "./backend.js";

const BUSY_RETRIES = 6;
const BUSY_BASE_DELAY_MS = 25;

function isBusy(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "SQLITE_BUSY" || /database is (?:locked|busy)|SQLITE_BUSY/i.test(message);
}

function bindValue(value: SqlValue): string | number | bigint | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function decodeRow(row: QueryRow): QueryRow {
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (key === "message" || key.endsWith("_embedding")) out[key] = parseJson(value);
  }
  return out;
}

function compileParameters(sql: string, params: readonly SqlValue[]): { sql: string; values: Array<string | number | bigint | null> } {
  const values: Array<string | number | bigint | null> = [];
  const compiled = sql.replace(/\$(\d+)/g, (_all, index: string) => {
    const value = params[Number(index) - 1];
    if (value === undefined && Number(index) > params.length) {
      throw new Error(`Missing SQL parameter $${index}`);
    }
    values.push(bindValue(value));
    return "?";
  });
  return { sql: compiled, values };
}

export class SqliteBackend extends SqlStorageBackend {
  readonly kind = "sqlite" as const;
  readonly dialect = "sqlite" as const;
  readonly capabilities = {
    serverVectorSearch: false,
    transactions: true,
    json: "text",
    vectors: "json-text",
  } as const;

  private readonly dbPromise: Promise<DatabaseSync>;
  private tail: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    readonly path: string,
    tableName: string,
    tableNames: BackendTableNames,
  ) {
    super(tableName, tableNames);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Keep node:sqlite out of non-SQLite startup. In bundled runtimes this
    // remains a native dynamic import, so Deeplake/PostgreSQL users do not
    // load the experimental SQLite module or see its warning.
    this.dbPromise = import("node:sqlite").then(async ({ DatabaseSync }) => {
      const db = new DatabaseSync(path, { timeout: 5000 });
      db["exec"]("PRAGMA busy_timeout=5000");
      await this.runBusy(() => db["exec"]("PRAGMA journal_mode=WAL"));
      await this.runBusy(() => db["exec"]("PRAGMA foreign_keys=ON"));
      await this.runBusy(() => db["exec"]("PRAGMA synchronous=NORMAL"));
      db.function("ARRAY_LENGTH", (raw: unknown) => {
        const parsed = parseJson(raw);
        return Array.isArray(parsed) ? parsed.length : null;
      });
      db.function("GREATEST", (...values: unknown[]) => Math.max(...values.map(Number)));
      db.function("NOW", () => new Date().toISOString());
      return db;
    });
  }

  async query(
    sql: string,
    paramsOrSignal: readonly SqlValue[] | AbortSignal = [],
    signal?: AbortSignal,
  ): Promise<QueryRow[]> {
    const params = paramsOrSignal instanceof AbortSignal ? [] : paramsOrSignal;
    const activeSignal = paramsOrSignal instanceof AbortSignal ? paramsOrSignal : signal;
    if (activeSignal?.aborted) throw new Error("Query aborted");
    return this.withLock(() => this.queryDirect(sql, params, activeSignal));
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<ExecuteResult> {
    return this.withLock(() => this.executeDirect(sql, params));
  }

  async transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const db = await this.dbPromise;
      await this.runBusy(() => db["exec"]("BEGIN IMMEDIATE"));
      const tx = this.transactionView();
      try {
        const result = await fn(tx);
        db["exec"]("COMMIT");
        return result;
      } catch (error) {
        try { db["exec"]("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      }
    });
  }

  async listTables(): Promise<string[]> {
    const rows = await this.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return rows.map(row => String(row.name));
  }

  async getColumns(table: string): Promise<string[]> {
    // The identifier is validated by schema callers before reaching here.
    const rows = await this.query(`PRAGMA table_info("${table}")`);
    return rows.map(row => String(row.name));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.tail;
    (await this.dbPromise).close();
    this.closed = true;
  }

  private transactionView(): StorageBackend {
    const self = this;
    return new Proxy(this, {
      get(target, property, receiver) {
        if (property === "query") {
          return (sql: string, paramsOrSignal: readonly SqlValue[] | AbortSignal = [], signal?: AbortSignal) => {
            const params = paramsOrSignal instanceof AbortSignal ? [] : paramsOrSignal;
            const activeSignal = paramsOrSignal instanceof AbortSignal ? paramsOrSignal : signal;
            return self.queryDirect(sql, params, activeSignal);
          };
        }
        if (property === "execute") return (sql: string, params: readonly SqlValue[] = []) => self.executeDirect(sql, params);
        if (property === "transaction") return <T>(fn: (tx: StorageBackend) => Promise<T>) => fn(receiver as StorageBackend);
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  private async queryDirect(sql: string, params: readonly SqlValue[], signal?: AbortSignal): Promise<QueryRow[]> {
    if (signal?.aborted) throw new Error("Query aborted");
    const compiled = compileParameters(sql, params);
    const db = await this.dbPromise;
    return this.runBusy(() => {
      const statement = db.prepare(compiled.sql);
      const readsRows = /^\s*(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(compiled.sql) || /\bRETURNING\b/i.test(compiled.sql);
      if (!readsRows) {
        statement.run(...compiled.values);
        return [];
      }
      return statement.all(...compiled.values).map(row => decodeRow(row as QueryRow));
    });
  }

  private async executeDirect(sql: string, params: readonly SqlValue[]): Promise<ExecuteResult> {
    const compiled = compileParameters(sql, params);
    const db = await this.dbPromise;
    return this.runBusy(() => {
      const result = db.prepare(compiled.sql).run(...compiled.values);
      return { rowCount: Number(result.changes) };
    });
  }

  private async runBusy<T>(fn: () => T): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
      try { return fn(); } catch (error) {
        lastError = error;
        if (!isBusy(error) || attempt === BUSY_RETRIES) throw error;
        await new Promise(resolve => setTimeout(resolve, BUSY_BASE_DELAY_MS * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error("SQLite backend is closed");
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
}

export type { WriteRow };
