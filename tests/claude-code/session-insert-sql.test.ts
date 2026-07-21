import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDirectSessionInsertSql } from "../../src/hooks/shared/session-insert-sql.js";

/**
 * C1 regression coverage: session-event INSERTs must be idempotent.
 *
 * The sessions table has no UNIQUE constraint on `id`, so a plain
 * `INSERT ... VALUES` that the API layer retries after a transient 5xx
 * (the request committed but the gateway returned 502/503) creates a
 * duplicate row — this is what produced the ~17% duplicate rows observed
 * in production during the 2026-07-10 gateway-degradation window.
 *
 * The fix builds every capture INSERT via `INSERT ... SELECT ... WHERE NOT
 * EXISTS (id = ...)`, so a re-send of the same event is a no-op. Verified
 * lag-safe against the real backend in the e2e probe; these tests lock the
 * SQL shape (source) and the shipped artifact (bundle).
 */

const params = {
  id: "row-123",
  sessionPath: "/sessions/u/s.jsonl",
  filename: "s.jsonl",
  jsonForSql: `{"type":"tool_call","note":"it''s fine"}`,
  embeddingSql: "NULL",
  userName: "u",
  sizeBytes: 42,
  projectName: "proj",
  description: "PostToolUse",
  agent: "claude_code",
  pluginVersion: "9.9.9",
  timestamp: "2026-07-13T00:00:00.000Z",
};

describe("buildDirectSessionInsertSql", () => {
  const sql = buildDirectSessionInsertSql("sessions", params);

  it("uses the idempotent INSERT ... SELECT ... WHERE NOT EXISTS form", () => {
    expect(sql).toMatch(/INSERT INTO "sessions" \(id, path, filename, message, message_embedding,/);
    expect(sql).toMatch(/SELECT '/);
    expect(sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM "sessions" WHERE id = 'row-123'\)/);
  });

  it("is NOT a plain VALUES insert (the duplicate-prone pattern)", () => {
    expect(sql).not.toMatch(/\)\s*VALUES\s*\(/i);
  });

  it("references the same id in the row and in the guard (stable dedup key)", () => {
    const ids = sql.match(/'row-123'/g) ?? [];
    expect(ids.length).toBe(2);
  });

  it("keeps the column prefix isSessionInsertQuery() relies on for retry routing", () => {
    // deeplake-api.ts isSessionInsertQuery: ^insert into "..." (id, path, filename, message,
    expect(sql).toMatch(/^INSERT INTO "sessions" \(\s*id, path, filename, message,/);
  });

  it("casts the JSON payload to jsonb and inlines the embedding literal", () => {
    expect(sql).toContain(`'${params.jsonForSql}'::jsonb`);
    expect(sql).toContain("NULL");
  });

  it("emits an array literal when an embedding vector is present", () => {
    const withVec = buildDirectSessionInsertSql("sessions", { ...params, embeddingSql: "ARRAY[0.1,-0.2]::float4[]" });
    expect(withVec).toContain("ARRAY[0.1,-0.2]::float4[]");
  });
});

/**
 * Bundle-level guard — proves the build didn't drop the fix or re-inline the
 * old bare-VALUES pattern into what users actually ship.
 */
const ROOT = process.cwd();
const BUNDLES: Array<[string, string]> = [
  ["claude-code capture", resolve(ROOT, "harnesses", "claude-code", "bundle", "capture.js")],
  ["codex capture", resolve(ROOT, "harnesses", "codex", "bundle", "capture.js")],
  ["codex stop", resolve(ROOT, "harnesses", "codex", "bundle", "stop.js")],
  ["cursor capture", resolve(ROOT, "harnesses", "cursor", "bundle", "capture.js")],
  ["hermes capture", resolve(ROOT, "harnesses", "hermes", "bundle", "capture.js")],
  ["openclaw index", resolve(ROOT, "harnesses", "openclaw", "dist", "index.js")],
];

for (const [label, path] of BUNDLES) {
  describe(`${label} bundle`, () => {
    const src = readFileSync(path, "utf-8");

    it("ships the idempotency guard", () => {
      expect(src).toMatch(/NOT EXISTS \(SELECT 1 FROM/);
    });

    it("ships no bare VALUES session insert", () => {
      const bareSessionValuesInsert =
        /message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date\)\s*VALUES\s*\(/;
      expect(src).not.toMatch(bareSessionValuesInsert);
    });
  });
}
