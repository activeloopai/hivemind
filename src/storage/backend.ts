import { randomUUID } from "node:crypto";
import type { WriteRow } from "../deeplake-api.js";
import {
  CODEBASE_COLUMNS,
  DOCS_COLUMNS,
  GOALS_COLUMNS,
  KPIS_COLUMNS,
  MEMORY_COLUMNS,
  RULES_COLUMNS,
  SESSIONS_COLUMNS,
  SKILLS_COLUMNS,
  type ColumnDef,
  type StorageDialect,
  buildCreateTableSql,
  renderColumnSql,
} from "../deeplake-schema.js";
import { SUMMARY_EMBEDDING_COL } from "../embeddings/columns.js";
import { sqlIdent } from "../utils/sql.js";

export type StorageKind = "deeplake" | "sqlite" | "postgres";
export type SqlValue = string | number | boolean | null | Date | readonly number[] | Record<string, unknown>;
export type QueryRow = Record<string, unknown>;

export interface StorageCapabilities {
  serverVectorSearch: boolean;
  transactions: boolean;
  json: "native" | "text";
  vectors: "server" | "array" | "json-text";
}

export interface ExecuteResult {
  rowCount: number;
}

export interface StorageBackend {
  readonly kind: StorageKind;
  readonly dialect: StorageDialect;
  readonly capabilities: StorageCapabilities;
  readonly tableName: string;

  query(sql: string, paramsOrSignal?: readonly SqlValue[] | AbortSignal, signal?: AbortSignal): Promise<QueryRow[]>;
  execute(sql: string, params?: readonly SqlValue[]): Promise<ExecuteResult>;
  transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T>;
  listTables(forceRefresh?: boolean): Promise<string[]>;
  knownTablesOrNull(): Promise<string[] | null>;
  getColumns(table: string): Promise<string[]>;
  initializeSchema(): Promise<void>;
  close(): Promise<void>;

  appendRows(rows: WriteRow[]): void;
  commit(): Promise<void>;
  updateColumns(path: string, columns: Record<string, string | number>): Promise<void>;
  createIndex(column: string): Promise<void>;
  ensureTable(name?: string): Promise<void>;
  ensureSessionsTable(name: string): Promise<void>;
  ensureSkillsTable(name: string): Promise<void>;
  ensureRulesTable(name: string): Promise<void>;
  ensureGoalsTable(name: string): Promise<void>;
  ensureKpisTable(name: string): Promise<void>;
  ensureDocsTable(name: string): Promise<void>;
  ensureCodebaseTable(name: string): Promise<void>;
}

export interface BackendTableNames {
  memory: string;
  sessions: string;
  skills: string;
  rules: string;
  goals: string;
  kpis: string;
  docs: string;
  codebase: string;
}

const INDEXES: Partial<Record<keyof BackendTableNames, Array<{ suffix: string; columns: string[] }>>> = {
  sessions: [{ suffix: "path_creation_date", columns: ["path", "creation_date"] }],
  skills: [{ suffix: "project_key_name", columns: ["project_key", "name"] }],
  rules: [{ suffix: "rule_id_version", columns: ["rule_id", "version"] }],
  goals: [
    { suffix: "goal_id_version", columns: ["goal_id", "version"] },
    { suffix: "owner_status", columns: ["owner", "status"] },
  ],
  kpis: [{ suffix: "goal_id_kpi_id", columns: ["goal_id", "kpi_id"] }],
  docs: [{ suffix: "doc_id_version", columns: ["doc_id", "version"] }],
  codebase: [{
    suffix: "codebase_identity",
    columns: ["org_id", "workspace_id", "repo_slug", "user_id", "worktree_id", "commit_sha"],
  }],
};

const SCHEMAS: Record<keyof BackendTableNames, readonly ColumnDef[]> = {
  memory: MEMORY_COLUMNS,
  sessions: SESSIONS_COLUMNS,
  skills: SKILLS_COLUMNS,
  rules: RULES_COLUMNS,
  goals: GOALS_COLUMNS,
  kpis: KPIS_COLUMNS,
  docs: DOCS_COLUMNS,
  codebase: CODEBASE_COLUMNS,
};

/** Shared schema/upsert behavior for local SQL providers. */
export abstract class SqlStorageBackend implements StorageBackend {
  abstract readonly kind: StorageKind;
  abstract readonly dialect: StorageDialect;
  abstract readonly capabilities: StorageCapabilities;
  private pendingRows: WriteRow[] = [];

  constructor(
    readonly tableName: string,
    protected readonly tableNames: BackendTableNames,
  ) {}

  abstract query(
    sql: string,
    paramsOrSignal?: readonly SqlValue[] | AbortSignal,
    signal?: AbortSignal,
  ): Promise<QueryRow[]>;
  abstract execute(sql: string, params?: readonly SqlValue[]): Promise<ExecuteResult>;
  abstract transaction<T>(fn: (tx: StorageBackend) => Promise<T>): Promise<T>;
  abstract listTables(forceRefresh?: boolean): Promise<string[]>;
  abstract getColumns(table: string): Promise<string[]>;
  abstract close(): Promise<void>;

