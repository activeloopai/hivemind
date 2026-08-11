export interface ScoredVectorRow {
  row: Record<string, unknown>;
  score: number;
}

export function parseStoredVector(value: unknown): number[] | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  const vector = candidate.map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function scoreVectorRows(
  rows: Record<string, unknown>[],
  embeddingColumn: string,
  queryEmbedding: readonly number[],
): ScoredVectorRow[] {
  const scored: ScoredVectorRow[] = [];
  for (const row of rows) {
    const vector = parseStoredVector(row[embeddingColumn]);
    if (!vector) continue;
    const score = cosineSimilarity(vector, queryEmbedding);
    if (score === null) continue;
    scored.push({ row, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

export function vectorScanLimit(): number {
  const raw = Number.parseInt(process.env.HIVEMIND_VECTOR_SCAN_LIMIT ?? "2000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 2000;
}
