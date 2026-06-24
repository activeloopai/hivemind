import { describe, it, expect } from "vitest";
import {
  buildPlaceholderInsertSql,
  createPlaceholderSummary,
  type PlaceholderQueryFn,
  type PlaceholderParams,
} from "../../src/hooks/shared/placeholder-summary.js";

/**
 * Regression tests for the production summary-revert clobber.
 *
 * Mechanism (deeplake-schema.ts: the memory table has NO unique constraint on
 * `path`): a resumed/concurrent SessionStart whose existence SELECT reads
 * stale-empty (Deeplake reads are eventually-consistent) used to INSERT a SECOND
 * placeholder row at the same path as an already-finalized+embedded row. The
 * duplicate `description='in progress', summary_embedding=NULL` stub then
 * shadowed the finalized row under `... LIMIT 1` reads — recall silently
 * dropped it. ~56% of prod summaries were stuck 'in progress', ~75% NULL embed.
 *
 * The fix: the placeholder write is a single atomic
 * `INSERT ... SELECT ... WHERE NOT EXISTS (... path = $p)`. No client-side
 * read sits between the existence check and the insert, so a finalized row can
 * never be reverted to a placeholder/stub, across all agent variants.
 */

const FINALIZED_SUMMARY = `# Session sess-1
- **Project**: my-project

## What Happened
Implemented the placeholder race fix and validated it end to end.
`;

const BASE: PlaceholderParams = {
  table: "memory",
  sessionId: "sess-1",
  cwd: "/home/alice/my-project",
  userName: "alice",
  orgName: "activeloop",
  workspaceId: "default",
  agent: "claude_code",
  pluginVersion: "0.7.104",
  ts: "2030-01-02T03:04:05.000Z",
  uuid: () => "fixed-uuid",
};

const VPATH = "/summaries/alice/sess-1.md";

/** Spy query fn: records every SQL string, returns canned responses in order. */
function makeSpyQuery(responses: Array<Array<Record<string, unknown>>> = [[]]): {
  fn: PlaceholderQueryFn;
  calls: string[];
} {
  const calls: string[] = [];
  let i = 0;
  const fn: PlaceholderQueryFn = async (sql: string) => {
    calls.push(sql);
    return responses[i++] ?? [];
  };
  return { fn, calls };
}

/**
 * A tiny in-memory model of the memory table that mirrors the real Deeplake
 * semantics that caused the bug:
 *   - `path` is NOT unique — a plain INSERT appends a duplicate row.
 *   - `INSERT ... WHERE NOT EXISTS (... path=$p)` is atomic and writes nothing
 *     when a row already exists at that path.
 * This lets the regression test exercise the actual SQL the hook emits.
 */
function makeTableModel(initialRows: Array<Record<string, unknown>> = []): {
  query: PlaceholderQueryFn;
  rows: Array<Record<string, unknown>>;
} {
  const rows = [...initialRows];
  const query: PlaceholderQueryFn = async (sql: string) => {
    // SELECT path ... WHERE path = '...' LIMIT 1   (fast-path existence probe)
    const selExist = sql.match(/^SELECT path FROM .* WHERE path = '([^']+)' LIMIT 1/i);
    if (selExist) {
      return rows.filter(r => r.path === selExist[1]).slice(0, 1);
    }
    // INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM t WHERE path = '...')
    const notExists = sql.match(/WHERE NOT EXISTS \(SELECT 1 FROM .* WHERE path = '([^']+)'\)/i);
    if (/^INSERT INTO/i.test(sql) && notExists) {
      const p = notExists[1];
      if (rows.some(r => r.path === p)) return []; // atomic guard fires — no-op
      rows.push({ path: p, summary: "# Session sess-1\n- **Status**: in-progress\n", description: "in progress", summary_embedding: null });
      return [];
    }
    // A plain (un-guarded) INSERT would always append — model that too so a
    // regression that drops the WHERE NOT EXISTS is caught.
    if (/^INSERT INTO/i.test(sql)) {
      rows.push({ path: VPATH, description: "in progress", summary_embedding: null });
      return [];
    }
    return [];
  };
  return { query, rows };
}

describe("buildPlaceholderInsertSql — atomic, finalize-safe placeholder write", () => {
  it("emits a single INSERT ... SELECT ... WHERE NOT EXISTS guarded on path", () => {
    const { sql, summaryPath } = buildPlaceholderInsertSql(BASE);
    expect(summaryPath).toBe(VPATH);
    expect(sql).toMatch(/^INSERT INTO "memory"/i);
    // NOT a plain VALUES insert — must be the conditional SELECT form.
    expect(sql).toMatch(/\bSELECT\b/i);
    expect(sql).not.toMatch(/\bVALUES\b/i);
    expect(sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM "memory" WHERE path = '\/summaries\/alice\/sess-1\.md'\)/i);
  });

  it("stamps the placeholder description, agent and plugin version", () => {
    const { sql } = buildPlaceholderInsertSql({ ...BASE, agent: "codex", pluginVersion: "9.9.9" });
    expect(sql).toContain("'in progress'");
    expect(sql).toContain("'codex'");
    expect(sql).toContain("'9.9.9'");
  });
});

