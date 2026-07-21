/**
 * CLI surface for `hivemind goal` / `hivemind kpi`.
 *
 * Why this exists: cursor and hermes intercept ONLY Shell-style
 * tool invocations in their pre-tool-use hook (see
 * src/hooks/cursor/pre-tool-use.ts:53 and
 * src/hooks/hermes/pre-tool-use.ts:43). The Write / Edit / Read
 * tools in those agents go straight to the host filesystem without
 * passing through deeplake-fs.ts, so the goal-path classifier
 * never fires. The VFS-routing approach works for claude-code and
 * codex but is structurally unavailable on cursor/hermes.
 *
 * This CLI is the fallback channel: any agent can invoke
 * `hivemind goal add "<text>"` via its Shell tool, the bash
 * command runs as a normal subprocess (cursor's hook lets
 * non-memory-touching commands pass through), and this code talks
 * directly to the Deeplake API. End result: a row in
 * hivemind_goals (or hivemind_kpis) regardless of which agent
 * called it.
 *
 * Subcommands:
 *
 *   hivemind goal add "<text>"            create a new goal (status=opened)
 *   hivemind goal list [--all|--mine]     list goal_id + text + status
 *   hivemind goal done <goal_id>          flip status -> closed
 *   hivemind goal progress <goal_id> <status>  flip status to any value
 *   hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]
 *                                          create a KPI on an existing goal
 *   hivemind kpi list <goal_id>            list KPIs for a goal
 *   hivemind kpi bump <goal_id> <kpi_id> <delta>
 *                                          add <delta> (int, +/-) to current
 *
 * Output is intentionally compact and machine-parsable on the
 * happy path so the agent can pipe it into follow-up commands.
 */

import { randomUUID } from "node:crypto";
import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlIdent, sqlStr } from "../utils/sql.js";

type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

const VALID_STATUS = new Set(["opened", "in_progress", "closed"]);

// Provenance values allowed in the `agent` column when adding a goal.
// `capture` marks a task the user parked mid-session ("save this for
// later") so it can be told apart from hand-created goals. Allowlisted
// because the value is interpolated into the INSERT literal.
const VALID_AGENT = new Set(["manual", "capture"]);

/**
 * Pull an optional `--agent <name>` out of the `goal add` args, leaving
 * the rest as the goal text. The flag may appear anywhere; the value is
 * validated against VALID_AGENT. Defaults to "manual".
 */
function parseAgentFlag(args: string[]): { agent: string; rest: string[] } {
  const rest: string[] = [];
  let agent = "manual";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent") {
      const val = args[i + 1];
      if (!val) {
        process.stderr.write("usage: --agent requires a value (manual|capture)\n");
        process.exit(1);
      }
      agent = val;
      i++; // consume the value
      continue;
    }
    rest.push(args[i]);
  }
  if (!VALID_AGENT.has(agent)) {
    process.stderr.write(`invalid --agent: ${agent} (expected manual|capture)\n`);
    process.exit(1);
  }
  return { agent, rest };
}

function loadApiOrDie(table: string): { api: DeeplakeApi; query: QueryFn; userName: string } {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in. Run `hivemind login` first.\n");
    process.exit(1);
  }
  const api = new DeeplakeApi(
    cfg.token,
    cfg.apiUrl,
    cfg.orgId,
    cfg.workspaceId,
    table,
  );
  const query: QueryFn = (sql) => api.query(sql) as Promise<Array<Record<string, unknown>>>;
  return { api, query, userName: cfg.userName };
}

// ── goal subcommands ────────────────────────────────────────────────────────

async function goalAdd(text: string, agent: string = "manual"): Promise<void> {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    process.stderr.write("hivemind: not logged in.\n");
    process.exit(1);
  }
  const table = cfg.goalsTableName;
  const { api, query } = loadApiOrDie(table);
  await api.ensureGoalsTable(table);
  const safe = sqlIdent(table);
  const goalId = randomUUID();
  const ts = new Date().toISOString();
  await query(
    `INSERT INTO "${safe}" (id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version) VALUES (` +
    `'${randomUUID()}', ` +
    `'${sqlStr(goalId)}', ` +
    `'${sqlStr(cfg.userName)}', ` +
    `'opened', ` +
    `E'${sqlStr(text)}', ` +
    `1, ` +
    `'${sqlStr(ts)}', ` +
    `'${sqlStr(ts)}', ` +
    `'${sqlStr(agent)}', ` +
    `''` +
    `)`
  );
  process.stdout.write(`${goalId}\n`);
}

