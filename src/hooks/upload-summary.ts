/**
 * Shared summary-upload logic for claude-code + codex wiki workers.
 *
 * Combines the summary, size_bytes and description column writes into a
 * SINGLE UPDATE (or INSERT) statement — the Deeplake backend silently
 * drops one of two rapid UPDATEs on the same row, so splitting these
 * across two statements ends up losing the summary column while only
 * description lands.
 */

import { randomUUID } from "node:crypto";
import { embeddingSqlLiteral } from "../embeddings/sql.js";
import { redactSecrets } from "./shared/redact.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface UploadParams {
  tableName: string;
  vpath: string;
  fname: string;
  userName: string;
  project: string;
  agent: string;
  sessionId: string;
  text: string;
  ts?: string;
  /**
   * Pre-computed nomic embedding of `text` to store alongside the summary.
   * Passing `null` or `undefined` writes SQL NULL — the column stays
   * schema-compatible and the row is still reachable via the lexical
   * retrieval branch, it just won't show up in the semantic branch.
   */
  embedding?: number[] | null;
  /**
   * Hivemind plugin version that produced this summary.
   * - INSERT: omitted lands the column default (''), schema-compatible.
   * - UPDATE: omitted means "don't touch the column" — a refresh from a
   *   legacy spawner that doesn't pass pluginVersion must NOT overwrite
   *   a previously-stored real version with ''. Pass an explicit empty
   *   string when you genuinely want to clear it.
   */
  pluginVersion?: string;
}

export interface UploadResult {
  /**
   * Which write path ran. `"skip"` means the finalize-wins guard refused to
   * overwrite an already-finalized row with a placeholder/stub — no SQL was
   * sent.
   */
  path: "update" | "insert" | "skip";
  sql: string;
  descLength: number;
  summaryLength: number;
}

/** PostgreSQL E-string escaper: doubles backslashes and single quotes, strips control chars. */
export function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

const WHAT_HAPPENED_RE = /## What Happened\n([\s\S]*?)(?=\n##|$)/;

/** Derive the short description from the "## What Happened" section of a wiki summary. */
export function extractDescription(text: string): string {
  const match = text.match(WHAT_HAPPENED_RE);
  return match ? match[1].trim().slice(0, 300) : "completed";
}

/**
 * The SessionStart placeholder sentinel. A row with this description (and no
 * real summary/embedding) is an unfinalized stub created at SessionStart that
 * the wiki worker is expected to replace with a real summary.
 */
export const PLACEHOLDER_DESCRIPTION = "in progress";

/**
 * Is `desc` a finalized (real) description? A finalized row has a description
 * that is non-empty and is NOT the SessionStart placeholder sentinel.
 *
 * Proactive recall only surfaces rows where `description <> 'in progress'`
 * AND `summary <> ''`, so "finalized" here matches exactly what recall needs.
 */
export function isFinalizedDescription(desc: unknown): boolean {
  if (typeof desc !== "string") return false;
  const d = desc.trim();
  return d !== "" && d !== PLACEHOLDER_DESCRIPTION;
}

/**
 * Is the EXISTING row (`summary`, `description`) a FINALIZED summary — i.e.
 * one that proactive recall can surface? Requires a non-empty summary body AND
 * a real (non-placeholder) description. Used as the finalize-wins guard: a
 * finalized row must never be clobbered back to a placeholder/stub.
 */
export function isFinalizedRow(summary: unknown, description: unknown): boolean {
  const hasSummary = typeof summary === "string" && summary.trim() !== "";
  return hasSummary && isFinalizedDescription(description);
}

/**
 * Does `text` look like a REAL (finalized) wiki summary, as opposed to the
 * SessionStart placeholder or an empty/content-free stub?
 *
 * The wiki worker's prompt always emits a populated "## What Happened" section;
 * the SessionStart placeholder never does. So the presence of a non-empty
 * "## What Happened" body is the reliable signal that this write carries a real
 * summary. `extractDescription`'s "completed" fallback alone is NOT a reliable
 * signal, because a content-free stub also lands "completed" and would
 * otherwise masquerade as finalized and clobber a real row.
 */
