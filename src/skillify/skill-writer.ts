/**
 * Write or merge a SKILL.md into <project>/.claude/skills/<name>/SKILL.md.
 *
 * Frontmatter shape:
 *   name: <skill-name>
 *   description: <one-line>
 *   trigger: <one-line>
 *   author: <original creator's username>
 *   source_sessions: [<uuid>, ...]
 *   contributors: [<username>, ...]      # ordered chronologically by edit
 *   version: <int, bumps on merge>
 *   created_by_agent: <agent-name>
 *   created_at: <iso>
 *   updated_at: <iso>
 *
 * Contributors model (issue #118): the `author` field is the original
 * creator's username (v=1) and never changes across merges. `contributors`
 * starts as `[author]` and gets the current editor appended on every
 * cross-author MERGE (the worker decides whether to append). Same-author
 * MERGEs do not duplicate the entry. Legacy files without these fields
 * read back as `author=undefined`, `contributors=[]`; callers fall back
 * to the `author` arg they were given when that happens.
 *
 * The body returned by the gate is written verbatim. We do not parse or
 * reformat it — the gate is responsible for shape.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: string;
  /** Original creator's username — set on v=1, immutable across merges. */
  author?: string;
  source_sessions: string[];
  /** Editors in order of first contribution. Includes `author` as the first entry. */
  contributors?: string[];
  version: number;
  created_by_agent: string;
  created_at: string;
  updated_at: string;
}

export interface WriteSkillArgs {
  skillsRoot: string;
  name: string;
  description: string;
  trigger?: string;
  body: string;
  sourceSessions: string[];
  agent: string;
  /**
   * Author of this fresh skill (cfg.userName in the worker). Stored as the
   * frontmatter `author` and seeds `contributors=[author]`. Empty string
   * is allowed for legacy callers / tests; we just omit the fields then.
   */
  author?: string;
}

export interface MergeSkillArgs {
  skillsRoot: string;
  name: string;            // existing skill to merge into
  description?: string;    // optional override
  body: string;            // merged body returned by gate
  newSourceSessions: string[];
  agent: string;
  /**
   * Username of whoever is performing this MERGE (cfg.userName in the
   * worker). Appended to `contributors` if not already present. Omit only
   * in legacy tests; production callers always pass it so the
   * cross-author lineage is recorded.
   */
  editor?: string;
}

export interface SkillWriteResult {
  path: string;
  /**
   * The canonical on-disk skill name: for a new skill this is the (possibly
   * length-capped) name actually written; for a merge it's the target's name.
   * Callers must record THIS in local state and the org row so the recorded
   * identity matches the frontmatter/dir — never the raw pre-cap input.
   */
  name: string;
  action: "created" | "merged";
  version: number;
  /** ISO timestamp of the v=1 row's creation, preserved across merges. */
  createdAt: string;
  /** ISO timestamp of this write. */
  updatedAt: string;
  /** Original creator (frontmatter `author`). Undefined for legacy v=1 rows. */
  author?: string;
  /** Full contributor list after this write — caller uses it for the DB INSERT. */
  contributors: string[];
}

/**
 * Hard ceiling on a skill's frontmatter `name`. The codex skill loader
 * rejects any skill whose `name` exceeds 64 chars ("invalid name: exceeds
 * maximum length of 64 characters") and silently drops it. Verified
 * empirically: a 64-char name loads, 66+ is rejected. The directory name is
 * NOT the constraint — codex loads `<name>--<author>` dirs well over 64 chars
 * as long as the frontmatter `name` fits — so only the `name` is capped.
 */
export const MAX_SKILL_NAME_LEN = 64;

/** Length of the disambiguating suffix (`-` + {@link CAP_HASH_LEN} chars). */
const CAP_HASH_LEN = 5;
/** 36^CAP_HASH_LEN — modulus that keeps exactly CAP_HASH_LEN base-36 digits. */
const CAP_HASH_MOD = 36 ** CAP_HASH_LEN;