describe("createPlaceholderSummary — fast-path skip", () => {
  it("skips the INSERT when the existence SELECT already sees a row", async () => {
    const { fn, calls } = makeSpyQuery([[{ path: VPATH }]]);
    const r = await createPlaceholderSummary(fn, BASE);
    expect(r.path).toBe("skip");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^SELECT path/i);
  });

  it("still sends the atomic INSERT when the SELECT throws (stale-read tolerance)", async () => {
    const calls: string[] = [];
    const fn: PlaceholderQueryFn = async (sql: string) => {
      calls.push(sql);
      if (/^SELECT/i.test(sql)) throw new Error("transient read failure");
      return [];
    };
    const r = await createPlaceholderSummary(fn, BASE);
    expect(r.path).toBe("insert");
    // The failed SELECT must NOT block the write — the INSERT is race-safe itself.
    expect(calls.some(s => /^INSERT INTO/i.test(s) && /WHERE NOT EXISTS/i.test(s))).toBe(true);
  });
});

describe("REGRESSION: finalized row must survive a later placeholder / SessionStart write", () => {
  it("a finalized+embedded row is NOT reverted to a stub when SessionStart re-fires", async () => {
    // Row was finalized + embedded by the wiki worker.
    const finalized = {
      path: VPATH,
      summary: FINALIZED_SUMMARY,
      description: "Implemented the placeholder race fix and validated it end to end.",
      summary_embedding: [0.1, 0.2, 0.3],
    };
    const { query, rows } = makeTableModel([finalized]);

    // A resumed / duplicate SessionStart fires createPlaceholder again.
    await createPlaceholderSummary(query, BASE);

    // Exactly one row, still the finalized one — no stub appended, embedding intact.
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Implemented the placeholder race fix and validated it end to end.");
    expect(rows[0].summary_embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("survives a STALE-READ SessionStart (existence SELECT returns empty) — no duplicate stub", async () => {
    const finalized = {
      path: VPATH,
      summary: FINALIZED_SUMMARY,
      description: "real desc",
      summary_embedding: [0.5],
    };
    const rows: Array<Record<string, unknown>> = [finalized];
    // Model the eventually-consistent failure: the fast-path SELECT reads
    // stale-EMPTY even though the finalized row exists. A correct (atomic)
    // INSERT still sees the row server-side and writes nothing; a buggy plain
    // `INSERT ... VALUES` would append a duplicate stub (the production bug).
    const query: PlaceholderQueryFn = async (sql: string) => {
      if (/^SELECT path/i.test(sql)) return []; // STALE: pretends the row isn't there
      if (/^INSERT INTO/i.test(sql)) {
        const notExists = sql.match(/WHERE NOT EXISTS \(SELECT 1 FROM .* WHERE path = '([^']+)'\)/i);
        if (notExists) {
          if (rows.some(r => r.path === notExists[1])) return []; // atomic guard fires — no-op
          rows.push({ path: notExists[1], description: "in progress", summary_embedding: null });
        } else {
          // Plain VALUES INSERT — no constraint on path → duplicate stub appended.
          rows.push({ path: VPATH, description: "in progress", summary_embedding: null });
        }
      }
      return [];
    };

    const r = await createPlaceholderSummary(query, BASE);
    expect(r.path).toBe("insert"); // INSERT was attempted (stale read didn't short-circuit)…
    expect(rows).toHaveLength(1); // …but the atomic WHERE NOT EXISTS made it a no-op.
    expect(rows[0].summary_embedding).toEqual([0.5]);
    expect(rows[0].description).toBe("real desc");
  });

  it("survives a SECOND concurrent worker pass (two placeholder writes, still one row)", async () => {
    const finalized = { path: VPATH, summary: FINALIZED_SUMMARY, description: "real desc", summary_embedding: [0.9] };
    const { query, rows } = makeTableModel([finalized]);

    await Promise.all([
      createPlaceholderSummary(query, BASE),
      createPlaceholderSummary(query, BASE),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("real desc");
    expect(rows[0].summary_embedding).toEqual([0.9]);
  });

  it("still creates exactly one placeholder when no row exists yet (happy path intact)", async () => {
    const { query, rows } = makeTableModel([]);
    const r = await createPlaceholderSummary(query, BASE);
    expect(r.path).toBe("insert");
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(VPATH);
    expect(rows[0].description).toBe("in progress");
  });
});
