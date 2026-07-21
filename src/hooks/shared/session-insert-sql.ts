import { sqlIdent, sqlStr } from "../../utils/sql.js";

/**
 * Fields for one session-event row written by the capture hooks. All string
 * values are escaped by the builder EXCEPT `jsonForSql` and `embeddingSql`,
 * which are pre-formatted SQL fragments (see notes on each field).
 */
export interface DirectSessionInsertParams {
  /** Stable per-event row id. MUST be constant across retries of the same
   *  event so the idempotency guard below can recognise a re-send. */
  id: string;
  sessionPath: string;
  filename: string;
  /** JSON payload with single quotes already doubled (`'' `). Embedded raw and
   *  cast to jsonb — do NOT pass through sqlStr(), which would corrupt the JSON. */
  jsonForSql: string;
  /** SQL literal for message_embedding: either `NULL` or `ARRAY[...]::float4[]`.
   *  Produced by embeddingSqlLiteral(); embedded raw. */
  embeddingSql: string;
  userName: string;
  sizeBytes: number;
  projectName: string;
  description: string;
  agent: string;
  pluginVersion: string;
  /** ISO timestamp used for both creation_date and last_update_date. */
  timestamp: string;
}

/**
 * Build the single-row session INSERT used by every capture hook.
 *
 * Idempotent by construction: the row is inserted via `INSERT ... SELECT ...
 * WHERE NOT EXISTS (SELECT 1 FROM <table> WHERE id = <id>)` rather than a plain
 * `VALUES` insert. The Deeplake sessions table has no UNIQUE constraint on `id`,
 * so a plain INSERT that the API layer retries after a transient 5xx (the
 * request committed but the gateway returned 502/503) creates a duplicate row.
 * The `WHERE NOT EXISTS` guard makes the re-send a no-op instead — verified
 * lag-safe against the real backend even when the retry fires inside the
 * documented ~5s read-your-writes window (see probe results / PR notes).
 *
 * The column list starts with `id, path, filename, message,` so the query is
 * still recognised by isSessionInsertQuery() in deeplake-api.ts (which enables
 * the transient-403 retry path for session writes).
 */
export function buildDirectSessionInsertSql(sessionsTable: string, p: DirectSessionInsertParams): string {
  const table = sqlIdent(sessionsTable);
  const id = sqlStr(p.id);
  return (
    `INSERT INTO "${table}" (id, path, filename, message, message_embedding, author, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `SELECT '${id}', '${sqlStr(p.sessionPath)}', '${sqlStr(p.filename)}', '${p.jsonForSql}'::jsonb, ${p.embeddingSql}, '${sqlStr(p.userName)}', ` +
    `${p.sizeBytes}, '${sqlStr(p.projectName)}', '${sqlStr(p.description)}', '${sqlStr(p.agent)}', '${sqlStr(p.pluginVersion)}', '${sqlStr(p.timestamp)}', '${sqlStr(p.timestamp)}' ` +
    `WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE id = '${id}')`
  );
}