/**
 * Deterministic short hash (djb2 → base36) used to disambiguate truncated
 * names. Deterministic so the same input always caps to the same output —
 * required for pull re-runs and for the on-disk dir to match the org row.
 *
 * Uses `% CAP_HASH_MOD` (the LOW-order base-36 digits), not the leading
 * digits: djb2 changes the low bits most for small input deltas (e.g. names
 * ending `-0` vs `-1` differ by 1 in the final hash), so slicing the high
 * digits would collapse them onto the same suffix. Modulo keeps the digits
 * that actually differ.
 */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h % CAP_HASH_MOD).toString(36).padStart(CAP_HASH_LEN, "0");
}

/**
 * Truncate a kebab-case skill name to {@link MAX_SKILL_NAME_LEN}. The model
 * that names skills does not reliably respect a length limit, so we enforce it
 * deterministically here rather than rejecting (and losing) an otherwise-good
 * skill.
 *
 * Truncation appends a short hash of the FULL name so two distinct long names
 * that share a prefix through the chosen hyphen boundary don't collapse onto
 * the same identity (which would overwrite one skill with the other on pull,
 * or version-confuse them in the org table). The cut lands on a hyphen
 * boundary when possible and trailing hyphens are stripped, so the result is
 * still a valid kebab-case slug. Idempotent: a name already <= the ceiling is
 * returned unchanged, so re-capping a capped name is a no-op.
 */
export function capSkillName(name: string): string {
  if (name.length <= MAX_SKILL_NAME_LEN) return name;
  const suffix = `-${shortHash(name)}`;
  const budget = MAX_SKILL_NAME_LEN - suffix.length;
  let cut = name.slice(0, budget);
  const lastHyphen = cut.lastIndexOf("-");
  if (lastHyphen > 0) cut = cut.slice(0, lastHyphen);
  cut = cut.replace(/-+$/, "");
  // Degenerate fallback: a hyphenless prefix. Keep the first `budget` chars.
  if (cut.length === 0) cut = name.slice(0, budget).replace(/-+$/, "");
  return `${cut}${suffix}`;
}

/**
 * Reject any name that isn't a strict kebab-case slug. The name comes from
 * model output (the gate verdict) or from a remote `skills` row pulled over
 * the network — both untrusted. Without this check, a verdict like
 * `../../etc/passwd` or `/abs/path` would escape `skillsRoot` when joined.
 *
 * This is a PATH-SAFETY validator, not the skill-loader length limit: it keeps
 * a generous 100-char ceiling (defensive — no legitimate kebab-case name needs
 * more) so it can validate a long remote name's characters BEFORE the length
 * is capped. The 64-char loader ceiling is owned by {@link capSkillName}, which
 * write sites apply. It also rejects any name containing path separators even
 * if the regex passed (belt + suspenders).
 */
export function assertValidSkillName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`invalid skill name: empty or non-string`);
  }
  if (name.length > 100) {
    throw new Error(`invalid skill name: too long (${name.length} chars)`);
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`invalid skill name: contains path separator or '..': ${name}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid skill name: must be kebab-case (lowercase a-z, 0-9, hyphen): ${name}`);
  }
}

function skillDir(skillsRoot: string, name: string): string {
  return join(skillsRoot, name);
}

function skillPath(skillsRoot: string, name: string): string {
  return join(skillDir(skillsRoot, name), "SKILL.md");
}

/**
 * Fold the activation condition into the description the host agent actually
 * reads. Claude Code / Codex surface only `name` + `description` when deciding
 * whether to invoke a skill — the `trigger` frontmatter field is custom and
 * never reaches the model. So a well-written trigger is invisible to skill
 * selection unless it also lives in `description`. Idempotent: composing an
 * already-composed description is a no-op, so it survives the
 * parse → merge → re-render roundtrip without stacking duplicate clauses.
 */