export function isFinalizedSummaryText(text: unknown): boolean {
  if (typeof text !== "string" || text.trim() === "") return false;
  const match = text.match(WHAT_HAPPENED_RE);
  return match ? match[1].trim() !== "" : false;
}

/**
 * Upload or refresh a wiki summary row.
 *
 * IMPORTANT: summary and description must stay in the SAME SQL statement.
 * See module docstring for the rationale.
 */
export async function uploadSummary(query: QueryFn, params: UploadParams): Promise<UploadResult> {
  const { tableName, vpath, fname, userName, project, agent } = params;
  // Mask any secret a summary may have quoted before it's stored/indexed.
  const text = redactSecrets(params.text);
  const ts = params.ts ?? new Date().toISOString();
  const desc = extractDescription(text);
  const sizeBytes = Buffer.byteLength(text);
  const embSql = embeddingSqlLiteral(params.embedding ?? null);
  // Keep undefined sentinel for UPDATE conditional. INSERT still defaults to ''.
  const pluginVersion = params.pluginVersion;

  const existing = await query(
    `SELECT path, summary, description FROM "${tableName}" WHERE path = '${esc(vpath)}' LIMIT 1`
  );

  if (existing.length > 0) {
    // FINALIZE-WINS: a finalized row (real summary + non-placeholder
    // description) must never be clobbered back to a placeholder/stub.
    //
    // Production failure mode this prevents (org activeloop, ~56% of summaries
    // stuck at 'in progress'): a stale/duplicate writer — a resumed session,
    // or a late wiki worker that produced empty / content-free text —
    // overwrites a real summary with a stub, making the row invisible to
    // proactive recall again. The incoming write is "finalized" iff it carries
    // a real summary body (a populated "## What Happened"); a non-finalized
    // (stub) write is rejected when the existing row is already finalized.
    const incomingFinalized = isFinalizedSummaryText(text);
    const existingFinalized = isFinalizedRow(existing[0]["summary"], existing[0]["description"]);
    if (!incomingFinalized && existingFinalized) {
      return { path: "skip", sql: "", descLength: desc.length, summaryLength: text.length };
    }

    // Only include plugin_version in the SET clause when the caller
    // explicitly provided a value (including ''). A legacy spawner that
    // omits pluginVersion would otherwise erase a previously-stored
    // real version on every refresh. Keeping the column out of SET
    // leaves the existing row value untouched.
    const pluginVersionSet = pluginVersion === undefined
      ? ""
      : `plugin_version = '${esc(pluginVersion)}', `;
    const sql =
      `UPDATE "${tableName}" SET ` +
      `summary = E'${esc(text)}', ` +
      `summary_embedding = ${embSql}, ` +
      `size_bytes = ${sizeBytes}, ` +
      `description = E'${esc(desc)}', ` +
      pluginVersionSet +
      `last_update_date = '${ts}' ` +
      `WHERE path = '${esc(vpath)}'`;
    await query(sql);
    return { path: "update", sql, descLength: desc.length, summaryLength: text.length };
  }

  // INSERT path: new row, no previous value to preserve — default to ''.
  const pluginVersionForInsert = pluginVersion ?? "";
  const sql =
    `INSERT INTO "${tableName}" (id, path, filename, summary, summary_embedding, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `VALUES ('${randomUUID()}', '${esc(vpath)}', '${esc(fname)}', E'${esc(text)}', ${embSql}, '${esc(userName)}', 'text/markdown', ` +
    `${sizeBytes}, '${esc(project)}', E'${esc(desc)}', '${esc(agent)}', '${esc(pluginVersionForInsert)}', '${ts}', '${ts}')`;
  await query(sql);
  return { path: "insert", sql, descLength: desc.length, summaryLength: text.length };
}
