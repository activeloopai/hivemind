/**
 * scripts/daemon-health.ts
 *
 * Checks the embeddings daemon - the process whose absence silently degrades
 * recall to BM25. Confirms the unix socket is connectable, a round-trip embed
 * returns a 768-dim FLOAT4[] within the timeout, and the toggles are on.
 *
 * Run:
 *   node scripts/daemon-health.ts
 *
 * Source of truth: src/embeddings/daemon.ts, nomic.ts, columns.ts (EMBEDDING_DIMS = 768),
 *                  src/user-config.ts (HIVEMIND_EMBEDDINGS read once).
 *
 * Exit: 0 healthy | 1 degraded (recall will fall back to BM25).
 */

const EMBEDDING_DIMS = 768;
const TIMEOUT_MS = Number(process.env.HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS ?? "500");

interface Check { name: string; ok: boolean; detail: string; }

// TODO: wire to the real EmbedClient - import from src/embeddings/*.
// embedProbe should connect to the unix socket, send one NDJSON line, and
// return the vector (or throw on connect/timeout). Stubbed here.
async function embedProbe(_text: string): Promise<number[]> {
  throw new Error("wire embedProbe() to the EmbedClient before running");
}

(async () => {
  const checks: Check[] = [];

  const embeddingsOn = process.env.HIVEMIND_EMBEDDINGS && process.env.HIVEMIND_EMBEDDINGS !== "false";
  checks.push({
    name: "HIVEMIND_EMBEDDINGS",
    ok: !!embeddingsOn,
    detail: embeddingsOn ? "on" : "off/unset -> recall is BM25",
  });

  const semanticOn = process.env.HIVEMIND_SEMANTIC_SEARCH !== "false";
  checks.push({
    name: "HIVEMIND_SEMANTIC_SEARCH",
    ok: semanticOn,
    detail: semanticOn ? "on" : "false -> recall stays lexical",
  });

  const t0 = Date.now();
  try {
    const vec = await Promise.race([
      embedProbe("daemon health probe"),
      new Promise<number[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const ms = Date.now() - t0;
    const dimsOk = vec.length === EMBEDDING_DIMS;
    checks.push({ name: "socket round-trip", ok: true, detail: `${ms}ms (budget ${TIMEOUT_MS}ms)` });
    checks.push({
      name: "vector dims",
      ok: dimsOk,
      detail: dimsOk ? `${EMBEDDING_DIMS} ok` : `expected ${EMBEDDING_DIMS}, got ${vec.length}`,
    });
  } catch (e) {
    checks.push({ name: "socket round-trip", ok: false, detail: (e as Error).message });
  }

  console.log(`# Embeddings Daemon Health\n`);
  console.log(`| Check | Status | Detail |`);
  console.log(`|---|---|---|`);
  for (const c of checks) console.log(`| ${c.name} | ${c.ok ? "ok" : "FAIL"} | ${c.detail} |`);

  const healthy = checks.every(c => c.ok);
  console.log(`\n${healthy ? "Healthy - semantic recall live." : "Degraded - recall will fall back to BM25."}`);
  process.exit(healthy ? 0 : 1);
})();
