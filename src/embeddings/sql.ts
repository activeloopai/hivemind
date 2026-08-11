import type { StorageDialect } from "../deeplake-schema.js";

// Helpers for embedding values in SQL. Deeplake stores vectors as `FLOAT4[]`,
// PostgreSQL as DOUBLE PRECISION[], and SQLite as JSON text.

export function embeddingSqlLiteral(
  vec: number[] | null | undefined,
  dialect: StorageDialect = "deeplake",
): string {
  if (!vec || vec.length === 0) return "NULL";
  // FLOAT4 is IEEE-754 single-precision. `toFixed` would lose precision; use
  // the raw JS Number → string conversion which yields the shortest round-trip.
  // Safety: only allow finite numbers; otherwise NULL.
  const parts: string[] = [];
  for (const v of vec) {
    if (!Number.isFinite(v)) return "NULL";
    parts.push(String(v));
  }
  if (dialect === "sqlite") return `'[${parts.join(",")}]'`;
  if (dialect === "postgres") return `ARRAY[${parts.join(",")}]::double precision[]`;
  return `ARRAY[${parts.join(",")}]::float4[]`;
}