async function goalList(filter: "all" | "mine"): Promise<void> {
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  let where = "";
  if (filter === "mine") where = `WHERE owner = '${sqlStr(cfg.userName)}'`;
  try {
    const rows = await query(
      `SELECT goal_id, owner, status, content FROM "${safe}" ${where} ORDER BY created_at DESC LIMIT 50`
    );
    if (rows.length === 0) {
      process.stdout.write("(no goals)\n");
      return;
    }
    for (const r of rows) {
      const text = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.goal_id}\t${r.owner}\t${r.status}\t${text}\n`);
    }
  } catch (e: unknown) {
    process.stderr.write(`hivemind goal list: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

async function goalGet(goalId: string): Promise<void> {
  if (!goalId) { process.stderr.write("usage: hivemind goal get <goal_id>\n"); process.exit(1); }
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { query } = loadApiOrDie(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  try {
    // Latest version wins (the VFS write path appends a fresh row per
    // overwrite; the CLI updates in place). Print the FULL content — this
    // is the resumable context package a future session reads back.
    const rows = await query(
      `SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY version DESC, created_at DESC LIMIT 1`
    );
    if (rows.length === 0) {
      process.stderr.write(`goal not found: ${goalId}\n`);
      process.exit(1);
    }
    process.stdout.write(`${String(rows[0].content ?? "")}\n`);
  } catch (e: unknown) {
    process.stderr.write(`hivemind goal get: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

async function goalDone(goalId: string): Promise<void> {
  await goalProgress(goalId, "closed");
}

async function goalProgress(goalId: string, status: string): Promise<void> {
  if (!VALID_STATUS.has(status)) {
    process.stderr.write(`invalid status: ${status} (expected opened|in_progress|closed)\n`);
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { api, query } = loadApiOrDie(cfg.goalsTableName);
  // Heal the schema before the UPDATE: an upgraded workspace's preexisting
  // table may lack the `updated_at` column, and this path (unlike `goal add`)
  // is the only thing that runs before the write.
  await api.ensureGoalsTable(cfg.goalsTableName);
  const safe = sqlIdent(cfg.goalsTableName);
  const ts = new Date().toISOString();
  await query(
    `UPDATE "${safe}" SET status = '${sqlStr(status)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}'`
  );
  process.stdout.write(`${goalId} -> ${status}\n`);
}

// ── kpi subcommands ─────────────────────────────────────────────────────────

async function kpiAdd(args: string[]): Promise<void> {
  const [goalId, kpiId, targetStr, unit, ...nameParts] = args;
  if (!goalId || !kpiId || !targetStr || !unit) {
    process.stderr.write("usage: hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]\n");
    process.exit(1);
  }
  const target = Number.parseInt(targetStr, 10);
  if (!Number.isFinite(target) || target <= 0) {
    process.stderr.write(`invalid target: ${targetStr} (must be positive integer)\n`);
    process.exit(1);
  }
  const name = nameParts.length > 0 ? nameParts.join(" ") : kpiId;
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  const content = `${name}\n\n- target: ${target}\n- current: 0\n- unit: ${unit}`;
  const ts = new Date().toISOString();
  await query(
    `INSERT INTO "${safe}" (id, goal_id, kpi_id, content, version, created_at, updated_at, agent, plugin_version) VALUES (` +
    `'${randomUUID()}', ` +
    `'${sqlStr(goalId)}', ` +
    `'${sqlStr(kpiId)}', ` +
    `E'${sqlStr(content)}', ` +
    `1, ` +
    `'${sqlStr(ts)}', ` +
    `'${sqlStr(ts)}', ` +
    `'manual', ` +
    `''` +
    `)`
  );
  process.stdout.write(`${goalId}/${kpiId}\n`);
}

async function kpiList(goalId: string): Promise<void> {
  if (!goalId) { process.stderr.write("usage: hivemind kpi list <goal_id>\n"); process.exit(1); }
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { query } = loadApiOrDie(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  try {
    const rows = await query(
      `SELECT kpi_id, content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' ORDER BY created_at ASC LIMIT 50`
    );
    if (rows.length === 0) { process.stdout.write("(no kpis)\n"); return; }
    for (const r of rows) {
      const firstLine = String(r.content ?? "").split(/\r?\n/)[0].trim();
      process.stdout.write(`${r.kpi_id}\t${firstLine}\n`);
    }
  } catch (e: unknown) {
    process.stderr.write(`hivemind kpi list: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

async function kpiBump(goalId: string, kpiId: string, deltaStr: string): Promise<void> {
  if (!goalId || !kpiId || !deltaStr) {
    process.stderr.write("usage: hivemind kpi bump <goal_id> <kpi_id> <delta>\n");
    process.exit(1);
  }
  const delta = Number.parseInt(deltaStr, 10);
  if (!Number.isFinite(delta)) {
    process.stderr.write(`invalid delta: ${deltaStr}\n`);
    process.exit(1);
  }
  const cfg = loadRoutedConfig();
  if (!cfg) { process.stderr.write("not logged in\n"); process.exit(1); }
  const { api, query } = loadApiOrDie(cfg.kpisTableName);
  // Heal the schema before the UPDATE — same reason as goalProgress: a
  // preexisting KPIs table may not yet have the `updated_at` column.
  await api.ensureKpisTable(cfg.kpisTableName);
  const safe = sqlIdent(cfg.kpisTableName);
  // Read current content
  const rows = await query(
    `SELECT content FROM "${safe}" WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}' LIMIT 1`
  );
  if (rows.length === 0) {
    process.stderr.write(`kpi not found: ${goalId}/${kpiId}\n`);
    process.exit(1);
  }
  const content = String(rows[0].content ?? "");
  // Find and bump the `current:` line
  const newContent = content.replace(
    /^(\s*-?\s*current\s*:\s*)(-?\d+)(\s*)$/m,
    (_m, prefix, n, suffix) => `${prefix}${Number.parseInt(n, 10) + delta}${suffix}`
  );
  if (newContent === content) {
    process.stderr.write(`could not find 'current:' line in kpi ${goalId}/${kpiId}\n`);
    process.exit(1);
  }
  const ts = new Date().toISOString();
  await query(
    `UPDATE "${safe}" SET content = E'${sqlStr(newContent)}', updated_at = '${sqlStr(ts)}' WHERE goal_id = '${sqlStr(goalId)}' AND kpi_id = '${sqlStr(kpiId)}'`
  );
  process.stdout.write(`${goalId}/${kpiId} +${delta}\n`);
}

// ── dispatchers ─────────────────────────────────────────────────────────────

const USAGE_GOAL = `
hivemind goal — manage team goals

Usage:
  hivemind goal add "<text>" [--agent manual|capture]
                                        create a goal (status=opened)
  hivemind goal list [--all|--mine]     list goals (default: --mine)
  hivemind goal get <goal_id>           print a goal's full body (resume context)
  hivemind goal done <goal_id>          mark goal closed
  hivemind goal progress <goal_id> <opened|in_progress|closed>
`.trim();

export async function runGoalCommand(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") { process.stdout.write(USAGE_GOAL + "\n"); return; }
  if (sub === "add") {
    const { agent, rest } = parseAgentFlag(args.slice(1));
    const text = rest.join(" ").trim();
    if (!text) { process.stderr.write("usage: hivemind goal add \"<text>\"\n"); process.exit(1); }
    await goalAdd(text, agent);
    return;
  }
  if (sub === "list") {
    const filter = args.includes("--all") ? "all" : "mine";
    await goalList(filter);
    return;
  }
  if (sub === "get") {
    const id = args[1];
    if (!id) { process.stderr.write("usage: hivemind goal get <goal_id>\n"); process.exit(1); }
    await goalGet(id);
    return;
  }
  if (sub === "done") {
    const id = args[1];
    if (!id) { process.stderr.write("usage: hivemind goal done <goal_id>\n"); process.exit(1); }
    await goalDone(id);
    return;
  }
  if (sub === "progress") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) { process.stderr.write("usage: hivemind goal progress <goal_id> <status>\n"); process.exit(1); }
    await goalProgress(id, status);
    return;
  }
  process.stderr.write(`unknown goal subcommand: ${sub}\n${USAGE_GOAL}\n`);
  process.exit(1);
}

const USAGE_KPI = `
hivemind kpi — manage goal KPIs

Usage:
  hivemind kpi add <goal_id> <kpi_id> <target> <unit> [name]
  hivemind kpi list <goal_id>
  hivemind kpi bump <goal_id> <kpi_id> <delta>
`.trim();

export async function runKpiCommand(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") { process.stdout.write(USAGE_KPI + "\n"); return; }
  if (sub === "add") { await kpiAdd(args.slice(1)); return; }
  if (sub === "list") { await kpiList(args[1]); return; }
  if (sub === "bump") { await kpiBump(args[1], args[2], args[3]); return; }
  process.stderr.write(`unknown kpi subcommand: ${sub}\n${USAGE_KPI}\n`);
  process.exit(1);
}