export function composeDescription(description: string, trigger?: string): string {
  const desc = (description ?? "").trim();
  const trig = (trigger ?? "").trim();
  if (!trig) return desc;
  // Already composed, or the description is itself phrased as a trigger.
  if (desc.includes(trig) || /use this skill when/i.test(desc)) return desc;
  // Normalize common trigger phrasings ("Use when X" / "When X") to one clause.
  const condition = trig.replace(/^(use this skill when|use when|when)\s+/i, "");
  const tail = `Use this skill when ${condition}`;
  if (!desc) return tail;
  const lead = /[.!?]$/.test(desc) ? desc : `${desc}.`;
  return `${lead} ${tail}`;
}

/** Render YAML-ish frontmatter. Conservative quoting — no embedded newlines. */
function renderFrontmatter(fm: SkillFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${JSON.stringify(composeDescription(fm.description, fm.trigger))}`);
  if (fm.trigger) lines.push(`trigger: ${JSON.stringify(fm.trigger)}`);
  if (fm.author) lines.push(`author: ${fm.author}`);
  lines.push(`source_sessions:`);
  for (const s of fm.source_sessions) lines.push(`  - ${s}`);
  // Render contributors only when non-empty so legacy files don't grow an
  // empty `contributors:` block on a roundtrip.
  if (fm.contributors && fm.contributors.length > 0) {
    lines.push(`contributors:`);
    for (const c of fm.contributors) lines.push(`  - ${c}`);
  }
  lines.push(`version: ${fm.version}`);
  lines.push(`created_by_agent: ${fm.created_by_agent}`);
  lines.push(`created_at: ${fm.created_at}`);
  lines.push(`updated_at: ${fm.updated_at}`);
  lines.push("---");
  return lines.join("\n");
}

/**
 * Parse the frontmatter of an existing SKILL.md. Returns null if the file
 * has no frontmatter or is malformed — the caller treats that as "create
 * fresh, don't try to merge."
 */
export function parseFrontmatter(text: string): { fm: Partial<SkillFrontmatter>; body: string } | null {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0) return null;
  const head = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const fm: Partial<SkillFrontmatter> = { source_sessions: [] };
  // arrayKey carries the current array field we're consuming. Generalizes
  // the old "sources" mode so we can also parse `contributors:` without
  // duplicating the bullet-list parsing.
  let arrayKey: "source_sessions" | "contributors" | null = null;
  for (const raw of head.split(/\r?\n/)) {
    if (arrayKey) {
      const m = raw.match(/^\s+-\s+(.+)$/);
      if (m) {
        const arr = (fm as any)[arrayKey] as string[] | undefined ?? [];
        arr.push(m[1].trim());
        (fm as any)[arrayKey] = arr;
        continue;
      }
      arrayKey = null;
    }
    if (raw.startsWith("source_sessions:")) { arrayKey = "source_sessions"; continue; }
    if (raw.startsWith("contributors:")) { arrayKey = "contributors"; fm.contributors = []; continue; }
    const m = raw.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    let val: any = v;
    if (v.startsWith("\"") && v.endsWith("\"")) {
      try { val = JSON.parse(v); } catch { /* keep as raw */ }
    } else if (k === "version") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) val = n;
    }
    (fm as any)[k] = val;
  }
  return { fm, body };
}

/** Write a new skill file. Errors if it already exists. */
export function writeNewSkill(args: WriteSkillArgs): SkillWriteResult {
  // Validate the RAW name's characters/path BEFORE capping its length, so an
  // invalid tail (traversal / bad chars) beyond the retained prefix is
  // rejected rather than silently truncated away. Then cap at this write seam
  // so every caller (gate worker KEEP, mine-local, …) is loader-safe without
  // each remembering to cap. Idempotent for already-capped names. mergeSkill
  // deliberately does NOT cap — it must match an existing (possibly legacy
  // over-long) target by its exact name.
  assertValidSkillName(args.name);
  const name = capSkillName(args.name);
  const dir = skillDir(args.skillsRoot, name);
  const path = skillPath(args.skillsRoot, name);
  if (existsSync(path)) {
    throw new Error(`skill already exists at ${path}; use mergeSkill`);
  }
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  // Seed contributors with the author if one was provided. Empty / missing
  // author keeps both fields absent so legacy callers see no schema churn.
  const author = args.author && args.author.length > 0 ? args.author : undefined;
  const contributors = author ? [author] : [];
  const fm: SkillFrontmatter = {
    name,
    description: args.description,
    trigger: args.trigger,
    author,
    source_sessions: args.sourceSessions,
    contributors,
    version: 1,
    created_by_agent: args.agent,
    created_at: now,
    updated_at: now,
  };
  const text = `${renderFrontmatter(fm)}\n\n${args.body.trim()}\n`;
  writeFileSync(path, text);
  return {
    path, name, action: "created", version: 1,
    createdAt: now, updatedAt: now,
    author, contributors,
  };
}

/**
 * Replace an existing skill's body with a merged version, append the new
 * source sessions, and bump the version.
 */
export function mergeSkill(args: MergeSkillArgs): SkillWriteResult {
  assertValidSkillName(args.name);
  const path = skillPath(args.skillsRoot, args.name);
  if (!existsSync(path)) {
    throw new Error(`skill ${args.name} does not exist at ${path}; use writeNewSkill`);
  }
  const existing = readFileSync(path, "utf-8");
  const parsed = parseFrontmatter(existing);
  const prevVersion = (parsed?.fm.version as number) ?? 1;
  const prevSources = parsed?.fm.source_sessions ?? [];
  const merged = Array.from(new Set([...prevSources, ...args.newSourceSessions]));
  // Author is immutable across merges. If the v=1 row didn't carry one
  // (legacy), preserve absence — better than retroactively claiming the
  // editor wrote v=1.
  const author = (parsed?.fm.author as string | undefined);
  // Contributors: take what's already there (or treat legacy [] as [author]
  // if we have an author), then append the editor if not already in it.
  const prevContribs =
    parsed?.fm.contributors && parsed.fm.contributors.length > 0
      ? parsed.fm.contributors
      : (author ? [author] : []);
  const contributors = [...prevContribs];
  if (args.editor && args.editor.length > 0 && !contributors.includes(args.editor)) {
    contributors.push(args.editor);
  }
  const now = new Date().toISOString();
  const fm: SkillFrontmatter = {
    name: args.name,
    description: args.description ?? (parsed?.fm.description as string) ?? "",
    trigger: parsed?.fm.trigger as string | undefined,
    author,
    source_sessions: merged,
    contributors,
    version: prevVersion + 1,
    created_by_agent: (parsed?.fm.created_by_agent as string) ?? args.agent,
    created_at: (parsed?.fm.created_at as string) ?? now,
    updated_at: now,
  };
  const text = `${renderFrontmatter(fm)}\n\n${args.body.trim()}\n`;
  writeFileSync(path, text);
  return {
    path, name: args.name, action: "merged", version: fm.version,
    createdAt: fm.created_at, updatedAt: fm.updated_at,
    author, contributors,
  };
}

/**
 * List all existing skills under a skills directory (e.g. <project>/.claude/skills
 * or ~/.claude/skills), returning their full SKILL.md contents (frontmatter
 * included) so the gate can evaluate them.
 */
export function listSkills(skillsRoot: string): { name: string; body: string }[] {
  if (!existsSync(skillsRoot)) return [];
  const out: { name: string; body: string }[] = [];
  for (const name of readdirSync(skillsRoot)) {
    const skillFile = join(skillsRoot, name, "SKILL.md");
    if (existsSync(skillFile) && statSync(skillFile).isFile()) {
      out.push({ name, body: readFileSync(skillFile, "utf-8") });
    }
  }
  return out;
}

/** Compute the skills directory for a given install scope. */
export function resolveSkillsRoot(install: "project" | "global", cwd: string): string {
  if (install === "global") {
    return join(homedir(), ".claude", "skills");
  }
  return join(cwd, ".claude", "skills");
}
