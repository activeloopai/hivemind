/**
 * scripts/bm25-vs-semantic.ts
 *
 * Over a fixture query set, counts how many recalls actually ran semantic (`<#>`
 * cosine) vs fell back to BM25/ILIKE. A high lexical share while embeddings are
 * "on" is the signature of a flaking daemon or un-embedded rows.
 *
 * Run:
 *   node scripts/bm25-vs-semantic.ts fixtures/recall-queries.json
 *
 * Fixture file shape: ["query one", "query two", ...]
 *
 * Source of truth: src/shell/grep-core.ts (mode chosen by queryEmbedding null-ness),
 *                  src/hooks/grep-direct.ts (HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS).
 *
 * Exit: 1 if lexical share > 0.2 with embeddings on, else 0.
 */

import { readFileSync } from "node:fs";

// TODO: wire to the real path. recallMode should run the actual recall and report
// which branch fired (semantic when queryEmbedding != null, else lexical) plus the
// daemon round-trip time. Stubbed so the script is structurally complete.
interface ModeResult { mode: "semantic" | "lexical"; daemonMs: number | null; }

async function recallMode(_q: string): Promise<ModeResult> {
  throw new Error("wire recallMode() to searchDeeplakeTables before running");
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("usage: bm25-vs-semantic.ts <queries.json>"); process.exit(2); }
  const queries: string[] = JSON.parse(readFileSync(file, "utf8"));

  let semantic = 0, lexical = 0;
  const slow: string[] = [];
  const rows: string[] = [];

  for (const q of queries) {
    const r = await recallMode(q);
    if (r.mode === "semantic") semantic++; else lexical++;
    if (r.daemonMs != null && r.daemonMs > 400) slow.push(q);
    rows.push(`| ${r.mode} | ${r.daemonMs ?? "-"} | ${q.slice(0, 50)} |`);
  }

  const total = queries.length || 1;
  const lexShare = lexical / total;
  const embeddingsOn = process.env.HIVEMIND_EMBEDDINGS && process.env.HIVEMIND_EMBEDDINGS !== "false";

  console.log(`# BM25 vs Semantic Hit Mix\n`);
  console.log(`| Mode | Daemon ms | Query |`);
  console.log(`|---|---|---|`);
  rows.forEach(r => console.log(r));
  console.log(`\nSemantic: ${semantic}/${total} | Lexical: ${lexical}/${total} (lexical share ${lexShare.toFixed(2)})`);

  if (slow.length) {
    console.log(`\nNear-budget daemon round-trips (> 400ms) - cold model or contention:`);
    slow.forEach(q => console.log(`  - ${q.slice(0, 60)}`));
  }

  const alert = !!embeddingsOn && lexShare > 0.2;
  console.log(`\n${alert
    ? "ALERT - high lexical share with embeddings on. Check daemon health + embedding coverage."
    : "OK."}`);
  process.exit(alert ? 1 : 0);
})();