  async knownTablesOrNull(): Promise<string[] | null> {
    return this.listTables();
  }

  async initializeSchema(): Promise<void> {
    await this.ensureTable(this.tableNames.memory);
    await this.ensureSessionsTable(this.tableNames.sessions);
    await this.ensureSkillsTable(this.tableNames.skills);
    await this.ensureRulesTable(this.tableNames.rules);
    await this.ensureGoalsTable(this.tableNames.goals);
    await this.ensureKpisTable(this.tableNames.kpis);
    await this.ensureDocsTable(this.tableNames.docs);
    await this.ensureCodebaseTable(this.tableNames.codebase);
  }

  appendRows(rows: WriteRow[]): void {
    this.pendingRows.push(...rows);
  }

  async commit(): Promise<void> {
    if (this.pendingRows.length === 0) return;
    const rows = this.pendingRows;
    this.pendingRows = [];
    await this.transaction(async tx => {
      for (const row of rows) await this.upsertRow(tx, row);
    });
  }

  private async upsertRow(tx: StorageBackend, row: WriteRow): Promise<void> {
    const now = new Date().toISOString();
    const found = await tx.query(
      `SELECT path FROM "${sqlIdent(this.tableName)}" WHERE path = $1 LIMIT 1`,
      [row.path],
    );
    if (found.length > 0) {
      await tx.execute(
        `UPDATE "${sqlIdent(this.tableName)}" SET summary = $1, ${SUMMARY_EMBEDDING_COL} = NULL, ` +
          `mime_type = $2, size_bytes = $3, project = COALESCE($4, project), ` +
          `description = COALESCE($5, description), last_update_date = $6 WHERE path = $7`,
        [row.contentText, row.mimeType, row.sizeBytes, row.project ?? null, row.description ?? null, now, row.path],
      );
      return;
    }
    await tx.execute(
      `INSERT INTO "${sqlIdent(this.tableName)}" ` +
        `(id, path, filename, summary, ${SUMMARY_EMBEDDING_COL}, mime_type, size_bytes, project, description, creation_date, last_update_date) ` +
        `VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10)`,
      [randomUUID(), row.path, row.filename, row.contentText, row.mimeType, row.sizeBytes,
        row.project ?? "", row.description ?? "", row.creationDate ?? now, row.lastUpdateDate ?? now],
    );
  }

  async updateColumns(path: string, columns: Record<string, string | number>): Promise<void> {
    const entries = Object.entries(columns);
    if (entries.length === 0) return;
    const sets = entries.map(([name], i) => `${sqlIdent(name)} = $${i + 1}`).join(", ");
    await this.execute(
      `UPDATE "${sqlIdent(this.tableName)}" SET ${sets} WHERE path = $${entries.length + 1}`,
      [...entries.map(([, value]) => value), path],
    );
  }

  async createIndex(columnName: string): Promise<void> {
    const column = sqlIdent(columnName);
    await this.execute(
      `CREATE INDEX IF NOT EXISTS "idx_${sqlIdent(this.tableName)}_${column}" ` +
        `ON "${sqlIdent(this.tableName)}" ("${column}")`,
    );
  }

  async ensureTable(name = this.tableName): Promise<void> {
    await this.ensureSchema("memory", name);
  }
  async ensureSessionsTable(name: string): Promise<void> { await this.ensureSchema("sessions", name); }
  async ensureSkillsTable(name: string): Promise<void> { await this.ensureSchema("skills", name); }
  async ensureRulesTable(name: string): Promise<void> { await this.ensureSchema("rules", name); }
  async ensureGoalsTable(name: string): Promise<void> { await this.ensureSchema("goals", name); }
  async ensureKpisTable(name: string): Promise<void> { await this.ensureSchema("kpis", name); }
  async ensureDocsTable(name: string): Promise<void> { await this.ensureSchema("docs", name); }
  async ensureCodebaseTable(name: string): Promise<void> { await this.ensureSchema("codebase", name); }

  private async ensureSchema(key: keyof BackendTableNames, tableName: string): Promise<void> {
    const table = sqlIdent(tableName);
    await this.execute(buildCreateTableSql(table, SCHEMAS[key], this.dialect));
    const present = new Set((await this.getColumns(table)).map(name => name.toLowerCase()));
    for (const col of SCHEMAS[key]) {
      if (present.has(col.name.toLowerCase())) continue;
      await this.execute(
        `ALTER TABLE "${table}" ADD COLUMN ${sqlIdent(col.name)} ${renderColumnSql(col, this.dialect)}`,
      );
    }
    for (const index of INDEXES[key] ?? []) {
      const indexName = `idx_${table}_${index.suffix}`.replace(/[^A-Za-z0-9_]/g, "_");
      const columns = index.columns.map(name => `"${sqlIdent(name)}"`).join(", ");
      await this.execute(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${columns})`);
    }
  }
}
