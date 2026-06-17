/**
 * List recent captured sessions from the Deeplake `sessions` table.
 *
 * Self-contained: reads credentials and queries the Deeplake HTTP endpoint
 * directly. Mirrors the grouped listing in core src/commands/session-prune.ts
 * (one row per session path, newest first). Sessions are scoped to the
 * current repo's project when possible, falling back to all of the user's
 * recent sessions. Prints RecentSession[] JSON to stdout.
 */
import { basename } from "node:path";
import { loadCreds, query, sqlIdent, sqlStr, tableNames } from "./lib/deeplake.mjs";

const cwd = process.argv[2] || process.cwd();

function emit(arr) {
  process.stdout.write(JSON.stringify(arr));
}

/** /sessions/<user>/<user>_<org>_<workspace>_<sessionId>.jsonl -> sessionId */
function extractSessionId(path) {
  const m = String(path).match(/\/sessions\/[^/]+\/[^/]+_([^.]+)\.jsonl$/);
  if (m) return m[1];
  return String(path).split("/").pop()?.replace(/\.jsonl$/, "") ?? String(path);
}

const creds = loadCreds();
if (!creds || !creds.userName) {
  emit([]);
  process.exit(0);
}

const table = sqlIdent(tableNames().sessions);

let rows;
try {
  rows = await query(
    creds,
    `SELECT path, COUNT(*) as cnt, MAX(creation_date) as last_event, MAX(project) as project ` +
      `FROM "${table}" WHERE author = '${sqlStr(creds.userName)}' ` +
      `GROUP BY path ORDER BY last_event DESC LIMIT 100`,
  );
} catch {
  emit([]);
  process.exit(0);
}

const all = rows.map((r) => {
  const eventCount = Number(r.cnt) || 0;
  return {
    sessionId: extractSessionId(r.path),
    endedAt: String(r.last_event ?? ""),
    eventCount,
    memorySearchCount: eventCount,
    project: r.project ? String(r.project) : null,
    hadRecall: eventCount > 0,
  };
});

// Prefer sessions from this repo's project; fall back to all when the
// project name does not line up with the captured `project` column.
const repoProject = basename(cwd);
const scoped = all.filter((s) => s.project && s.project === repoProject);
const result = (scoped.length > 0 ? scoped : all).slice(0, 20);

emit(result);
