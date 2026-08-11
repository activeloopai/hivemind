import { Pool, type PoolClient } from "pg";
import type { BackendTableNames, ExecuteResult, QueryRow, SqlValue, StorageBackend } from "./backend.js";
import { SqlStorageBackend } from "./backend.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function pgValue(value: SqlValue): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export class PostgresBackend extends SqlStorageBackend {
  readonly kind = "postgres" as const;
  readonly dialect = "postgres" as const;
  readonly capabilities = {
    serverVectorSearch: false,
    transactions: true,
    json: "native",
    vectors: "array",
  } as const;

  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(
    connectionUrl: string,
    readonly schema: string,
    tableName: string,
    tableNames: BackendTableNames,
  ) {
    super(tableName, tableNames);
    if (!IDENTIFIER.test(schema)) throw new Error(`Invalid PostgreSQL schema: ${schema}`);
    this.pool = new Pool({
      connectionString: connectionUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      allowExitOnIdle: true,
      options: `-c search_path=${schema} -c statement_timeout=10000`,
    });
    this.ready = this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`).then(() => undefined);
  }

  async query(
    sql: string,
    paramsOrSignal: readonly SqlValue[] | AbortSignal = [],
    signal?: AbortSignal,
  ): Promise<QueryRow[]> {
    await this.ready;
    const params = paramsOrSignal instanceof AbortSignal ? [] : paramsOrSignal;
    const activeSignal = paramsOrSignal instanceof AbortSignal ? paramsOrSignal : signal;
    if (activeSignal?.aborted) throw new Error("Query aborted");
    const result = await this.pool.query({
      text: sql,
      values: params.map(pgValue),
      signal: activeSignal,
    } as any);
    return result.rows as QueryRow[];
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<ExecuteResult> {
    await this.ready;
    const result = await this.pool.query(sql, params.map(pgValue));
    return { rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(this.transactionView(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async listTables(): Promise<string[]> {
    const rows = await this.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
      [this.schema],
    );
    return rows.map(row => String(row.table_name));
  }

  async getColumns(table: string): Promise<string[]> {
    const rows = await this.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
      [this.schema, table],
    );
    return rows.map(row => String(row.column_name));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private transactionView(client: PoolClient): StorageBackend {
    const self = this;
    return new Proxy(this, {
      get(target, property, receiver) {
        if (property === "query") {
          return async (sql: string, paramsOrSignal: readonly SqlValue[] | AbortSignal = [], signal?: AbortSignal) => {
            const params = paramsOrSignal instanceof AbortSignal ? [] : paramsOrSignal;
            const activeSignal = paramsOrSignal instanceof AbortSignal ? paramsOrSignal : signal;
            if (activeSignal?.aborted) throw new Error("Query aborted");
            const result = await client.query({ text: sql, values: params.map(pgValue), signal: activeSignal } as any);
            return result.rows as QueryRow[];
          };
        }
        if (property === "execute") {
          return async (sql: string, params: readonly SqlValue[] = []) => {
            const result = await client.query(sql, params.map(pgValue));
            return { rowCount: result.rowCount ?? 0 };
          };
        }
        if (property === "transaction") return <T>(fn: (tx: StorageBackend) => Promise<T>) => fn(receiver as StorageBackend);
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
}
