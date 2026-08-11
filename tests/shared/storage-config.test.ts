import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStorageConfig } from "../../src/config.js";
import { renderBackendStatus, runBackendCommand, selectedBackend } from "../../src/commands/backend.js";
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
  });

  it("does not select PostgreSQL when the environment URL is missing", async () => {
    await expect(runBackendCommand(["use", "postgres", "--schema", "team_memory"]))
      .rejects.toThrow(/HIVEMIND_POSTGRES_URL/);
    expect(readUserConfig().storage).toBeUndefined();
  });
});
