#!/usr/bin/env node

/**
 * CLI surface for `hivemind rules`.
 *
 * Usage:
 *   hivemind rules add "<text>" [--scope team]
 *       Add a new team-wide rule. v1 hardcodes scope='team' (the only
 *       supported value); the flag is accepted for forward compatibility.
 *   hivemind rules list [--status active|done|all] [--limit N]
 *       List rules. Default: active, latest 10.
 *   hivemind rules edit <rule-id> "<new text>"
 *       Edit an existing rule's text — INSERTs a fresh version row,
 *       preserves the rule_id, bumps version.
 *   hivemind rules done <rule-id>
 *       Mark a rule done (status='done'). Audit-trail-preserving: a new
 *       version row is appended even if the rule is already done.
 *
 * The handler is deliberately thin — it parses argv, loads config,
 * constructs the api client, and delegates to src/rules/{write,read}.
 * All SQL escaping and version-bump logic lives in the rules module
 * (see ./rules-module commit).
 */

import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getVersion } from "../cli/version.js";
import {
  insertRule,
  editRule,
  markRuleDone,
  listRules,
  type RuleRow,
} from "../rules/index.js";
import { isMissingTableError } from "../deeplake-schema.js";

const USAGE = `
hivemind rules — manage team-wide rules

Usage:
  hivemind rules add "<text>" [--scope team]
  hivemind rules list [--status active|done|all] [--limit N]
  hivemind rules edit <rule-id> "<new text>"
  hivemind rules done <rule-id>
`.trim();

function logUsageAndExit(code = 1): never {
  console.error(USAGE);
  process.exit(code);
  // process.exit is typed `never`, but tsc still wants an exhaustive
  // return on every code path that calls this helper.
  throw new Error("unreachable");
}

function requireConfig(): ReturnType<typeof loadRoutedConfig> & object {
  const cfg = loadRoutedConfig();
  if (!cfg) {
    console.error("Not logged in. Run `hivemind login` first.");
    process.exit(2);
    throw new Error("unreachable");
  }
  return cfg;
}

function makeApi(cfg: NonNullable<ReturnType<typeof loadRoutedConfig>>): DeeplakeApi {
  return new DeeplakeApi(
    cfg.token,
    cfg.apiUrl,
    cfg.orgId,
    cfg.workspaceId,
    cfg.tableName, // unused by ensureRulesTable but the constructor needs it
  );
}

