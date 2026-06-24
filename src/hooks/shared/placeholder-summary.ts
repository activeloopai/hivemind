/**
 * Shared SessionStart placeholder-summary writer for all agent variants
 * (claude-code, codex, cursor, hermes).
 *
 * THE BUG THIS FIXES (production: ~56% of summaries stuck at 'in progress',
 * ~75% with NULL embeddings):
 *
 * The memory table has NO unique constraint on `path` (see deeplake-schema.ts
 * MEMORY_COLUMNS — `path` is just `TEXT NOT NULL DEFAULT ''`). The original
 * createPlaceholder did:
 *
 *     SELECT path ... WHERE path = $p LIMIT 1   -- guard
 *     if (rows.length === 0) INSERT placeholder  -- create
 *
 * That SELECT-then-INSERT is a TOCTOU race. Deeplake reads are
 * eventually-consistent, so a *second* SessionStart for the SAME session id
 * (a `--resume`, a `source: resume|clear` re-fire, or two near-simultaneous
 * SessionStart invocations) can read ZERO rows even though the wiki worker
 * already finalized + embedded the row seconds earlier. The guard passes and a
 * SECOND, stub placeholder row is INSERTed at the same path. Now two rows share
 * `/summaries/<user>/<sid>.md`: one finalized, one `description='in progress',
 * summary=<stub>, summary_embedding=NULL`. Downstream reads (`uploadSummary`'s
 * SELECT, recall, polls) use `... WHERE path=$p LIMIT 1` with NO `ORDER BY`, so
 * the stub can shadow the finalized row — the row *looks* reverted to a
 * placeholder, and recall silently drops it.
 *
 * This path bypasses uploadSummary's FINALIZE-WINS guard entirely, which is why
 * that guard never caught it.
 *
 * THE FIX — make the placeholder write a SINGLE atomic, finalize-aware
 * statement:
 *
 *     INSERT INTO t (...) SELECT <values> WHERE NOT EXISTS (
 *         SELECT 1 FROM t WHERE path = $p)
 *
 * The existence check and the insert happen in one server-side statement, so no
 * stale client-side read can wedge a duplicate in between. If ANY row already
 * exists at the path — placeholder OR finalized — the INSERT writes nothing.
 * A finalized row therefore can NEVER be reverted to a placeholder/stub or have
 * its embedding nulled by a placeholder write, across every agent variant.
 */

import { sqlStr } from "../../utils/sql.js";
import { projectNameFromCwd } from "../../utils/project-name.js";

/** Minimal query surface — matches DeeplakeApi.query / the worker `query` fn. */
export type PlaceholderQueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface PlaceholderParams {
  table: string;
  sessionId: string;
  cwd: string;
  userName: string;
  orgName: string;
  workspaceId: string;
  /** Agent literal stored in the `agent` column: claude_code | codex | cursor | hermes. */
  agent: string;
  pluginVersion: string;
  /** Override for the timestamp (testing). Defaults to now. */
  ts?: string;
  /** Override for randomUUID (testing). */
  uuid?: () => string;
}

export interface PlaceholderResult {
  /**
   * `"insert"` — the atomic INSERT statement was sent (it self-skips
   * server-side if a row already exists). `"skip"` — the fast-path SELECT
   * already saw a row, so no statement was sent.
   */
  path: "insert" | "skip";
  sql: string;
  summaryPath: string;
}

/** The placeholder sentinel description — kept in sync with upload-summary.ts. */
const PLACEHOLDER_DESCRIPTION = "in progress";

/**
 * Build the atomic, finalize-safe placeholder INSERT. Exported for unit tests
 * so the exact SQL the hooks send is asserted without a network round-trip.
 *
 * The INSERT only materializes a row when NONE exists at `path` — guaranteeing
 * a single row per session summary even under concurrent SessionStart fires and
 * eventually-consistent reads.
 */
export function buildPlaceholderInsertSql(params: PlaceholderParams): { sql: string; summaryPath: string } {
  const { table, sessionId, cwd, userName, orgName, workspaceId, agent, pluginVersion } = params;
  const now = params.ts ?? new Date().toISOString();
  // NB: call `crypto.randomUUID()` bound to `crypto` — detaching it via
  // `(params.uuid ?? crypto.randomUUID)()` loses the receiver and throws.
  const uuid = params.uuid ? params.uuid() : crypto.randomUUID();
  const summaryPath = `/summaries/${userName}/${sessionId}.md`;
  const projectName = projectNameFromCwd(cwd);
  const sessionSource = `/sessions/${userName}/${userName}_${orgName}_${workspaceId}_${sessionId}.jsonl`;
  const content = [
    `# Session ${sessionId}`,
    `- **Source**: ${sessionSource}`,
    `- **Started**: ${now}`,
    `- **Project**: ${projectName}`,
    `- **Status**: in-progress`,
    "",
  ].join("\n");
  const filename = `${sessionId}.md`;
  const sizeBytes = Buffer.byteLength(content, "utf-8");

  // Single atomic statement: the row is created only when no row exists at this
  // path. Closes the SELECT-then-INSERT race that produced duplicate stubs
  // shadowing finalized summaries. `WHERE NOT EXISTS` keys on `path` only — any
  // existing row (placeholder or finalized) suppresses the write.
  const sql =
    `INSERT INTO "${table}" (id, path, filename, summary, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `SELECT '${uuid}', '${sqlStr(summaryPath)}', '${sqlStr(filename)}', E'${sqlStr(content)}', '${sqlStr(userName)}', 'text/markdown', ` +
    `${sizeBytes}, '${sqlStr(projectName)}', '${PLACEHOLDER_DESCRIPTION}', '${sqlStr(agent)}', '${sqlStr(pluginVersion)}', '${now}', '${now}' ` +
    `WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE path = '${sqlStr(summaryPath)}')`;

  return { sql, summaryPath };
}

/**
 * Create the SessionStart placeholder summary row idempotently and race-safely.
 *
 * A fast-path SELECT short-circuits the common resumed-session case (so the log
 * stays informative and we skip a write when we already know a row exists), but
 * the SELECT is NOT the safety boundary — the atomic `INSERT ... WHERE NOT
 * EXISTS` is. Even if the SELECT reads stale-empty, the INSERT writes nothing
 * when a row (finalized or placeholder) already exists at the path.
 */
export async function createPlaceholderSummary(
  query: PlaceholderQueryFn,
  params: PlaceholderParams,
  onLog?: (msg: string) => void,
): Promise<PlaceholderResult> {
  const { sql, summaryPath } = buildPlaceholderInsertSql(params);

  // Fast-path: skip the write entirely when a row is already visible. This is
  // an optimization + clearer logging, NOT the race guard.
  try {
    const existing = await query(
      `SELECT path FROM "${params.table}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`,
    );
    if (existing.length > 0) {
      onLog?.(`SessionStart: summary exists for ${params.sessionId} (resumed)`);
      return { path: "skip", sql, summaryPath };
    }
  } catch {
    // A failed/stale read must NOT block the write — the INSERT is itself
    // race-safe, so fall through and let it self-guard server-side.
  }

  await query(sql);
  onLog?.(`SessionStart: created placeholder for ${params.sessionId} (${params.cwd})`);
  return { path: "insert", sql, summaryPath };
}
