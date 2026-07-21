/**
 * Manual local -> Deeplake skill upload — the inverse of `pull`.
 *
 * `hivemind skillify push <name>` reads an existing
 * <skillsRoot>/<name>/SKILL.md and writes it to the org `skills` table as a
 * fresh append-only version. This is the escape hatch for skills the
 * background mining worker never produced: a skill Claude wrote during a
 * context-switch-heavy session, or one authored in a casual conversation the
 * summarizer / LLM gate would never turn into a skill on its own.
 *
 * Versioning is append-only, same as the worker (skills-table.ts): read the
 * latest remote version for (name, author) and INSERT at version + 1. A skill
 * not yet in the table starts at its local frontmatter version (or 1). This
 * avoids the UPDATE-coalescing quirk documented in CLAUDE.md.
 *
 * Authorship follows the same lineage model as cross-author MERGE (#118): the
 * frontmatter `author` (original creator) is preserved as the row's author so
 * version bumps key on the same identity; the pushing user is appended to
 * `contributors`. A legacy local file with no frontmatter author falls back
 * to the pusher as the author.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, resolveSkillsRoot, assertValidSkillName } from "./skill-writer.js";
import { insertSkillRow } from "./skills-table.js";
import { readCurrentSkillRow, type CurrentSkillRow } from "./skill-org-publish.js";
import { isMissingTableError } from "../deeplake-schema.js";
import { deriveProjectKey } from "../utils/repo-identity.js";
import type { Scope } from "./scope-config.js";

export interface PushArgs {
  /** Async SQL executor (the API client's `query`, or a test mock). */
  query: (sql: string) => Promise<Array<Record<string, unknown>>>;
  tableName: string;
  workspaceId: string;
  /** Which local skills dir to read from. */
  from: "project" | "global";
  /** Project root — source root resolution + project_key derivation. */
  cwd: string;
  /** Skill directory name (validated as kebab-case). */
  skillName: string;
  /** Pushing user's username (config.userName) — fallback author + contributor. */
  pusher: string;
  /** Sharing scope written to the row (loadScopeConfig().scope). */
  scope: Scope;
  /** Fallback agent for source_agent when frontmatter has no created_by_agent. */
  agent: string;
  /** When true, compute everything but skip the INSERT. */
  dryRun?: boolean;
  /** Override timestamp (tests). Defaults to now. */
  now?: string;
}

export interface PushSummary {
  name: string;
  localPath: string;
  /** Author written to the row (original creator, or pusher for legacy files). */
  author: string;
  contributors: string[];
  /** Version written this push. */
  version: number;
  /** Latest remote version before this push, or null when the skill was new. */
  previousVersion: number | null;
  action: "pushed" | "dryrun";
  project: string;
  projectKey: string;
  scope: Scope;
}

export interface ParsedLocalSkill {
  description: string;
  trigger?: string;
  body: string;
  author?: string;
  contributors: string[];
  sourceSessions: string[];
  version: number;
  agent?: string;
  createdAt?: string;
}

/**
 * Read and parse a local SKILL.md into the fields needed for an org INSERT.
 * Throws with a clear message when the file is missing or has no frontmatter
 * — both are user-actionable ("you named the wrong skill" / "this file isn't
 * a skill").
 */
export function readLocalSkill(skillsRoot: string, name: string): ParsedLocalSkill {
  assertValidSkillName(name);
  const path = join(skillsRoot, name, "SKILL.md");
  if (!existsSync(path)) {
    throw new Error(`skill '${name}' not found at ${path}`);
  }
  const parsed = parseFrontmatter(readFileSync(path, "utf-8"));
  if (!parsed) {
    throw new Error(`skill '${name}' at ${path} has no valid frontmatter — cannot push`);
  }
  const fm = parsed.fm;
  return {
    description: typeof fm.description === "string" ? fm.description : "",
    trigger: typeof fm.trigger === "string" ? fm.trigger : undefined,
    body: parsed.body.trim(),
    author: typeof fm.author === "string" && fm.author.length > 0 ? fm.author : undefined,
    contributors: Array.isArray(fm.contributors) ? fm.contributors : [],
    sourceSessions: Array.isArray(fm.source_sessions) ? fm.source_sessions : [],
    version: typeof fm.version === "number" && fm.version > 0 ? fm.version : 1,
    agent: typeof fm.created_by_agent === "string" ? fm.created_by_agent : undefined,
    createdAt: typeof fm.created_at === "string" ? fm.created_at : undefined,
  };
}

/**
 * Contributor list for the pushed row: seed from the local frontmatter list
 * (or [author] when it's empty but an author is known), then append the
 * pusher if not already present — recording who performed the manual upload.
 */
export function computePushContributors(
  base: string[],
  author: string | undefined,
  pusher: string,
): string[] {
  const seed = base.length > 0 ? base : author ? [author] : [];
  const out = [...seed];
  if (pusher && !out.includes(pusher)) out.push(pusher);
  return out;
}

/**
 * Read a local skill and publish it to the org `skills` table as the next
 * append-only version. Returns a summary for the CLI to print.
 */
export async function runPush(args: PushArgs): Promise<PushSummary> {
  const skillsRoot = resolveSkillsRoot(args.from, args.cwd);
  const local = readLocalSkill(skillsRoot, args.skillName);
  const localPath = join(skillsRoot, args.skillName, "SKILL.md");

  // Row identity for version bumping is (name, author). Preserve the original
  // creator's authorship when the frontmatter carries it; fall back to the
  // pusher for a legacy file with no author.
  const author = local.author ?? args.pusher;

  // The version-lookup SELECT runs before the INSERT. On a first-ever push the
  // skills table may not exist yet — a missing table simply means zero prior
  // versions of this skill, so treat it like "not found" and let insertSkillRow
  // lazy-create the table on its write path (skills-table.ts), matching how the
  // worker behaves. Any other error is a real failure and rethrows.
  let current: CurrentSkillRow | null;
  try {
    current = await readCurrentSkillRow(args.query, args.tableName, args.skillName, author);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTableError(msg)) current = null;
    else throw e;
  }
  const previousVersion = current ? current.version : null;
  const version = current ? current.version + 1 : local.version;

  const contributors = computePushContributors(local.contributors, local.author, args.pusher);
  const { key: projectKey, project } = deriveProjectKey(args.cwd);
  const now = args.now ?? new Date().toISOString();
  // Preserve the lineage's original creation time across version bumps: prefer
  // the local file's frontmatter, then the already-fetched remote row's
  // created_at (so re-pushing a legacy file with no local timestamp doesn't
  // reset the lineage), and only stamp `now` for a genuinely new skill.
  // `||` (not `??`) so an empty-string created_at on a legacy remote row falls
  // through to `now` rather than persisting "".
  const createdAt = local.createdAt || current?.createdAt || now;

  if (!args.dryRun) {
    await insertSkillRow({
      query: args.query,
      tableName: args.tableName,
      workspaceId: args.workspaceId,
      name: args.skillName,
      project,
      projectKey,
      localPath,
      install: args.from,
      sourceSessions: local.sourceSessions,
      sourceAgent: local.agent ?? args.agent,
      scope: args.scope,
      author,
      contributors,
      description: local.description,
      trigger: local.trigger,
      body: local.body,
      version,
      createdAt,
      updatedAt: now,
    });
  }

  return {
    name: args.skillName,
    localPath,
    author,
    contributors,
    version,
    previousVersion,
    action: args.dryRun ? "dryrun" : "pushed",
    project,
    projectKey,
    scope: args.scope,
  };
}
