/**
 * List team rules from the Deeplake `hivemind_rules` table.
 *
 * Self-contained: reads credentials and queries the Deeplake HTTP endpoint
 * directly (see lib/deeplake.mjs). Mirrors the latest-version-per-rule dedup
 * in core src/rules/read.ts. Prints a RulesListResult JSON to stdout.
 */
import { loadCreds, query, sqlIdent, tableNames, isMissingTableError } from "./lib/deeplake.mjs";

const status = process.argv[2] || "active";
const parsedLimit = Number.parseInt(process.argv[3] ?? "10", 10);
const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 10;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const creds = loadCreds();
if (!creds) {
  emit({ loggedOut: true, rules: [], message: "Log in with `hivemind login` to manage team rules." });
  process.exit(0);
}

const table = sqlIdent(tableNames().rules);

let rows;
try {
  rows = await query(creds, `SELECT id, rule_id, text, scope, status, assigned_by, version, created_at FROM "${table}" ORDER BY version DESC, created_at DESC, id DESC`);
} catch (e) {
  // The rules table is created lazily by the CLI on first write. Until then
  // a read 400s with "does not exist" — that just means no rules yet.
  if (isMissingTableError(e?.message)) {
    emit({ loggedOut: false, rules: [] });
    process.exit(0);
  }
  emit({ loggedOut: false, rules: [], message: "Could not load rules." });
  process.exit(0);
}

const latest = new Map();
for (const r of rows) {
  const versionRaw = r.version;
  const version = typeof versionRaw === "number" ? versionRaw : Number(versionRaw);
  if (!Number.isFinite(version)) continue;
  const ruleId = String(r.rule_id ?? "");
  if (!ruleId || latest.has(ruleId)) continue;
  latest.set(ruleId, {
    id: String(r.id ?? ""),
    rule_id: ruleId,
    text: String(r.text ?? ""),
    status: String(r.status ?? ""),
    assigned_by: String(r.assigned_by ?? ""),
    version,
    created_at: String(r.created_at ?? ""),
  });
}

const filtered = [...latest.values()].filter((r) => (status === "all" ? true : r.status === status));
filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

emit({
  loggedOut: false,
  rules: filtered.slice(0, limit).map((r) => ({
    id: r.rule_id,
    status: r.status,
    version: r.version,
    author: r.assigned_by,
    text: r.text,
  })),
});
