/**
 * List goals from the Deeplake `hivemind_goals` table.
 *
 * Self-contained: reads credentials and queries the Deeplake HTTP endpoint
 * directly. Mirrors core src/commands/goal.ts goalList, with latest-version
 * dedup per goal_id (the VFS write path appends a fresh row per overwrite).
 * Prints a GoalsListResult JSON to stdout.
 *
 *   argv[2]: filter — "mine" (default) or "all".
 */
import { loadCreds, query, sqlIdent, sqlStr, tableNames, isMissingTableError } from "./lib/deeplake.mjs";

const filter = process.argv[2] === "all" ? "all" : "mine";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const creds = loadCreds();
if (!creds) {
  emit({ loggedOut: true, goals: [], message: "Log in with `hivemind login` to track team goals." });
  process.exit(0);
}

const table = sqlIdent(tableNames().goals);
const where = filter === "mine" ? `WHERE owner = '${sqlStr(creds.userName)}'` : "";

let rows;
try {
  rows = await query(
    creds,
    `SELECT goal_id, owner, status, content, version, created_at FROM "${table}" ${where} ORDER BY version DESC, created_at DESC LIMIT 200`,
  );
} catch (e) {
  if (isMissingTableError(e?.message)) {
    emit({ loggedOut: false, goals: [] });
    process.exit(0);
  }
  emit({ loggedOut: false, goals: [], message: "Could not load goals." });
  process.exit(0);
}

const latest = new Map();
for (const r of rows) {
  const goalId = String(r.goal_id ?? "");
  if (!goalId || latest.has(goalId)) continue;
  const text = String(r.content ?? "").split(/\r?\n/)[0].trim();
  latest.set(goalId, {
    goalId,
    owner: String(r.owner ?? ""),
    status: String(r.status ?? ""),
    text,
    createdAt: String(r.created_at ?? ""),
  });
}

const goals = [...latest.values()]
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  .slice(0, 50)
  .map(({ goalId, owner, status, text }) => ({ goalId, owner, status, text }));

emit({ loggedOut: false, goals });
