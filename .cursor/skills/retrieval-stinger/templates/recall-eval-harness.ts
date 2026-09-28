/**
 * Template: Recall Eval Harness (Vitest stub)
 *
 * Drives a fixture set through the Hivemind recall path and asserts that the
 * expected path(s) appear in the top-K results. Use this to lock in recall
 * precision before/after a pipeline change (model swap, weight retune, schema edit).
 *
 * Source of truth: src/shell/grep-core.ts (searchDeeplakeTables),
 *                  src/embeddings/columns.ts (EMBEDDING_DIMS = 768).
 *
 * Run: npx vitest .cursor/skills/retrieval-stinger/templates/recall-eval-harness.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

// ── Fixture shape ────────────────────────────────────────────────────────────
interface RecallFixture {
  query: string;
  /** Path substrings that SHOULD appear in the top-K results. */
  expectPaths: string[];
  /** Optional: force a hybrid weighting for keyword-shaped queries. */
  weights?: { semantic: number; lexical: number };
}

// Replace with a load from fixtures/recall-fixtures.json
const FIXTURES: RecallFixture[] = [
  {
    query: "where do we run the union across memory and sessions",
    expectPaths: ["grep-core", "searchDeeplakeTables"],
  },
  {
    query: "HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS default",
    expectPaths: ["grep-direct"],
    weights: { semantic: 0.3, lexical: 0.7 }, // keyword-precise
  },
  {
    query: "how do we keep embedding vectors reachable when the daemon is down",
    expectPaths: ["grep-core", "fallback"],
  },
];

const TOP_K = 5;

// ── Recall driver (wire to the real path) ────────────────────────────────────
// Replace this stub with a call into searchDeeplakeTables via the DeeplakeApi,
// or shell out to scripts/recall-trace.ts and parse its output.
interface RecallHit { path: string; content: string; dist?: number; }

async function recall(_query: string, _w?: { semantic: number; lexical: number }): Promise<RecallHit[]> {
  // TODO: import { searchDeeplakeTables } from "../../../../src/shell/grep-core.js"
  //       embed the query via the EmbedClient, run the UNION ALL, return rows.
  throw new Error("wire recall() to searchDeeplakeTables before running");
}

function topKHitsPath(hits: RecallHit[], needle: string, k: number): boolean {
  return hits.slice(0, k).some(h => h.path.includes(needle) || h.content.includes(needle));
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("recall precision over fixtures", () => {
  beforeAll(() => {
    // Guard: semantic search must be on for this harness to mean anything.
    if (process.env.HIVEMIND_SEMANTIC_SEARCH === "false") {
      throw new Error("HIVEMIND_SEMANTIC_SEARCH=false -> harness would only test BM25");
    }
  });

  for (const fx of FIXTURES) {
    it(`top-${TOP_K} recall: "${fx.query}"`, async () => {
      const hits = await recall(fx.query, fx.weights);
      for (const expected of fx.expectPaths) {
        expect(topKHitsPath(hits, expected, TOP_K), `expected "${expected}" in top-${TOP_K}`).toBe(true);
      }
    });
  }

  it("aggregate precision >= 0.7", async () => {
    let hitCount = 0;
    for (const fx of FIXTURES) {
      const hits = await recall(fx.query, fx.weights);
      if (fx.expectPaths.every(e => topKHitsPath(hits, e, TOP_K))) hitCount++;
    }
    const precision = hitCount / FIXTURES.length;
    expect(precision).toBeGreaterThanOrEqual(0.7);
  });
});
