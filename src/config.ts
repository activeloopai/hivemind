import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, userInfo } from "node:os";
import { readUserConfig } from "./user-config.js";

export type StorageProvider = "deeplake" | "sqlite" | "postgres";

export interface CommonStorageConfig {
  kind: StorageProvider;
  userName: string;
  workspaceId: string;
  tableName: string;
  sessionsTableName: string;
  skillsTableName: string;
  rulesTableName: string;
  goalsTableName: string;
  kpisTableName: string;
  docsTableName: string;
  codebaseTableName: string;
  memoryPath: string;
  vectorScanLimit: number;
}

export interface DeeplakeStorageConfig extends CommonStorageConfig {
  kind: "deeplake";
  apiUrl: string;
  token: string;
  orgId: string;
  orgName: string;
}

export interface SqliteStorageConfig extends CommonStorageConfig {
  kind: "sqlite";
  path: string;
  orgId: "local";
  orgName: "local";
}

export interface PostgresStorageConfig extends CommonStorageConfig {
  kind: "postgres";
  connectionUrl: string;
  schema: string;
  orgId: "local";
  orgName: "local";
}

export type StorageConfig = DeeplakeStorageConfig | SqliteStorageConfig | PostgresStorageConfig;

/**
 * Runtime configuration. Legacy Deeplake-shaped fields remain present so
 * older integrations and third-party harnesses continue to compile. New code
 * should use `storage`, whose discriminant is the provider kind.
 */
export interface Config {
  storage?: StorageConfig;
  token: string;
  orgId: string;
  orgName: string;
  userName: string;
  workspaceId: string;
  apiUrl: string;
  tableName: string;
  sessionsTableName: string;
  skillsTableName: string;
  rulesTableName: string;
  goalsTableName: string;
  kpisTableName: string;
  docsTableName: string;
  codebaseTableName: string;
  memoryPath: string;
  vectorScanLimit?: number;
}

interface Credentials {
  token: string;
  orgId: string;
  orgName?: string;
  userName?: string;
  workspaceId?: string;
  apiUrl?: string;
}

const PROVIDERS = new Set<StorageProvider>(["deeplake", "sqlite", "postgres"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function providerFrom(raw: unknown): StorageProvider {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (!PROVIDERS.has(value as StorageProvider)) {
    if (value) throw new Error(`Invalid HIVEMIND_BACKEND: ${String(raw)}`);
    return "deeplake";
  }
  return value as StorageProvider;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function commonStorage(home: string, creds: Credentials | null): Omit<CommonStorageConfig, "kind"> {
  return {
    userName: creds?.userName || userInfo().username || "unknown",
    workspaceId: process.env.HIVEMIND_WORKSPACE_ID ?? creds?.workspaceId ?? "default",
    tableName: process.env.HIVEMIND_TABLE ?? "memory",
    sessionsTableName: process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions",
    skillsTableName: process.env.HIVEMIND_SKILLS_TABLE ?? "skills",
    rulesTableName: process.env.HIVEMIND_RULES_TABLE ?? "hivemind_rules",
    goalsTableName: process.env.HIVEMIND_GOALS_TABLE ?? "hivemind_goals",
    kpisTableName: process.env.HIVEMIND_KPIS_TABLE ?? "hivemind_kpis",
    docsTableName: process.env.HIVEMIND_DOCS_TABLE ?? "hivemind_docs",
    codebaseTableName: process.env.HIVEMIND_CODEBASE_TABLE ?? "codebase",
    memoryPath: process.env.HIVEMIND_MEMORY_PATH ?? join(home, ".deeplake", "memory"),
    vectorScanLimit: positiveInteger(process.env.HIVEMIND_VECTOR_SCAN_LIMIT, 2000),
  };
}

export function loadStorageConfig(): StorageConfig | null {
  const home = homedir();
  const credPath = join(home, ".deeplake", "credentials.json");
  let creds: Credentials | null = null;
  if (existsSync(credPath)) {
    try {
      creds = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      creds = null;
    }
  }

  const persisted = readUserConfig().storage;
  const provider = providerFrom(process.env.HIVEMIND_BACKEND ?? persisted?.provider);
  const common = commonStorage(home, creds);

  if (provider === "sqlite") {
    const path = process.env.HIVEMIND_SQLITE_PATH ?? persisted?.sqlitePath ?? join(home, ".deeplake", "hivemind.sqlite3");
    return { ...common, kind: "sqlite", path: resolve(path), orgId: "local", orgName: "local" };
  }

  if (provider === "postgres") {
    const connectionUrl = process.env.HIVEMIND_POSTGRES_URL;
    if (!connectionUrl) return null;
    const schema = process.env.HIVEMIND_POSTGRES_SCHEMA ?? persisted?.postgresSchema ?? "hivemind";
    if (!IDENTIFIER.test(schema)) throw new Error(`Invalid PostgreSQL schema: ${schema}`);
    return { ...common, kind: "postgres", connectionUrl, schema, orgId: "local", orgName: "local" };
  }

  const token = process.env.HIVEMIND_TOKEN ?? creds?.token;
  const orgId = process.env.HIVEMIND_ORG_ID ?? creds?.orgId;
  if (!token || !orgId) return null;
  return {
    ...common,
    kind: "deeplake",
    token,
    orgId,
    orgName: creds?.orgName ?? orgId,
    apiUrl: process.env.HIVEMIND_API_URL ?? creds?.apiUrl ?? "https://api.deeplake.ai",
  };
}

export function configFromStorage(storage: StorageConfig): Config {
  return {
    storage,
    token: storage.kind === "deeplake" ? storage.token : "",
    apiUrl: storage.kind === "deeplake" ? storage.apiUrl : "",
    orgId: storage.orgId,
    orgName: storage.orgName,
    userName: storage.userName,
    workspaceId: storage.workspaceId,
    tableName: storage.tableName,
    sessionsTableName: storage.sessionsTableName,
    skillsTableName: storage.skillsTableName,
    rulesTableName: storage.rulesTableName,
    goalsTableName: storage.goalsTableName,
    kpisTableName: storage.kpisTableName,
    docsTableName: storage.docsTableName,
    codebaseTableName: storage.codebaseTableName,
    memoryPath: storage.memoryPath,
    vectorScanLimit: storage.vectorScanLimit,
  };
}

export function storageFromConfig(config: Config): StorageConfig {
  if (config.storage) return config.storage;
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

export function loadConfig(): Config | null {
  const storage = loadStorageConfig();
  return storage ? configFromStorage(storage) : null;
}
