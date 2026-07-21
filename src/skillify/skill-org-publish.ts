/**
 * Direct publish of a SkillOpt-improved skill BACK to the Deeplake `skills`
 * table — the org-wide source of truth. The engine improves a skill and lands
 * the result as a NEW version (append-only; readers take ORDER BY version DESC),
 * so every teammate re-pulls it on next sync. No approval gate by design:
 * detect → improve → publish, directly.
 *
 * Provenance on the new version: scope is promoted to `team` (a SkillOpt edit is
 * inherently a cross-author/shared edit), the optimizer marker + the triggering
 * user are appended to `contributors`, and name/author are UNCHANGED — the skill
 * keeps its original `name--author` identity (the original owner is never
 * overwritten; the loop is recorded as a contributor, mirroring the existing
 * cross-author MERGE provenance, #118/#125).
 */
import { sqlStr, sqlIdent } from "../utils/sql.js";
import { insertSkillRow } from "./skills-table.js";

/** Contributor marker stamped on every SkillOpt edit, so provenance shows the loop touched it. */
export const SKILLOPT_CONTRIBUTOR = "skillopt";

export interface CurrentSkillRow {
  name: string;
  author: string;
  project: string;
  projectKey: string;
  localPath: string;
  install: "project" | "global";
  sourceSessions: string[];
  sourceAgent: string;
  scope: "me" | "team";
  contributors: string[];
  description: string;
  trigger: string;
  body: string;
  version: number;
  /** Original lineage creation time — preserved across version bumps. May be
   *  "" for legacy rows written before this column carried a value. */
  createdAt: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** contributors / source_sessions are persisted as JSON strings; parse defensively. */
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString);
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(asString) : []; } catch { return []; }
  }
  return [];
}

/**
 * Read the FULL current (latest-version) row for a skill, so a republish can
 * preserve every field it isn't deliberately changing. null when absent.
 */
export async function readCurrentSkillRow(
  query: (sql: string) => Promise<Array<Record<string, unknown>>>,
  skillsTable: string,
  name: string,
  author: string,
): Promise<CurrentSkillRow | null> {
  const rows = await query(
    `SELECT name, author, project, project_key, local_path, install, source_sessions, ` +
    `source_agent, scope, contributors, description, trigger_text, body, version, created_at ` +
    `FROM "${sqlIdent(skillsTable)}" ` +
    `WHERE name = '${sqlStr(name)}' AND author = '${sqlStr(author)}' ` +
    // version DESC, then created_at DESC as a deterministic tie-breaker — if two workers
    // ever land the same version (cross-machine race), readers resolve the SAME row
    // instead of an arbitrary one (codex P2).
    `ORDER BY version DESC, created_at DESC LIMIT 1`,
  );
  const r = rows?.[0];
  if (!r) return null;
  const version = Number(r.version);
  return {
    name: asString(r.name) || name,
    author: asString(r.author) || author,
    project: asString(r.project),
    projectKey: asString(r.project_key),
    localPath: asString(r.local_path),
    install: asString(r.install) === "global" ? "global" : "project",
    sourceSessions: asStringArray(r.source_sessions),
    sourceAgent: asString(r.source_agent),
    scope: asString(r.scope) === "team" ? "team" : "me",
    contributors: asStringArray(r.contributors),
    description: asString(r.description),
    trigger: asString(r.trigger_text),
    body: asString(r.body),
    version: Number.isFinite(version) && version > 0 ? version : 1,
    createdAt: asString(r.created_at),
  };
}

function appendUnique(base: string[], add: Array<string | undefined>): string[] {
  const out = [...base];
  for (const a of add) if (a && !out.includes(a)) out.push(a);
  return out;
}

/**
 * Publish `newBody` as the skill's NEXT version directly into the skills table.
 * version = current.version + 1; scope → `team`; the triggering user (optional)
 * and the SkillOpt marker are appended to contributors (original author kept as
 * the first contributor); name/author unchanged.
 *
 * Concurrency: the caller reads `current` fresh right before this, so a racing
 * publisher at worst produces two rows at the same version — both preserved
 * (append-only), readers take the latest. Returns the published version.
 */
export async function publishImprovedSkill(opts: {
  query: (sql: string) => Promise<unknown>;
  tableName: string;
  workspaceId: string;
  current: CurrentSkillRow;
  newBody: string;
  collaborator?: string;   // the triggering user (whose corpus/agent drove it); optional
  now: string;
}): Promise<{ version: number }> {
  const version = opts.current.version + 1;
  const base = opts.current.contributors.length ? opts.current.contributors : [opts.current.author];
  const contributors = appendUnique(base, [opts.collaborator, SKILLOPT_CONTRIBUTOR]);
  await insertSkillRow({
    query: opts.query,
    tableName: opts.tableName,
    workspaceId: opts.workspaceId,
    name: opts.current.name,
    author: opts.current.author,
    project: opts.current.project,
    projectKey: opts.current.projectKey,
    localPath: opts.current.localPath,
    install: opts.current.install,
    sourceSessions: opts.current.sourceSessions,
    sourceAgent: opts.current.sourceAgent,
    scope: "team",
    contributors,
    description: opts.current.description,
    trigger: opts.current.trigger,
    body: opts.newBody,
    version,
    createdAt: opts.now,
    updatedAt: opts.now,
  });
  return { version };
}
