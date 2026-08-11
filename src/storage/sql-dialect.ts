import type { StorageDialect } from "../deeplake-schema.js";

/** Render an expression as text without relying on backend-side SQL rewriting. */
export function textExpression(expression: string, dialect: StorageDialect): string {
  return dialect === "sqlite" ? expression : `${expression}::text`;
}

/** Render a typed NULL where PostgreSQL-style UNION inference needs one. */
export function nullExpression(type: "text" | "bigint", dialect: StorageDialect): string {
  return dialect === "sqlite" ? "NULL" : `NULL::${type}`;
}

/** SQLite LIKE is case-insensitive for ASCII unless case_sensitive_like is enabled. */
export function likeOperator(
  requested: "LIKE" | "ILIKE",
  dialect: StorageDialect,
): "LIKE" | "ILIKE" {
  return dialect === "sqlite" && requested === "ILIKE" ? "LIKE" : requested;
}

/** Prefix a string literal with E only on providers that support it. */
export function escapedStringPrefix(dialect: StorageDialect): "" | "E" {
  return dialect === "sqlite" ? "" : "E";
}

/** Render a pre-escaped JSON literal for the provider's logical JSON type. */
export function jsonLiteral(escapedJson: string, dialect: StorageDialect): string {
  const literal = `'${escapedJson}'`;
  return dialect === "sqlite" ? literal : `${literal}::jsonb`;
}
