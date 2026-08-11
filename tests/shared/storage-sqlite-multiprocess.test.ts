import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteBackend } from "../../src/storage/sqlite.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runWriter(databasePath: string, id: string, count: number): Promise<void> {
  const fixture = fileURLToPath(new URL("../fixtures/sqlite-writer.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", fixture, databasePath, id, String(count)], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`writer ${id} exited ${code}: ${stderr}`)));
  });
}

describe("SQLite multi-process writes", () => {
  it("keeps every event while concurrent writers share a WAL database", async () => {
    const root = mkdtempSync(join(tmpdir(), "hivemind-sqlite-writers-"));
    roots.push(root);
    const databasePath = join(root, "memory.sqlite3");
    await Promise.all(["a", "b", "c", "d"].map(id => runWriter(databasePath, id, 20)));

    const names = {
      memory: "memory", sessions: "sessions", skills: "skills", rules: "hivemind_rules",
      goals: "hivemind_goals", kpis: "hivemind_kpis", docs: "hivemind_docs", codebase: "codebase",
    };
    const backend = new SqliteBackend(databasePath, "sessions", names);
    try {
      expect(await backend.query(`SELECT COUNT(*) AS count FROM "sessions"`)).toEqual([{ count: 80 }]);
      expect(await backend.query(`SELECT COUNT(DISTINCT id) AS count FROM "sessions"`)).toEqual([{ count: 80 }]);
    } finally {
      await backend.close();
    }
  }, 20_000);
});
