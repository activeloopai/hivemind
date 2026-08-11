import {
  configFromStorage,
  loadConfig,
  type Config,
  type DeeplakeStorageConfig,
  type StorageProvider,
} from "../config.js";
import { createStorageBackend } from "../storage/factory.js";
import type { StorageBackend } from "../storage/backend.js";
import { DeeplakeApi } from "../deeplake-api.js";

export interface WorkerStorageMetadata {
  storage?: {
    kind: StorageProvider;
    orgId?: string;
    workspaceId?: string;
  };
  memoryTable?: string;
  sessionsTable: string;
  /** Legacy handoff fields, accepted only for old installed bundles/tests. */
  apiUrl?: string;
  token?: string;
  orgId?: string;
  workspaceId?: string;
  userName: string;
}

function legacyConfig(metadata: WorkerStorageMetadata): Config | null {
  if (!metadata.token || !metadata.apiUrl || !metadata.orgId || !metadata.workspaceId) return null;
  const storage: DeeplakeStorageConfig = {
    kind: "deeplake",
    token: metadata.token,
    apiUrl: metadata.apiUrl,
    orgId: metadata.orgId,
    orgName: metadata.orgId,
    userName: metadata.userName,
    workspaceId: metadata.workspaceId,
    tableName: metadata.memoryTable ?? "memory",
    sessionsTableName: metadata.sessionsTable,
    skillsTableName: "skills",
    rulesTableName: "hivemind_rules",
    goalsTableName: "hivemind_goals",
    kpisTableName: "hivemind_kpis",
    docsTableName: "hivemind_docs",
    codebaseTableName: "codebase",
    memoryPath: "",
    vectorScanLimit: 2000,
  };
  return configFromStorage(storage);
}

/** Reload credentials/URLs in the detached process; handoffs contain metadata only. */
export function createWorkerStorage(
  metadata: WorkerStorageMetadata,
  retryLogger?: (message: string) => void,
): StorageBackend {
  let config = legacyConfig(metadata) ?? loadConfig();
  if (!config) throw new Error("Storage configuration is unavailable in worker");

  if (config.storage?.kind === "deeplake" && metadata.storage?.kind === "deeplake") {
    config = {
      ...config,
      orgId: metadata.storage.orgId ?? config.orgId,
      workspaceId: metadata.storage.workspaceId ?? config.workspaceId,
      storage: {
        ...config.storage,
        orgId: metadata.storage.orgId ?? config.storage.orgId,
        workspaceId: metadata.storage.workspaceId ?? config.storage.workspaceId,
      },
    };
  }
  const backend = createStorageBackend(config, metadata.memoryTable ?? config.tableName);
  if (backend instanceof DeeplakeApi && retryLogger) backend.configureWorkerRetries(retryLogger);
  return backend;
}

export async function queryWorkerStorage(
  backend: StorageBackend,
  sql: string,
): Promise<Record<string, unknown>[]> {
  try {
    return await backend.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Query failed:\s*/, "API "));
  }
}
