/**
 * scripts/embedding-coverage.ts
 *
 * Reports embedding coverage across the three recall tables: how many rows are
 * actually embedded vs sitting NULL (invisible to the `<#>` semantic branch).
 * A coverage gap is an indexing fix (backfill), not a tuning problem.
 *
 * Run:
 *   node scripts/embedding-coverage.ts
 *
 * Source of truth: src/embeddings/columns.ts (summary_embedding, message_embedding,
 *                  chunk_embedding; EMBEDDING_DIMS = 768), src/shell/grep-core.ts.
 *
 * Targets: embedded/total > 0.95 per table.
 * Exit: 1 if any table below 0.95, else 0.
 */

interface TableCoverage { table: string; total: number; embedded: number; }

// Each query is the count of total rows and non-null embeddings for that table.
const COVERAGE_SQL: Record<string, string> = {
  memory:   `SELECT count(*) total, count(summary_embedding) embedded FROM memory`,
  sessions: `SELECT count(*) total, count(message_embedding) embedded FROM sessions`,
  codebase: `SELECT count(*) total, count(chunk_embedding)   embedded FROM codebase`,
};

// TODO: wire to DeeplakeApi - run each SQL and return {total, embedded}. Stubbed.
async function runCount(_sql: string): Promise<{ total: number; embedded: number }> {
  throw new Error("wire runCount() to the DeeplakeApi before running");
}

(async () => {
  const rows: TableCoverage[] = [];
  for (const [table, sql] of Object.entries(COVERAGE_SQL)) {
    const { total, embedded } = await runCount(sql);
    rows.push({ table, total, embedded });
  }

  console.log(`# Embedding Coverage\n`);
  console.log(`| Table | Total | Embedded | Coverage | |`);
  console.log(`|---|---|---|---|---|`);
  let worst = 1;
  for (const r of rows) {
    const cov = r.total ? r.embedded / r.total : 1;
    worst = Math.min(worst, cov);
    const flag = cov < 0.95 ? "backfill" : "ok";
    console.log(`| ${r.table} | ${r.total} | ${r.embedded} | ${(cov * 100).toFixed(1)}% | ${flag} |`);
  }

  console.log(`\n${worst >= 0.95
    ? "All tables above 0.95 - semantic recall has full reach."
    : "ALERT - a table is below 0.95. Un-embedded rows are invisible to `<#>`. Backfill."}`);
  process.exit(worst < 0.95 ? 1 : 0);
})();
