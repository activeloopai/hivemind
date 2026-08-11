/**
 * Write helpers for `hivemind_rules` — INSERT-only against the immutable
 * skills-table pattern. Every edit appends a fresh row with version+1; we
 * never UPDATE. Reads (see ./read.ts) pick the latest version per rule_id.
 *
 * Why no UPDATEs: the Deeplake backend silently coalesces two rapid
 * UPDATEs on the same row (see CLAUDE.md "UPDATE coalescing quirk").
 * INSERT-only sidesteps the bug entirely. `skills` table uses the same
 * shape — see `deeplake-api.ts:530` for the precedent and
 * `deeplake-schema.ts` RULES_COLUMNS for the column list.
 */

import { randomUUID } from "node:crypto";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import type { RuleRow } from "./read.js";
import { getRuleLatest } from "./read.js";
import type { StorageDialect } from "../deeplake-schema.js";
import { escapedStringPrefix } from "../storage/sql-dialect.js";

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export type RuleStatus = "active" | "done";

export interface InsertRuleInput {
  /** Rule body. Hard cap 2000 chars (see Open Question O5 in the plan). */
  text: string;
  /** user_email of whoever added the rule. */
  assigned_by: string;
  /** Override the `agent` column. Default "manual" — i.e. a human typed it. */
  agent?: string;
  /** Plugin version that produced the write. Empty string lands the column default. */
  plugin_version?: string;
}

export interface EditRuleInput {
  /** Stable rule_id (NOT the per-version `id`). */
  rule_id: string;
  /** user_email of whoever made the edit. */
  assigned_by: string;
  /** New text body. Omit to keep the previous text. */
  text?: string;
  /** New status. Omit to keep the previous status. */
  status?: RuleStatus;
  agent?: string;
  plugin_version?: string;
}

export interface WriteResult {
  rule_id: string;
  version: number;
}

const MAX_TEXT_LENGTH = 2000;

/**
 * Validate the text field. Throws on empty input, over-cap length,
 * or embedded newlines.
 *
 * Newlines are rejected at write time as defense-in-depth against
 * the prompt-injection class: a rule body with `\n` followed by
 * fake "=== HIVEMIND HOW-TO ===" content would inject a section
 * into every SessionStart context. The renderer also sanitizes at
 * render time (handles already-persisted rows) but rejecting up
 * front means users see a clear error instead of silently-mangled
 * output. Codex legacy audit pass 2 flagged this.
 */
function assertValidText(text: string): void {
  if (text.length === 0) throw new Error("Rule text must not be empty");
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Rule text exceeds ${MAX_TEXT_LENGTH} chars (got ${text.length})`);
  }
  // Reject CR, LF, CRLF, U+2028, U+2029, U+0085 — anything a
  // tokenizer or renderer might treat as a section break. Codex
  // pass 4 caught the prior CR/LF-only check that let Unicode line
  // separators through.
  if (/[\r\n\u2028\u2029\u0085]/.test(text)) {
    throw new Error("Rule text must not contain newlines (use one rule per line)");
  }
}

/**
 * Insert a brand new rule. Generates a fresh `rule_id` (UUIDv4) and writes
 * version=1. Scope is hardcoded to 'team' — rules are always org-wide in v1
 * (see A3 in the plan).
 */
export async function insertRule(
  query: QueryFn,
  tableName: string,
  input: InsertRuleInput,
  dialect: StorageDialect = "deeplake",
): Promise<WriteResult> {
  assertValidText(input.text);
  const safe = sqlIdent(tableName);
  const ruleId = randomUUID();
  const rowId = randomUUID();
  const now = new Date().toISOString();
  const agent = input.agent ?? "manual";
  const pluginVersion = input.plugin_version ?? "";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(ruleId)}', ` +
    `${escapedStringPrefix(dialect)}'${sqlStr(input.text)}', ` +
    `'team', ` +
    `'active', ` +
    `'${sqlStr(input.assigned_by)}', ` +
    `1, ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(agent)}', ` +
    `'${sqlStr(pluginVersion)}'` +
    `)`;
  await query(sql);
  return { rule_id: ruleId, version: 1 };
}

/**
 * Edit an existing rule. Reads the latest version, then INSERTs a new row
 * with version+1 carrying the merged text/status (omitted fields inherit
 * from the prior version). Throws when the `rule_id` does not exist.
 */
export async function editRule(
  query: QueryFn,
  tableName: string,
  input: EditRuleInput,
  dialect: StorageDialect = "deeplake",
): Promise<WriteResult> {
  const previous = await getRuleLatest(query, tableName, input.rule_id);
  if (!previous) {
    throw new Error(`Rule not found: ${input.rule_id}`);
  }
  return appendVersion(query, tableName, previous, {
    text: input.text ?? previous.text,
    status: input.status ?? (previous.status as RuleStatus),
    assigned_by: input.assigned_by,
    agent: input.agent,
    plugin_version: input.plugin_version,
  }, dialect);
}

/**
 * Mark a rule done. Convenience wrapper around editRule that sets
 * status='done' and preserves the previous text. Acceptable to "re-done"
 * an already-done rule (no-op-ish — still writes a new version row, which
 * provides an audit trail of who closed it last).
 */
export async function markRuleDone(
  query: QueryFn,
  tableName: string,
  input: { rule_id: string; assigned_by: string; agent?: string; plugin_version?: string },
  dialect: StorageDialect = "deeplake",
): Promise<WriteResult> {
  return editRule(query, tableName, { ...input, status: "done" }, dialect);
}

interface AppendInput {
  text: string;
  status: RuleStatus;
  assigned_by: string;
  agent?: string;
  plugin_version?: string;
}

async function appendVersion(
  query: QueryFn,
  tableName: string,
  previous: RuleRow,
  next: AppendInput,
  dialect: StorageDialect,
): Promise<WriteResult> {
  assertValidText(next.text);
  const safe = sqlIdent(tableName);
  const rowId = randomUUID();
  const now = new Date().toISOString();
  const nextVersion = previous.version + 1;
  const agent = next.agent ?? "manual";
  const pluginVersion = next.plugin_version ?? "";

  const sql =
    `INSERT INTO "${safe}" ` +
    `(id, rule_id, text, scope, status, assigned_by, version, created_at, agent, plugin_version) ` +
    `VALUES (` +
    `'${sqlStr(rowId)}', ` +
    `'${sqlStr(previous.rule_id)}', ` +
    `${escapedStringPrefix(dialect)}'${sqlStr(next.text)}', ` +
    `'team', ` +
    `'${sqlStr(next.status)}', ` +
    `'${sqlStr(next.assigned_by)}', ` +
    `${nextVersion}, ` +
    `'${sqlStr(now)}', ` +
    `'${sqlStr(agent)}', ` +
    `'${sqlStr(pluginVersion)}'` +
    `)`;
  await query(sql);
  return { rule_id: previous.rule_id, version: nextVersion };
}

/** Test-only export so unit tests can verify the cap without monkey-patching. */
export const _MAX_TEXT_LENGTH = MAX_TEXT_LENGTH;
