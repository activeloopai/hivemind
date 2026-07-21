/**
 * Local, remote-independent migration of legacy over-long skill installs.
 *
 * Why this exists (separate from the pull-loop migration in pull.ts):
 * PR #322 caps a skill's frontmatter `name` to the codex loader's 64-char
 * ceiling and migrates a prior un-capped install — but ONLY while processing
 * a MATCHING remote row during a pull. A legacy managed install whose
 * org/workspace isn't the currently-routed one never matches a remote row,
 * so it stays un-capped forever and every codex SessionStart logs
 * "invalid name: exceeds maximum length of 64 characters" for it.
 *
 * This pass fixes those installs WITHOUT touching the network: it scans the
 * pulled manifest (~/.deeplake/state/skillify/pulled.json), and for any GLOBAL
 * managed entry whose installed frontmatter `name` exceeds the loader ceiling
 * it copies the install to the canonical capped dir, caps the name there,
 * refreshes the fan-out symlinks, records the canonical manifest entry, and
 * ONLY THEN removes the stale dir + manifest row + its symlinks.
 *
 * Copy-then-swap (not rename-then-rewrite): the destructive removal of the
 * original is the LAST step, so a failure at any earlier point leaves the
 * original entry — dir, manifest row, and symlinks — fully intact and a later
 * run retries. At worst an already-capped copy is left behind, which the
 * same-rawName reconciliation on the retry collapses.
 *
 * Scope: only `install === "global"` entries are migrated. Project-scoped
 * installs belong to a specific project cwd and must not be mutated from an
 * unrelated SessionStart.
 *
 * Ownership is taken ONLY from the manifest — never inferred from directory
 * names — so an unmanaged `<rawName>--<author>` dir the user happens to own is
 * left untouched.
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertValidSkillName, capSkillName, MAX_SKILL_NAME_LEN, parseFrontmatter } from "./skill-writer.js";
import { assertValidAuthor } from "./pull.js";
import {
  entriesForRoot,
  loadManifest,
  recordPull,
  removePullEntry,
  unlinkSymlinks,
  type PulledEntry,
} from "./manifest.js";
import { fanOutSymlinks } from "./pull.js";
import { detectAgentSkillsRoots } from "./agent-roots.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("skillify-legacy-cap", msg);

/** How many managed entries were migrated / skipped in a single pass. */
export interface LegacyCapResult {
  migrated: number;
  skipped: number;
}

/**
 * Read the installed frontmatter `name` for a managed entry's SKILL.md.
 * Returns null when the file is missing/unparseable or the name isn't a
 * non-empty string — the caller then leaves that entry alone.
 */
