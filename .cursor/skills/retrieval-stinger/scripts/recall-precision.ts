/**
 * scripts/recall-precision.ts
 *
 * Measures recall precision over a fixture set against the Hivemind recall path
 * (memory + sessions UNION ALL, `<#>` cosine when embeddings are on). Each fixture
 * is a query plus the path substring(s) that SHOULD appear in the top-K.
 *
 * Run:
 *   node scripts/recall-precision.ts fixtures/recall-fixtures.json [--k=5]
 *
 * Fixture file shape:
 *   [{ "query": "...", "expectPaths": ["grep-core"], "weights": {"semantic":0.7,"lexical":0.3} }]
 *
 * Source of truth: src/shell/grep-core.ts (searchDeeplakeTables),
 *                  src/embeddings/columns.ts (EMBEDDING_DIMS = 768).
 *
 * Targets: top-K precision > 0.7 healthy | 0.4-0.7 watch | < 0.4 sustained -> alert.
 * Exit: 1 if precision < 0.4, else 0.
 */

import { readFileSync } from "node:fs";

interface Fixture {
  query: string;
  expectPaths: string[];
  weights?: { semantic: number; lexical: number };
}

interface RecallHit { path: string; content: string; }

// TODO: wire to the real path - import searchDeeplakeTables from src/shell/grep-core.js,
// embed the query via the EmbedClient, run the UNION ALL. Stubbed so the harness is runnable.
async function recall(_q: string, _w?: { semantic: number; lexical: number }): Promise<RecallHit[]> {
  throw new Error("wire recall() to searchDeeplakeTables before running");
}

function topKHit(hits: RecallHit[], needle: string, k: number): boolean {
  return hits.slice(0, k).some(h => h.path.includes(needle) || h.content.includes(needle));
}

(async () => {
  if (process.env.HIVEMIND_SEMANTIC_SEARCH === "false") {
    console.error("HIVEMIND_SEMANTIC_SEARCH=false - this would only measure BM25");
    process.exit(2);
  }
  const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, "").split("=")));
  const k = Number(args.k ?? "5");
  const file = process.argv[2];
  if (!file) { console.error("usage: recall-precision.ts <fixtures.json> [--k=5]"); process.exit(2); }

  const fixtures: Fixture[] = JSON.parse(readFileSync(file, "utf8"));
  let hits = 0;
  const rows: string[] = [];

  for (const fx of fixtures) {
    const results = await recall(fx.query, fx.weights);
    const pass = fx.expectPaths.every(e => topKHit(results, e, k));
    if (pass) hits++;
    rows.push(`| ${pass ? "ok " : "MISS"} | ${fx.query.slice(0, 50)} | ${fx.expectPaths.join(", ")} |`);
  }

  const precision = fixtures.length ? hits / fixtures.length : 0;
  console.log(`# Recall Precision (top-${k})\n`);
  console.log(`| Result | Query | Expected paths |`);
  console.log(`|---|---|---|`);
  rows.forEach(r => console.log(r));
  console.log(`\nPrecision: ${precision.toFixed(3)} (${hits}/${fixtures.length})`);
  console.log(
    precision >= 0.7 ? "Healthy." :
    precision >= 0.4 ? "Watch list - below 0.7 target." :
    "ALERT - below 0.4. Check embeddings coverage + daemon health.",
  );

  process.exit(precision < 0.4 ? 1 : 0);
})();
