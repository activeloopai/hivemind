/**
 * Fetch skills from the Deeplake `skills` table and write them to the
 * local filesystem (project-local or global), so a teammate can install
 * skills authored by other org members.
 *
 * Read path opposite of the worker's write path:
 *   worker: gate → skill-writer (local file) → insertSkillRow (Deeplake)
 *   pull:   query Deeplake → write local SKILL.md
 *
 * Filtering:
 *   - by users:  --user X | --users a,b,c | --all-users (default)
 *   - by name:   pass a positional <skill-name> to fetch only that one
 *
 * Conflict handling:
 *   - if local SKILL.md is missing → write
 *   - if local version < remote version → backup `.bak` + overwrite
 *   - if local version >= remote version → skip (use --force to override)
 */

import {
  existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync,
  lstatSync, readlinkSync, symlinkSync, unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { assertValidSkillName, capSkillName, composeDescription, parseFrontmatter, type SkillFrontmatter } from "./skill-writer.js";
import type { InstallLocation } from "./scope-config.js";
import { entriesForRoot, loadManifest, pruneOrphanedEntries, recordPull, removePullEntry, unlinkSymlinks } from "./manifest.js";
import { detectAgentSkillsRoots } from "./agent-roots.js";

/**
 * Tighter-than-skill-name validator for the author segment that becomes a
 * directory name (`<root>/<name>--<author>/`). Same intent as
 * `assertValidSkillName`: reject anything that could escape the install
 * root or break path-handling tools.
 */
export function assertValidAuthor(author: string): void {
  if (!author) throw new Error("author is empty");
  if (author.length > 64) throw new Error(`author too long (${author.length}): ${author.slice(0, 32)}…`);
  if (!/^[A-Za-z0-9_.\-@]+$/.test(author)) {
    throw new Error(`author contains invalid characters: ${author}`);
  }
}

export type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export interface PullOptions {
  query: QueryFn;
  tableName: string;
  /** Where to write the local SKILL.md files. */
  install: InstallLocation;
  /** Used when install === "project". */
  cwd?: string;
  /** Filter by usernames. Empty array means "all users" (no author filter). */
  users: string[];
  /** Optional specific skill name (positional). */
  skillName?: string;
  /** Don't write — just report. */
  dryRun?: boolean;
  /** Overwrite even when local version >= remote. Backs up the existing file. */
  force?: boolean;
  /**
   * Optional existence predicate built from a trusted table list (see
   * DeeplakeApi.knownTablesOrNull). When it reports the skills table absent
   * we skip the SELECT and treat it as empty — a fresh workspace lazily
   * creates `skills` on first INSERT, so reading it first otherwise logs a
   * 42P01 server-side on every SessionStart auto-pull. Omitted (or the list
   * couldn't be fetched) falls back to the SELECT-then-catch path below.
   */
  tableExists?: (name: string) => boolean;
}

export interface PullResultEntry {
  name: string;
  remoteVersion: number;
  localVersion: number | null;
  /**
   * "wrote"   — file was written (was missing or remote was newer)
   * "skipped" — local already at-or-newer than remote (no --force)
   * "dryrun"  — would have written
   */
  action: "wrote" | "skipped" | "dryrun";
  destination: string;
  author: string;
  sourceAgent: string;
  /**
   * Set when the SKILL.md was written successfully but the manifest
   * recording failed afterwards — surface the underlying message so the
   * caller can warn loudly. The skill exists on disk but `unpull` will
   * not be able to remove it via the manifest path, so the user must
   * either delete the dir manually or repull.
   */
  manifestError?: string;
}

export interface PullSummary {
  scanned: number;
  wrote: number;
  skipped: number;
  dryrun: number;
  entries: PullResultEntry[];
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Build the SELECT SQL — public for testing so we can assert filters /
 * authoring shape without going through the network.
 */
export function buildPullSql(args: {
  tableName: string;
  users: string[];
  skillName?: string;
  /**
   * Legacy mode for tables that pre-date the `contributors` column.
   * The default SELECT includes `contributors`; when a backend errors
   * with "column does not exist" we retry with this flag set to false,
   * and renderSkillFile fills in `contributors = [author]` for any row
   * with a non-empty author.
   */
  includeContributors?: boolean;
}): string {
  const where: string[] = [];
  if (args.users.length > 0) {
    const list = args.users.map(u => `'${esc(u)}'`).join(", ");
    where.push(`author IN (${list})`);
  }
  if (args.skillName) {
    where.push(`name = '${esc(args.skillName)}'`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const contributorsCol = args.includeContributors === false ? "" : "contributors, ";
  return (
    `SELECT name, project, project_key, body, version, source_agent, scope, ` +
    `author, ${contributorsCol}description, trigger_text, source_sessions, install, ` +
    `created_at, updated_at ` +
    `FROM "${args.tableName}"${whereClause} ` +
    `ORDER BY project_key ASC, name ASC, version DESC`
  );
}

/**
 * Recognises errors emitted when a table is missing the `contributors`
 * column — typically a deployment that predates issue #118 and that hasn't
 * had a lazy-migrating INSERT yet. `runPull` catches this and retries
 * the SELECT in legacy mode so an outdated table degrades gracefully
 * instead of aborting the pull entirely.
 *
 * Kept narrow on purpose (must mention the column by name) so generic
 * 400s don't accidentally route into the legacy retry.
 */
export function isMissingContributorsColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /contributors.*(?:does not exist|not found|unknown)/i.test(message)
    || /(?:does not exist|unknown column).*contributors/i.test(message);
}

/**
 * Recognises the various error shapes Deeplake emits when the skills table
 * doesn't exist yet. The table is created lazily on the first INSERT, so a
 * fresh workspace's first `pull` would otherwise crash here. We treat
 * "missing table" as an empty result set — the user has nothing to pull.
 */
export function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  // Missing-column errors typically read
  //   `column "contributors" of relation "skills" does not exist`
  // which would otherwise match the `relation .* does not exist` arm
  // below and get silently swallowed as an empty result set — masking
  // the legacy-table case that needs the contributors-column retry.
  if (/\bcolumn\b/i.test(message)) return false;
  // Deeplake / Postgres-flavoured errors:
  //   "Table does not exist: relation \"skills\" does not exist"
  //   "relation \"skills\" does not exist"
  //   SQLite/local fallback variants.
  // We avoid matching the bare phrase "does not exist" alone because that
  // can legitimately appear in INSERT errors about other entities.
  return /Table does not exist|relation .* does not exist|no such table/i.test(message);
}

/**
 * Resolve the directory where SKILL.md files should be written.
 * Mirror of skill-writer.resolveSkillsRoot but returns a string for testing.
 */
export function resolvePullDestination(install: InstallLocation, cwd?: string): string {
  if (install === "global") return join(homedir(), ".claude", "skills");
  if (!cwd) throw new Error("install=project requires a cwd");
  return join(cwd, ".claude", "skills");
}

/**
 * Make `<root>/<dirName>` point at `canonicalDir` for each detected
 * non-Claude agent root. Returns the absolute paths of every symlink
 * that ended up pointing correctly (existing or newly created), in the
 * order of `agentRoots`. Caller stores this in the manifest entry so
 * unpull can reverse the fan-out without rescanning the disk.
 *
 * Refusal cases (path NOT in the returned list, no exception thrown):
 *  - A non-symlink file or directory already sits at the link path. We
 *    never clobber user data; the user gets the canonical copy under
 *    `~/.claude/skills/` and is responsible for the conflicting entry.
 *  - symlink() raises (Windows non-developer mode, read-only fs,
 *    permission denied). The skill is still on disk under the canonical
 *    location; auto-pull retries on the next session.
 *
 * Idempotency: re-running the same pull with the same agentRoots is a
 * no-op for links that already point at the right target. Stale links
 * (pointing at a different canonical path — e.g. after a HOME move) are
 * unlinked and recreated.
 */
export function fanOutSymlinks(
  canonicalDir: string,
  dirName: string,
  agentRoots: string[],
): string[] {
  const out: string[] = [];
  for (const root of agentRoots) {
    const link = join(root, dirName);
    let existing;
    try { existing = lstatSync(link); } catch { existing = null; }
    if (existing) {
      if (!existing.isSymbolicLink()) {
        // Real file/directory at the target — never clobber. Skip silently;
        // the user can resolve the conflict by removing it and re-running pull.
        continue;
      }
      // Already a symlink. Replace only if it points elsewhere.
      let current: string | null;
      try { current = readlinkSync(link); } catch { current = null; }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try { unlinkSync(link); } catch { continue; }
    }
    try {
      mkdirSync(dirname(link), { recursive: true });
      // "dir" type matters on Windows (junction vs file symlink); ignored on POSIX.
      symlinkSync(canonicalDir, link, "dir");
      out.push(link);
    } catch {
      // Best-effort. The canonical dir exists either way; skip this agent root.
    }
  }
  return out;
}

/**
 * Walk every manifest entry under `installRoot` and ensure each one has
 * fan-out symlinks pointing at the canonical dir for every currently-
 * detected agent skill root. Updates the entry's `symlinks[]` in the
 * manifest if the resolved set differs from the recorded one.
 *
 * Why this exists: the per-row fan-out inside the main pull loop only
 * runs for rows whose action is `"wrote"`. Skills already up-to-date
 * locally take the `"skipped"` path, which doesn't refresh symlinks.
 * That breaks two real scenarios:
 *
 *   1. User installs a NEW agent (codex / hermes / pi) AFTER having
 *      already pulled skills. Without backfill, those existing skills
 *      stay invisible to the new agent until each one is independently
 *      bumped on the org table.
 *   2. User manually `rm`-s a single fan-out symlink. Without backfill,
 *      it stays missing forever (or until the source row's version
 *      bumps).
 *
 * Idempotent: when the on-disk fan-out matches the recorded set,
 * skip the manifest write entirely. The hot-path cost is one
 * `lstat` per (entry × detected root) pair plus three `existsSync`
 * calls in `detectAgentSkillsRoots`. For ~50 entries × 3 roots that's
 * ~150 syscalls, negligible.
 *
 * Skips entries whose canonical dir is missing — those are pruned by
 * `pruneOrphanedEntries()` at the start of `runPull`, so by the time
 * this runs the survivors all have a real canonical dir on disk.
 */
export function backfillSymlinks(installRoot: string): void {
  const manifest = loadManifest();
  const entries = entriesForRoot(manifest, "global", installRoot);
  if (entries.length === 0) return;
  const detected = detectAgentSkillsRoots(installRoot);
  for (const entry of entries) {
    const canonical = join(entry.installRoot, entry.dirName);
    if (!existsSync(canonical)) continue; // pruned/orphan, leave alone
    const fresh = fanOutSymlinks(canonical, entry.dirName, detected);
    if (sameSorted(fresh, entry.symlinks)) continue; // no change, no write
    try {
      recordPull({ ...entry, symlinks: fresh });
    } catch {
      // Manifest write failed — leave the entry stale. Next runPull
      // will retry; the symlinks themselves are already correct on disk.
    }
  }
}

function sameSorted(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/**
 * From the rows returned by the SELECT, keep only the highest-version
 * row per (project_key, name). The SQL already orders by
 * (project_key ASC, name ASC, version DESC), so the first row seen for a
 * given composite key is the latest version.
 *
 * Important: keying by name alone would silently drop one of two distinct
 * skills that happen to share a name across projects (e.g. two repos both
 * have a `deploy` skill).
 */
export function selectLatestPerName(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const name = String(r.name ?? "");
    const projectKey = String(r.project_key ?? "");
    if (!name) continue;
    const key = `${projectKey}\x00${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Render a SKILL.md from a skills-table row. Mirrors writer's frontmatter
 * shape so the pulled file is indistinguishable from a locally-generated one.
 */
export function renderSkillFile(row: Record<string, unknown>, nameOverride?: string): string {
  const sources = parseSourceSessions(row.source_sessions);
  // Author + contributors land on disk so the gate sees the same lineage
  // info it would for a locally-mined skill. Without this, the worker on
  // the puller's side can't tell that a `[global]` skill is authored by
  // someone else, and the cross-author MERGE auto-promote (issue #118)
  // silently degrades to "treat as same-author" — re-introducing the
  // ambiguous-lineage bug we built #118 to fix.
  const author = typeof row.author === "string" && row.author.length > 0
    ? row.author
    : undefined;
  const contributors = parseContributors(row.contributors);
  // Legacy rows have contributors=[]; render them as [author] on disk so
  // local consumers (gate, mergeSkill) see a consistent view.
  const renderedContributors = contributors.length > 0
    ? contributors
    : (author ? [author] : []);
  const fm: SkillFrontmatter = {
    name: nameOverride ?? String(row.name ?? ""),
    description: String(row.description ?? ""),
    trigger: typeof row.trigger_text === "string" && row.trigger_text.length > 0 ? String(row.trigger_text) : undefined,
    author,
    source_sessions: sources,
    contributors: renderedContributors,
    version: Number(row.version ?? 1),
    created_by_agent: String(row.source_agent ?? "unknown"),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
  const body = String(row.body ?? "").trim();
  return `${renderFrontmatter(fm)}\n\n${body}\n`;
}

function parseSourceSessions(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not JSON */ }
  }
  return [];
}

/** Same shape as parseSourceSessions but for the `contributors` column. */
function parseContributors(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not JSON, fall through */ }
  }
  return [];
}

function renderFrontmatter(fm: SkillFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${fm.name}`);
  // Fold the trigger into the host-visible description (see composeDescription).
  // Because pull re-renders from table columns on every sync, this also
  // retroactively fixes skills mined before the trigger lived in `description`.
  lines.push(`description: ${JSON.stringify(composeDescription(fm.description, fm.trigger))}`);
  if (fm.trigger) lines.push(`trigger: ${JSON.stringify(fm.trigger)}`);
  if (fm.author) lines.push(`author: ${fm.author}`);
  lines.push(`source_sessions:`);
  for (const s of fm.source_sessions) lines.push(`  - ${s}`);
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

/** Read the version field of an existing local SKILL.md, or null if missing/unparseable. */
export function readLocalVersion(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf-8");
    const parsed = parseFrontmatter(text);
    if (!parsed) return null;
    const v = parsed.fm.version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Decide what to do for a single remote skill row.
 * Pure function — tested directly without filesystem.
 */
export function decideAction(args: {
  remoteVersion: number;
  localVersion: number | null;
  force: boolean;
  dryRun: boolean;
}): "wrote" | "skipped" | "dryrun" {
  const shouldWrite =
    args.localVersion === null ||
    args.remoteVersion > args.localVersion ||
    args.force;
  if (!shouldWrite) return "skipped";
  return args.dryRun ? "dryrun" : "wrote";
}

/**
 * Main entry point. Queries the skills table, applies filters, decides
 * actions, and (unless dry-run) writes SKILL.md files to the destination.
 *
 * Cross-project layout: when two projects ship a skill with the same name
 * (e.g. both have `deploy`), they're written to disjoint subdirectories
 * under the install root: `<root>/<project_key>/<name>/SKILL.md`. This
 * matches the (project_key, name) uniqueness of the Deeplake table and
 * prevents cross-project overwrites.
 */
export async function runPull(opts: PullOptions): Promise<PullSummary> {
  // Sweep stale manifest entries before fetching: anything whose canonical
  // dir was rm-ed by hand has dangling fan-out symlinks that need to go,
  // and a phantom row would otherwise survive into this pull's manifest
  // upserts. Skip on dry-run — a dry-run must not mutate disk state.
  // No-op (zero writes) when nothing is stale.
  if (!opts.dryRun) pruneOrphanedEntries();

  const sql = buildPullSql({
    tableName: opts.tableName,
    users: opts.users,
    skillName: opts.skillName,
  });
  // Treat "table does not exist" as an empty result set — the table is
  // created lazily on first INSERT, so a fresh workspace has no skills yet.
  // On a missing-contributors error (legacy table that pre-dates #118 and
  // hasn't been lazy-migrated by an INSERT yet) retry once with the
  // legacy SELECT shape so the pull keeps working until the next write.
  let rows: Record<string, unknown>[] = [];
  if (opts.tableExists && !opts.tableExists(opts.tableName)) {
    // Known-absent from a trusted table list: skip the SELECT so a fresh
    // workspace doesn't log a 42P01 server-side. Leaves rows empty, the same
    // outcome as the isMissingTableError catch below, minus the round-trip
    // and the error.
    rows = [];
  } else {
    try {
      rows = await opts.query(sql);
    } catch (e: any) {
      if (isMissingTableError(e?.message)) {
        rows = [];
      } else if (isMissingContributorsColumnError(e?.message)) {
        const legacySql = buildPullSql({
          tableName: opts.tableName,
          users: opts.users,
          skillName: opts.skillName,
          includeContributors: false,
        });
        rows = await opts.query(legacySql);
      } else {
        throw e;
      }
    }
  }
  const latest = selectLatestPerName(rows);

  const root = resolvePullDestination(opts.install, opts.cwd);
  const summary: PullSummary = { scanned: latest.length, wrote: 0, skipped: 0, dryrun: 0, entries: [] };

  // Maps a resolved `<cappedName>--<author>` destination to the raw row name
  // that claimed it first. Capping is a lossy hash, so two distinct over-long
  // names could resolve to the same destination; the first wins and later
  // colliders are skipped (their rows stay in Deeplake, re-pullable) rather
  // than silently overwriting each other on disk.
  const claimedDirs = new Map<string, string>();

  for (const row of latest) {
    const rawName = String(row.name ?? "");
    if (!rawName) continue;
    const author = String(row.author ?? "");
    // Pulled skills land at `<root>/<name>--<author>/SKILL.md` so:
    //   1. Claude Code's skill loader (single-depth scan) sees them directly
    //   2. Cross-author name collisions stay disjoint on disk
    //   3. The directory name self-documents authorship at a glance
    // Locally-mined skills stay at `<root>/<name>/` (flat, no suffix), so
    // a self-mined `deploy` and a pulled `deploy--alice` coexist.
    // Same-author / same-name across two projects is the one regression vs
    // the legacy `<projectKey>/<name>/` layout: the more recently pulled
    // row clobbers the earlier one (with `.bak` of the prior SKILL.md).
    // Acceptable trade-off — the row stays in Deeplake and is recoverable
    // via re-pull from the project that authored it.
    //
    // Empty `author` would degrade the path to `<root>/<name>/` (the
    // locally-mined slot) and silently clobber the user's own skill of
    // the same name, breaking the coexistence guarantee above. Skip the
    // row instead — Deeplake should always populate `author`, and
    // ignoring an empty one is safer than guessing a placeholder.
    if (!author) {
      summary.entries.push({
        name: rawName, remoteVersion: Number(row.version ?? 1), localVersion: null,
        action: "skipped", destination: "(empty author — skipped)",
        author: "", sourceAgent: String(row.source_agent ?? ""),
      });
      summary.skipped++;
      continue;
    }
    // Author is part of the directory name, so validate it before it feeds
    // either the `--author` suffix or the name-cap budget below.
    try { assertValidAuthor(author); }
    catch (e: any) {
      summary.entries.push({
        name: rawName, remoteVersion: Number(row.version ?? 1), localVersion: null,
        action: "skipped", destination: `(invalid author '${author}' — skipped)`,
        author, sourceAgent: String(row.source_agent ?? ""),
      });
      summary.skipped++;
      continue;
    }
    // Validate the RAW name's characters/path BEFORE truncating its length.
    // A malicious row could pass a >64 name whose first 64 chars form a valid
    // slug but whose tail carries traversal syntax or invalid chars; capping
    // first would silently drop that tail and admit the row. assertValidSkillName
    // is a path-safety validator with a generous 100-char ceiling, so a legacy
    // 65–100 char name still passes here and is length-capped just below.
    try { assertValidSkillName(rawName); }
    catch (e: any) {
      summary.entries.push({
        name: rawName, remoteVersion: Number(row.version ?? 1), localVersion: null,
        action: "skipped", destination: "(invalid name — skipped)",
        author, sourceAgent: String(row.source_agent ?? ""),
      });
      summary.skipped++;
      continue;
    }
    // Cap the (now char-validated) name to the skill-loader's 64-char frontmatter
    // ceiling. Older rows were minted before generation-time capping and can
    // exceed it; codex silently drops those on load, so truncating here lets them
    // install cleanly. The capped name drives BOTH the frontmatter `name` and the
    // `<name>--<author>` directory base so the two stay consistent.
    const name = capSkillName(rawName);
    const dirName = `${name}--${author}`;

    // Two distinct over-long names can cap to the same destination (capping is
    // a lossy hash). Detect collisions both within this run (claimedDirs) AND
    // across runs: the manifest persists the raw claimant of an existing capped
    // install, so a later filtered pull (e.g. `--skill`) of a different raw name
    // that caps to the same identity is caught. The first raw name to claim a
    // destination wins; skip any later collider — even under --force — so we
    // never silently overwrite one skill's file with another's.
    // Fall back to the entry's `name` for legacy rows recorded before `rawName`
    // existed: `name` is that install's stable identity, so a colliding new row
    // is still detected. For a same-skill re-pull the persisted identity equals
    // this row's own name/rawName, so no false collision fires.
    const persistedEntry = entriesForRoot(loadManifest(), opts.install, root)
      .find(e => e.dirName === dirName);
    const owner = claimedDirs.get(dirName) ?? persistedEntry?.rawName ?? persistedEntry?.name;
    if (owner !== undefined && owner !== rawName) {
      summary.entries.push({
        name: rawName, remoteVersion: Number(row.version ?? 1), localVersion: null,
        action: "skipped", destination: `(name collision with '${owner}' — skipped)`,
        author, sourceAgent: String(row.source_agent ?? ""),
      });
      summary.skipped++;
      continue;
    }
    claimedDirs.set(dirName, rawName);

    const skillDir = join(root, dirName);
    const skillFile = join(skillDir, "SKILL.md");

    // A prior (pre-cap) pull of this same row installed it at the un-capped
    // `<rawName>--<author>` dir with an invalid (>64) frontmatter name. Decide
    // on the CAPPED dir's OWN state (not the stale one's) so a fresh capped
    // install fires even when the remote version is unchanged — the whole point
    // is to fix that existing broken install, which is normally at an equal
    // version. Below we either migrate the stale copy's content or install the
    // remote row, then retire the stale dir.
    const staleDir = name !== rawName ? `${rawName}--${author}` : null;
    // Only treat a stale dir as ours to migrate/retire when the manifest says
    // WE pulled it. An unmanaged `<rawName>--<author>` dir the user happens to
    // own is left untouched, and its content is never copied into the capped
    // destination — the remote row installs there as usual.
    const staleOwned = !!staleDir && staleDir !== dirName
      && entriesForRoot(loadManifest(), opts.install, root).some(e => e.dirName === staleDir);
    const staleFile = staleOwned ? join(root, staleDir!, "SKILL.md") : null;
    const staleVersion = staleFile && existsSync(staleFile) ? readLocalVersion(staleFile) : null;

    const remoteVersion = Number(row.version ?? 1);
    const localVersion = readLocalVersion(skillFile);
    const action = decideAction({
      remoteVersion, localVersion,
      force: opts.force ?? false,
      dryRun: opts.dryRun ?? false,
    });

    let manifestError: string | undefined;
    if (action === "wrote") {
      mkdirSync(skillDir, { recursive: true });
      // Backup any existing capped file before overwriting.
      if (existsSync(skillFile)) {
        try { renameSync(skillFile, `${skillFile}.bak`); } catch { /* best effort */ }
      }
      // Preserve the stale copy's content whenever it is NOT older than the
      // remote row (equal version = possible un-versioned local edits) and
      // we're not forcing: migrate it — with the invalid frontmatter name
      // rewritten to the capped one — instead of overwriting from remote.
      // Only an older stale copy (or --force) is replaced by the remote row.
      if (staleFile && staleVersion !== null && staleVersion >= remoteVersion && !(opts.force ?? false)) {
        // Read defensively: if the stale file vanished since its version was
        // read (a benign FS race), fall back to installing the remote row
        // rather than throwing out of the pull.
        try {
          const migrated = readFileSync(staleFile, "utf-8").replace(/^name:.*$/m, `name: ${name}`);
          writeFileSync(skillFile, migrated);
        } catch {
          writeFileSync(skillFile, renderSkillFile(row, name));
        }
      } else {
        writeFileSync(skillFile, renderSkillFile(row, name));
      }
      // Fan out symlinks into every detected non-Claude agent skills
      // root, but only for global pulls. Project-local pulls live under
      // <cwd>/.claude/skills and shouldn't leak into user-global agent
      // dirs — that would defeat the project-scoping intent.
      const symlinks = opts.install === "global"
        ? fanOutSymlinks(skillDir, dirName, detectAgentSkillsRoots(root))
        : [];
      // Record in manifest so `unpull` can identify this entry as
      // pull-managed without relying on the `--<author>` dirname heuristic
      // and so the symlinks created above can be reversed by a single
      // manifest-driven unlink pass.
      try {
        recordPull({
          dirName,
          name,
          rawName,
          author,
          projectKey: String(row.project_key ?? ""),
          remoteVersion,
          install: opts.install,
          installRoot: root,
          pulledAt: new Date().toISOString(),
          symlinks,
        });
      } catch (e: any) {
        // Skill is on disk but the manifest didn't record it — surface
        // this in the entry so the dispatcher can warn. `unpull` will
        // not be able to clean this entry via the manifest path until
        // a successful re-pull populates it.
        manifestError = e?.message ?? String(e);
      }
    }

    // Retire the stale un-capped dir once a valid capped install is in place —
    // whether we wrote it this run or a previous run did. Running independently
    // of `action` means a cleanup that failed earlier (transient rmSync error →
    // a later "skipped" pull) is retried instead of leaving the invalid dir
    // forever. ONLY a dir we manage (present in the manifest) is removed — a
    // user-created `<rawName>--<author>` dir is never touched. dry-run safe;
    // failures surface via manifestError rather than aborting the pull.
    if (staleDir && staleDir !== dirName && !(opts.dryRun ?? false)
        && existsSync(skillFile) && existsSync(join(root, staleDir))) {
      try {
        const entries = entriesForRoot(loadManifest(), opts.install, root);
        // Only retire the stale install once the CANONICAL capped install is
        // recorded in the manifest. If recordPull failed this run, the canonical
        // file is on disk but untracked — keep the stale entry so a later pull
        // retries the migration instead of orphaning the skill.
        let canonicalRecorded = entries.some(e => e.dirName === dirName);
        const staleEntry = entries.find(e => e.dirName === staleDir);
        // A prior run wrote the capped file but its recordPull failed, so this
        // run saw the file at the remote version and chose "skipped" (no
        // recordPull). Adopt the untracked canonical now — otherwise
        // `canonicalRecorded` stays false forever and the stale dir is never
        // retired. Skip if recordPull just failed THIS run (`manifestError`
        // set) so we don't retry a still-broken manifest write.
        if (!canonicalRecorded && staleEntry && !manifestError) {
          try {
            const symlinks = opts.install === "global"
              ? fanOutSymlinks(skillDir, dirName, detectAgentSkillsRoots(root))
              : [];
            recordPull({
              dirName, name, rawName, author,
              projectKey: String(row.project_key ?? ""),
              remoteVersion, install: opts.install, installRoot: root,
              pulledAt: new Date().toISOString(), symlinks,
            });
            canonicalRecorded = true;
          } catch (e: any) {
            manifestError = manifestError ?? (e?.message ?? String(e));
          }
        }
        if (canonicalRecorded && staleEntry) {
          // Remove the directory FIRST, then drop its manifest evidence. If
          // rmSync fails, the entry survives so the next pull retries cleanup;
          // dropping the entry first would orphan an un-removed invalid dir.
          rmSync(join(root, staleDir), { recursive: true, force: true });
          unlinkSymlinks(staleEntry.symlinks);
          removePullEntry(opts.install, staleEntry.installRoot, staleDir);
        }
      } catch (e: any) {
        manifestError = manifestError ?? (e?.message ?? String(e));
      }
    }

    summary.entries.push({
      name,
      remoteVersion,
      localVersion,
      action,
      destination: skillFile,
      author: String(row.author ?? ""),
      sourceAgent: String(row.source_agent ?? ""),
      manifestError,
    });

    if (action === "wrote") summary.wrote++;
    else if (action === "dryrun") summary.dryrun++;
    else summary.skipped++;
  }

  // Backfill fan-out for skills that were already up-to-date this run.
  // Per-row fan-out only fires on `action === "wrote"`, so when a user
  // installs a NEW agent (codex / hermes / pi) AFTER having pulled, the
  // existing skills' canonical dirs are present but their symlinks in
  // the new agent root are missing — and they'd stay missing forever
  // because the next pull just sees `localVersion >= remoteVersion`
  // and skips. The backfill closes this gap idempotently.
  // Skip on dry-run (no disk mutations) and on project installs (no
  // fan-out for them by design).
  if (!opts.dryRun && opts.install === "global") {
    backfillSymlinks(root);
  }

  return summary;
}
