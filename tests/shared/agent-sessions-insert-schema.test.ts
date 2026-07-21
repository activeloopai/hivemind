import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_COLUMNS } from "../../src/deeplake-schema.js";

/**
 * Every agent builds its own `sessions` INSERT as an inline SQL string — a
 * hand-maintained copy of the canonical column set. The `pi` extension already
 * shipped exactly this drift: its INSERT wrote `plugin_version` while its
 * CREATE/heal did not, so every pi sessions table was one column short and every
 * INSERT failed permanently with `column "plugin_version" ... does not exist`
 * (42703). (pi has its own INSERT ⊆ CREATE guard in tests/pi.)
 *
 * The shared-path agents below derive their CREATE TABLE and schema-heal from
 * SESSIONS_COLUMNS, so the invariant that keeps them safe is: every column an
 * INSERT writes must exist in SESSIONS_COLUMNS — otherwise CREATE/heal never
 * create it and the write 42703s. Lock it so the pi bug can't reappear here.
 */
// The claude/codex/cursor/hermes capture hooks and codex/stop.ts all build
// their single-row INSERT through the shared buildDirectSessionInsertSql
// helper, so its one column list covers every direct-insert agent. The
// batched queue path keeps its own inline column list.
const SESSIONS_INSERT_FILES = [
  "src/hooks/shared/session-insert-sql.ts",
  "src/hooks/session-queue.ts",
];

const CANONICAL = new Set(SESSIONS_COLUMNS.map(c => c.name.toLowerCase()));

// The column list is the only parenthesised group that begins with the
// canonical leading columns; the VALUES tuples start with quoted literals.
function sessionsInsertColumns(src: string): string[] {
  const m = src.match(/\(\s*id,\s*path,\s*filename,\s*message\b[^)]*\)/);
  expect(m).not.toBeNull();
  return m![0]
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);
}

describe("agent sessions INSERT ⊆ canonical SESSIONS_COLUMNS", () => {
  for (const rel of SESSIONS_INSERT_FILES) {
    it(`${rel}: every sessions INSERT column exists in SESSIONS_COLUMNS`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf-8");
      const missing = sessionsInsertColumns(src).filter(c => !CANONICAL.has(c));
      expect(missing).toEqual([]);
    });
  }
});