function readInstalledName(skillFile: string): string | null {
  if (!existsSync(skillFile)) return null;
  let text: string;
  try { text = readFileSync(skillFile, "utf-8"); }
  catch { return null; }
  const parsed = parseFrontmatter(text);
  const name = parsed?.fm.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/**
 * Retire a legacy leftover: drop its fan-out symlinks, remove its on-disk dir,
 * and drop its manifest row. Used both to finish a copy-then-swap migration and
 * to reconcile a stale legacy dir whose canonical capped install already exists.
 */
function retireEntry(entry: PulledEntry): void {
  unlinkSymlinks(entry.symlinks);
  rmSync(join(entry.installRoot, entry.dirName), { recursive: true, force: true });
  removePullEntry(entry.install, entry.installRoot, entry.dirName);
}

/**
 * Migrate one managed entry whose installed frontmatter `name` exceeds the
 * loader ceiling to the canonical capped dir. Returns true on a successful
 * migration (or a same-rawName leftover reconciliation), false when it was
 * skipped (foreign collision, no-op, validation failure, or FS error) with
 * the original left untouched.
 *
 * Copy-then-swap ordering: the canonical capped dir is (a) COPIED from the
 * stale dir, (b) its frontmatter `name` capped, (c) recorded in the manifest,
 * (d) its symlinks fanned out, and ONLY THEN (e) is the stale dir + manifest
 * row + its symlinks removed. A failure before (e) leaves the original entry
 * fully intact — a later run retries and, finding the already-capped copy with
 * the SAME rawName, reconciles by retiring only the legacy leftover.
 */
function migrateEntry(entry: PulledEntry): boolean {
  // Scope to global installs only. Project-scoped installs belong to a specific
  // project cwd and must not be mutated from an unrelated SessionStart.
  if (entry.install !== "global") return false;

  const staleDir = join(entry.installRoot, entry.dirName);
  const staleFile = join(staleDir, "SKILL.md");
  const installedName = readInstalledName(staleFile);
  // Only over-long installed names need capping. A missing/valid name is a
  // no-op (idempotent second run).
  if (installedName === null || installedName.length <= MAX_SKILL_NAME_LEN) return false;

  // Path-safety validation BEFORE deriving any destination path. The capped
  // dir is built from mutable frontmatter (`installedName`) and `entry.author`;
  // both feed a directory name, so validate them with the same validators
  // pull.ts uses (pull.ts:547,563) before any fs op. A validation failure skips
  // the entry, leaving it untouched.
  let capped: string;
  try {
    // Validate the raw (pre-cap) name's characters/path first — a legacy 65–100
    // char name passes assertValidSkillName's 100-char path-safety ceiling.
    assertValidSkillName(installedName);
    capped = capSkillName(installedName);
    // The capped output must itself be a valid single-segment slug before it
    // becomes a directory name.
    assertValidSkillName(capped);
    assertValidAuthor(entry.author);
  } catch (e: any) {
    log(`skip ${entry.dirName}: invalid name/author (${e?.message ?? e})`);
    return false;
  }

  // capSkillName is idempotent; if the cap didn't change the name there's
  // nothing to move (shouldn't happen for a >64 name, but stay defensive).
  if (capped === installedName) return false;

  // Canonical dir base equals the capped name suffixed by the author, exactly
  // as pull.ts derives it (pull.ts:579). Preserve the raw pre-cap name so a
  // later cross-run cap-collision check can recognise this destination.
  const rawName = entry.rawName ?? entry.name;
  const cappedDir = `${capped}--${entry.author}`;
  const cappedDirPath = join(entry.installRoot, cappedDir);
  const cappedFile = join(cappedDirPath, "SKILL.md");

  // No-op if the entry is already at the canonical dir (idempotent).
  if (cappedDir === entry.dirName) return false;

  try {
    // Reconcile against any existing canonical entry at the capped
    // destination. Inside the try: reconciliation touches the manifest and the
    // filesystem, and a throw here must be swallowed per-entry like every
    // other failure — never escape into autoPullSkills.
    const managed = entriesForRoot(loadManifest(), entry.install, entry.installRoot);
    const collidingEntry = managed.find(
      e => e.dirName === cappedDir && e.dirName !== entry.dirName,
    );
    if (collidingEntry) {
      // SAME rawName → not a foreign collision: a previous migration (or pull)
      // already produced the canonical install and only this legacy leftover
      // remains.
      if ((collidingEntry.rawName ?? collidingEntry.name) === rawName) {
        // Guard against an INTERRUPTED prior migration: the canonical copy
        // exists but its frontmatter `name` was never rewritten (still
        // over-long), or the dir/SKILL.md is missing/unreadable entirely
        // (orphaned manifest row). Retiring the legacy in either state would
        // drop the only good copy — tear down the broken canonical dir + row
        // and fall through to re-migrate from the still-intact legacy. Only a
        // verified, properly-capped canonical retires the legacy.
        const canonName = readInstalledName(cappedFile);
        if (canonName === null || canonName.length > MAX_SKILL_NAME_LEN) {
          rmSync(cappedDirPath, { recursive: true, force: true });
          unlinkSymlinks(collidingEntry.symlinks);
          removePullEntry(collidingEntry.install, collidingEntry.installRoot, collidingEntry.dirName);
          log(`repair: dropped half-migrated ${cappedDir}, re-migrating from ${entry.dirName}`);
          // Fall through to the copy-then-swap below (cappedDirPath is now clear).
        } else {
          retireEntry(entry);
          log(`reconciled leftover ${entry.dirName} (canonical ${cappedDir} already present)`);
          return true;
        }
      } else {
        // DIFFERENT rawName → a true foreign collision. Leave the original
        // untouched so a later run can retry once the conflict clears.
        log(`skip ${entry.dirName}: capped dir ${cappedDir} claimed by ${collidingEntry.rawName ?? collidingEntry.name}`);
        return false;
      }
    }
    // A dir already sits at the capped destination but NO manifest entry
    // claims it (the manifest reconciliation above found none). We cannot
    // safely tell a user-owned capped skill apart from a crashed-migration
    // leftover by disk contents alone, so we skip and leave both untouched.
    // Recovery of an interrupted migration is manifest-driven instead: the
    // canonical entry is recorded BEFORE the destructive removal (see below),
    // so a failed run leaves a same-rawName manifest row that the
    // reconciliation above collapses on the retry.
    if (existsSync(cappedDirPath)) {
      log(`skip ${entry.dirName}: ${cappedDir} already exists on disk`);
      return false;
    }

    // (a) COPY the install to the canonical capped dir — the original is left
    // in place until the very last step, so any failure below is recoverable.
    cpSync(staleDir, cappedDirPath, { recursive: true });

    // (b) Record the canonical capped entry (rawName preserved) BEFORE any
    // further mutation. Recording first is what makes the retry recoverable:
    // if a later step throws, the same-rawName reconciliation above finds this
    // row on the next run and retires only the legacy leftover.
    recordPull({
      dirName: cappedDir,
      name: capped,
      rawName,
      author: entry.author,
      projectKey: entry.projectKey,
      remoteVersion: entry.remoteVersion,
      install: entry.install,
      installRoot: entry.installRoot,
      pulledAt: new Date().toISOString(),
      symlinks: [],
    });

    // (c) Rewrite the frontmatter `name` in the NEW dir — preserving the file
    // body and version (same replace pull.ts uses at pull.ts:651).
    const migrated = readFileSync(cappedFile, "utf-8").replace(/^name:.*$/m, `name: ${capped}`);
    writeFileSync(cappedFile, migrated);

    // (d) Refresh the fan-out symlinks for the new dir the same way pull/auto-
    // pull does, then persist the resolved set onto the canonical entry.
    const symlinks = fanOutSymlinks(cappedDirPath, cappedDir, detectAgentSkillsRoots(entry.installRoot));
    if (symlinks.length > 0) {
      recordPull({
        dirName: cappedDir,
        name: capped,
        rawName,
        author: entry.author,
        projectKey: entry.projectKey,
        remoteVersion: entry.remoteVersion,
        install: entry.install,
        installRoot: entry.installRoot,
        pulledAt: new Date().toISOString(),
        symlinks,
      });
    }

    // (e) Only now retire the stale entry: drop its symlinks, its on-disk dir,
    // and its manifest row.
    retireEntry(entry);
    log(`migrated ${entry.dirName} → ${cappedDir}`);
    return true;
  } catch (e: any) {
    // Any FS error before (e) leaves the ORIGINAL fully intact (dir + manifest
    // row + symlinks) — we never removed it. If (b) already landed, a capped
    // copy + a same-rawName canonical manifest row are left behind, which the
    // reconciliation above collapses on the retry.
    log(`error migrating ${entry.dirName} (swallowed): ${e?.message ?? e}`);
    return false;
  }
}

/**
 * Scan every manifest-managed entry and cap any whose installed frontmatter
 * `name` exceeds the loader ceiling. Remote-independent: runs offline and
 * regardless of which org/workspace is routed. All per-entry failures are
 * swallowed so a single broken install never aborts the pass.
 */
export function migrateLegacyCappedInstalls(): LegacyCapResult {
  let migrated = 0;
  let skipped = 0;
  // Snapshot the entries first: migrateEntry mutates the manifest, so iterate
  // over the pre-migration list rather than a live view.
  const entries = loadManifest().entries.slice();
  for (const entry of entries) {
    if (migrateEntry(entry)) migrated++;
    else skipped++;
  }
  if (migrated > 0) log(`migrated=${migrated} skipped=${skipped}`);
  return { migrated, skipped };
}