function parseScope(args: string[]): "team" | null {
  const idx = args.findIndex(a => a === "--scope" || a.startsWith("--scope="));
  if (idx === -1) return "team";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw !== "team") {
    console.error(`Invalid --scope value: ${raw}. Rules support 'team' only in v1.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return "team";
}

function parseStatus(args: string[]): "active" | "done" | "all" {
  const idx = args.findIndex(a => a === "--status" || a.startsWith("--status="));
  if (idx === -1) return "active";
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (raw === "active" || raw === "done" || raw === "all") return raw;
  console.error(`Invalid --status value: ${raw}. Allowed: active | done | all.`);
  process.exit(1);
  throw new Error("unreachable");
}

function parseLimit(args: string[]): number {
  const idx = args.findIndex(a => a === "--limit" || a.startsWith("--limit="));
  if (idx === -1) return 10;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(`Invalid --limit value: ${raw}. Must be a positive integer.`);
    process.exit(1);
    throw new Error("unreachable");
  }
  return n;
}

/**
 * Drop flag tokens (and their values) from `args` so the positional
 * argument scan only sees the rule text / rule_id. Recognizes the flags
 * this command actually uses; unknown flags pass through unchanged so a
 * future addition isn't accidentally swallowed.
 */
function stripKnownFlags(args: string[]): string[] {
  const KNOWN = new Set(["--scope", "--status", "--limit"]);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (KNOWN.has(a)) {
      i++; // also skip the value
      continue;
    }
    if (KNOWN.has(a.split("=", 2)[0])) {
      continue; // --flag=value form
    }
    out.push(a);
  }
  return out;
}

function formatListRow(r: RuleRow): string {
  // Print the full rule_id (36-char UUID) so users can copy-paste it
  // straight into `hivemind rules edit <id>` / `done <id>`. An earlier
  // version truncated to 8 chars for readability, but edit/done do an
  // exact-match SELECT on rule_id, so a truncated copy failed with
  // "Rule not found". Codex review on S2 surfaced this — see commit
  // log for context. Future ergonomics (prefix matching, short
  // aliases) tracked as a v1.1 polish item.
  const tag = r.status === "done" ? "[done]" : "[active]";
  return `${tag} ${r.rule_id}  v${r.version}  ${r.assigned_by}  ${r.text}`;
}

export async function runRulesCommand(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE);
    return;
  }

  const cfg = requireConfig();
  const api = makeApi(cfg);
  const tableName = cfg.rulesTableName;
  // Only the write subcommands need DDL — read-only `list` falls back
  // to isMissingTableError handling so a legacy / fresh-install user
  // doesn't take a CREATE/ALTER round-trip every time they list.
  // Codex legacy audit caught this.
  const WRITE_SUBS = new Set(["add", "edit", "done"]);
  if (WRITE_SUBS.has(sub)) {
    await api.ensureRulesTable(tableName);
  }
  const pluginVersion = getVersion();

  if (sub === "add") {
    const positional = stripKnownFlags(args.slice(1));
    const text = positional[0];
    if (!text) {
      console.error("Missing rule text. Usage: hivemind rules add \"<text>\" [--scope team]");
      process.exit(1);
      throw new Error("unreachable");
    }
    parseScope(args.slice(1)); // validate even though scope is hardcoded to 'team'
    try {
      const out = await insertRule(api.query.bind(api), tableName, {
        text,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion,
      });
      console.log(`Added rule ${out.rule_id} (v${out.version}).`);
    } catch (err) {
      console.error(`Add failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "list") {
    const status = parseStatus(args.slice(1));
    const limit = parseLimit(args.slice(1));

    // Skip the SELECT entirely when we can prove the table doesn't exist.
    // `list` (unlike the write subcommands) never runs ensureRulesTable, so an
    // org that has only ever listed rules has no hivemind_rules table. Firing
    // the doomed SELECT logs a 42P01 ERROR on the server for every list and
    // SessionStart inject (fleet-wide: thousands/day), and because the server
    // streams query results the missing-table error can reach the client as an
    // opaque "fetch failed" instead of a clean empty list. A cheap table lookup
    // avoids both. knownTablesOrNull() returns null when the lookup itself was
    // untrustworthy (a network blip): in that case we fall through to the
    // SELECT-then-catch path below so a transient hiccup never hides a table
    // that really exists.
    const knownTables = await api.knownTablesOrNull();
    if (knownTables !== null && !knownTables.includes(tableName)) {
      console.log(`(no rules with status=${status})`);
      return;
    }

    let rows: RuleRow[] = [];
    try {
      rows = await listRules(api.query.bind(api), tableName, { status, limit });
    } catch (err) {
      const msg = (err as Error).message;
      if (!isMissingTableError(msg)) throw err;
      // table missing = legacy state; show empty list.
    }
    if (rows.length === 0) {
      console.log(`(no rules with status=${status})`);
      return;
    }
    for (const r of rows) console.log(formatListRow(r));
    return;
  }

  if (sub === "edit") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    const newText = positional[1];
    if (!ruleId || !newText) {
      console.error("Usage: hivemind rules edit <rule-id> \"<new text>\"");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await editRule(api.query.bind(api), tableName, {
        rule_id: ruleId,
        text: newText,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion,
      });
      console.log(`Edited rule ${out.rule_id} → v${out.version}.`);
    } catch (err) {
      console.error(`Edit failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "done") {
    const positional = stripKnownFlags(args.slice(1));
    const ruleId = positional[0];
    if (!ruleId) {
      console.error("Usage: hivemind rules done <rule-id>");
      process.exit(1);
      throw new Error("unreachable");
    }
    try {
      const out = await markRuleDone(api.query.bind(api), tableName, {
        rule_id: ruleId,
        assigned_by: cfg.userName,
        plugin_version: pluginVersion,
      });
      console.log(`Marked rule ${out.rule_id} done (v${out.version}).`);
    } catch (err) {
      console.error(`Done failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown rules subcommand: ${sub}`);
  logUsageAndExit(1);
}
