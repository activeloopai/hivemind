import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { loadStorageConfig } from "../../src/config.js";
import { renderBackendStatus, runBackendCommand, selectedBackend } from "../../src/commands/backend.js";
import { createStorageBackend } from "../../src/storage/factory.js";
import { _resetUserConfigForTesting, _setConfigPathForTesting, readUserConfig, writeUserConfig } from "../../src/user-config.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hivemind-storage-config-"));
  _setConfigPathForTesting(() => join(root, "config.json"));
  for (const key of ["HIVEMIND_BACKEND", "HIVEMIND_SQLITE_PATH", "HIVEMIND_POSTGRES_URL", "HIVEMIND_POSTGRES_SCHEMA", "HIVEMIND_VECTOR_SCAN_LIMIT"]) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetUserConfigForTesting();
  rmSync(root, { recursive: true, force: true });
});

describe("storage configuration", () => {
  it("loads SQLite without Deeplake credentials", () => {
    const dbPath = join(root, "local.sqlite3");
    writeUserConfig({ storage: { provider: "sqlite", sqlitePath: dbPath } });
    const config = loadStorageConfig();
    expect(config).toMatchObject({ kind: "sqlite", path: dbPath, vectorScanLimit: 2000 });
  });

  it("applies environment precedence and validates scan limits", () => {
    writeUserConfig({ storage: { provider: "sqlite", sqlitePath: join(root, "stored.sqlite3") } });
    process.env.HIVEMIND_SQLITE_PATH = join(root, "env.sqlite3");
    process.env.HIVEMIND_VECTOR_SCAN_LIMIT = "37";
    expect(loadStorageConfig()).toMatchObject({ kind: "sqlite", path: join(root, "env.sqlite3"), vectorScanLimit: 37 });
  });

  it("requires the PostgreSQL URL and never renders it", () => {
    writeUserConfig({ storage: { provider: "postgres", postgresSchema: "team_memory" } });
    expect(loadStorageConfig()).toBeNull();
    process.env.HIVEMIND_POSTGRES_URL = "postgres://secret-user:secret-pass@example.test/db";
    expect(loadStorageConfig()).toMatchObject({ kind: "postgres", schema: "team_memory" });
    const status = renderBackendStatus();
    expect(status).toContain("configured via environment");
    expect(status).not.toContain("secret-user");
    expect(status).not.toContain("secret-pass");
  });

  it("rejects invalid provider and schema identifiers", () => {
    process.env.HIVEMIND_BACKEND = "unknown";
    expect(() => loadStorageConfig()).toThrow(/Invalid HIVEMIND_BACKEND/);
    process.env.HIVEMIND_BACKEND = "postgres";
    process.env.HIVEMIND_POSTGRES_URL = "postgres://example/db";
    process.env.HIVEMIND_POSTGRES_SCHEMA = "bad;drop";
    expect(() => loadStorageConfig()).toThrow(/Invalid PostgreSQL schema/);
  });

  it("switches to SQLite only after a successful connectivity check", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const dbPath = join(root, "selected.sqlite3");
    await expect(runBackendCommand(["use", "sqlite", "--path", dbPath])).resolves.toBe(0);
    expect(selectedBackend()).toBe("sqlite");
    expect(readUserConfig().storage).toEqual({ provider: "sqlite", sqlitePath: dbPath });
    await expect(runBackendCommand(["check"])).resolves.toBe(0);
    expect(log.mock.calls.flat().join(" ")).toContain("sqlite backend: ok");
    const config = loadStorageConfig();
    expect(config?.kind).toBe("sqlite");
    const backend = createStorageBackend(config!);
    expect(await backend.listTables()).toEqual([
      "codebase", "hivemind_docs", "hivemind_goals", "hivemind_kpis",
      "hivemind_rules", "memory", "sessions", "skills",
    ]);
    await backend.close();
  });

  it("does not select PostgreSQL when the environment URL is missing", async () => {
    await expect(runBackendCommand(["use", "postgres", "--schema", "team_memory"]))
      .rejects.toThrow(/HIVEMIND_POSTGRES_URL/);
    expect(readUserConfig().storage).toBeUndefined();
  });

  it("renders default, SQLite, and PostgreSQL status without secrets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(renderBackendStatus()).toContain("Backend: deeplake\nSelected by: default");
    await expect(runBackendCommand(["status"])).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Connection: Deeplake credentials"));

    process.env.HIVEMIND_BACKEND = "sqlite";
    process.env.HIVEMIND_SQLITE_PATH = join(homedir(), ".deeplake", "status.sqlite3");
    expect(renderBackendStatus()).toContain("Database: ~/.deeplake/status.sqlite3");
    expect(renderBackendStatus()).toContain("Selected by: environment");

    process.env.HIVEMIND_BACKEND = "postgres";
    delete process.env.HIVEMIND_POSTGRES_URL;
    process.env.HIVEMIND_POSTGRES_SCHEMA = "status_schema";
    expect(renderBackendStatus()).toContain("Schema: status_schema");
    expect(renderBackendStatus()).toContain("Connection: not configured");
  });

  it("persists Deeplake selection and accepts equals-style SQLite paths", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    writeUserConfig({ storage: { provider: "sqlite", sqlitePath: join(root, "old.sqlite3") } });
    await expect(runBackendCommand(["use", "deeplake"])).resolves.toBe(0);
    expect(readUserConfig().storage).toEqual({ provider: "deeplake", sqlitePath: join(root, "old.sqlite3") });

    const path = join(root, "equals.sqlite3");
    await expect(runBackendCommand(["use", "sqlite", `--path=${path}`])).resolves.toBe(0);
    expect(readUserConfig().storage).toEqual({ provider: "sqlite", sqlitePath: path });
  });

  it("rejects invalid backend command shapes and PostgreSQL schemas", async () => {
    await expect(runBackendCommand(["wat"])).rejects.toThrow("Usage: hivemind backend status");
    await expect(runBackendCommand(["use"])).rejects.toThrow("Usage: hivemind backend use");
    await expect(runBackendCommand(["use", "unknown"])).rejects.toThrow("Usage: hivemind backend use");
    process.env.HIVEMIND_POSTGRES_URL = "postgresql://secret:password@example.invalid/db";
    await expect(runBackendCommand(["use", "postgres", "--schema", "bad;drop"]))
      .rejects.toThrow("Invalid PostgreSQL schema");
    expect(readUserConfig().storage).toBeUndefined();
  });

  it("reports missing configuration from backend check", async () => {
    process.env.HIVEMIND_BACKEND = "postgres";
    await expect(runBackendCommand(["check"])).rejects.toThrow("PostgreSQL backend requires HIVEMIND_POSTGRES_URL");
  });

  it("uses persisted status values when environment overrides are absent", () => {
    const sqlitePath = join(root, "persisted.sqlite3");
    writeUserConfig({ storage: { provider: "sqlite", sqlitePath } });
    expect(renderBackendStatus()).toContain("Selected by: user config");
    expect(renderBackendStatus()).toContain(`Database: ${sqlitePath}`);

    writeUserConfig({ storage: { provider: "postgres", postgresSchema: "persisted_schema" } });
    expect(renderBackendStatus()).toContain("Schema: persisted_schema");
  });

  it("uses the default SQLite path and restores pre-existing provider environment", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    process.env.HIVEMIND_BACKEND = "deeplake";
    process.env.HIVEMIND_SQLITE_PATH = join(root, "previous.sqlite3");
    try {
      await expect(runBackendCommand(["use", "sqlite"])).resolves.toBe(0);
      expect(readUserConfig().storage).toEqual({
        provider: "sqlite",
        sqlitePath: join(root, ".deeplake", "hivemind.sqlite3"),
      });
      expect(process.env.HIVEMIND_BACKEND).toBe("deeplake");
      expect(process.env.HIVEMIND_SQLITE_PATH).toBe(join(root, "previous.sqlite3"));
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  it("surfaces provider query failures and still closes the backend", async () => {
    process.env.HIVEMIND_BACKEND = "sqlite";
    process.env.HIVEMIND_SQLITE_PATH = root;
    await expect(runBackendCommand(["check"])).rejects.toThrow();
  });

  it("reports missing Deeplake credentials during check", async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    process.env.HIVEMIND_BACKEND = "deeplake";
    try {
      await expect(runBackendCommand(["check"])).rejects.toThrow("Deeplake backend requires login credentials");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });
});
