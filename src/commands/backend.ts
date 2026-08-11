import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadStorageConfig, type StorageProvider } from "../config.js";
import { createStorageBackend } from "../storage/factory.js";
import { readUserConfig, writeUserConfig } from "../user-config.js";

const PROVIDERS = new Set<StorageProvider>(["deeplake", "sqlite", "postgres"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function option(args: string[], name: string): string | undefined {
  const index = args.findIndex(arg => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return undefined;
  return args[index].includes("=") ? args[index].split("=", 2)[1] : args[index + 1];
}

export function selectedBackend(): StorageProvider {
  const raw = process.env.HIVEMIND_BACKEND ?? readUserConfig().storage?.provider ?? "deeplake";
  if (!PROVIDERS.has(raw as StorageProvider)) throw new Error(`Invalid HIVEMIND_BACKEND: ${raw}`);
  return raw as StorageProvider;
}

function displayPath(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function renderBackendStatus(): string {
  const persisted = readUserConfig().storage;
  const provider = selectedBackend();
  const source = process.env.HIVEMIND_BACKEND ? "environment" : persisted?.provider ? "user config" : "default";
  const lines = [`Backend: ${provider}`, `Selected by: ${source}`];
  if (provider === "sqlite") {
    const path = resolve(process.env.HIVEMIND_SQLITE_PATH ?? persisted?.sqlitePath ?? join(homedir(), ".deeplake", "hivemind.sqlite3"));
    lines.push(`Database: ${displayPath(path)}`);
  } else if (provider === "postgres") {
    lines.push(`Schema: ${process.env.HIVEMIND_POSTGRES_SCHEMA ?? persisted?.postgresSchema ?? "hivemind"}`);
    lines.push(`Connection: ${process.env.HIVEMIND_POSTGRES_URL ? "configured via environment" : "not configured"}`);
  } else {
    lines.push("Connection: Deeplake credentials");
  }
  return lines.join("\n");
}

async function withProviderEnvironment<T>(
  provider: StorageProvider,
  overrides: Partial<Record<"HIVEMIND_SQLITE_PATH" | "HIVEMIND_POSTGRES_SCHEMA", string>>,
  fn: () => Promise<T>,
): Promise<T> {
  const keys = ["HIVEMIND_BACKEND", ...Object.keys(overrides)] as const;
  const previous = new Map<string, string | undefined>(keys.map(key => [key, process.env[key]]));
  process.env.HIVEMIND_BACKEND = provider;
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) process.env[key] = value;
  try { return await fn(); } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function checkSelected(): Promise<void> {
  const provider = selectedBackend();
  const config = loadStorageConfig();
  if (!config) {
    if (provider === "postgres") throw new Error("PostgreSQL backend requires HIVEMIND_POSTGRES_URL");
    if (provider === "deeplake") throw new Error("Deeplake backend requires login credentials");
    throw new Error(`Unable to load ${provider} backend configuration`);
  }
  const backend = createStorageBackend(config);
  try {
    await backend.query("SELECT 1 AS ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const redacted = config.kind === "postgres"
      ? message.split(config.connectionUrl).join("[redacted PostgreSQL URL]")
      : message;
    throw new Error(redacted);
  } finally {
    await backend.close();
  }
}

export async function runBackendCommand(args: string[]): Promise<number> {
  const sub = args[0] ?? "status";
  if (sub === "status") {
    console.log(renderBackendStatus());
    return 0;
  }
  if (sub === "check") {
    await checkSelected();
    console.log(`${selectedBackend()} backend: ok`);
    return 0;
  }
  if (sub !== "use") throw new Error("Usage: hivemind backend status | use <deeplake|sqlite|postgres> | check");

  const provider = args[1] as StorageProvider | undefined;
  if (!provider || !PROVIDERS.has(provider)) {
    throw new Error("Usage: hivemind backend use deeplake | sqlite [--path <file>] | postgres [--schema <name>]");
  }

  if (provider === "deeplake") {
    writeUserConfig({ storage: { provider: "deeplake" } });
    console.log("Backend set to deeplake.");
    return 0;
  }

  if (provider === "sqlite") {
    const path = resolve(option(args.slice(2), "--path") ?? join(homedir(), ".deeplake", "hivemind.sqlite3"));
    await withProviderEnvironment("sqlite", { HIVEMIND_SQLITE_PATH: path }, async () => {
      await checkSelected();
    });
    writeUserConfig({ storage: { provider: "sqlite", sqlitePath: path } });
    console.log(`Backend set to sqlite (${displayPath(path)}).`);
    return 0;
  }

  const schema = option(args.slice(2), "--schema") ?? "hivemind";
  if (!IDENTIFIER.test(schema)) throw new Error(`Invalid PostgreSQL schema: ${schema}`);
  if (!process.env.HIVEMIND_POSTGRES_URL) {
    throw new Error("PostgreSQL backend requires HIVEMIND_POSTGRES_URL; the URL is never persisted");
  }
  await withProviderEnvironment("postgres", { HIVEMIND_POSTGRES_SCHEMA: schema }, async () => {
    await checkSelected();
  });
  writeUserConfig({ storage: { provider: "postgres", postgresSchema: schema } });
  console.log(`Backend set to postgres (schema ${schema}; connection URL kept in environment).`);
  return 0;
}
