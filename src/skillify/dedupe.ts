/**
 * Remove the duplicate copies of the user's OWN skills that older pulls
 * installed as `<name>--<me>` beside the locally-mined `<name>`.
 *
 * Before pull wrote own rows into the `<name>` slot, every own skill pulled
 * back from the org table landed as `<name>--<me>`. With a locally-mined
 * `<name>` (same machine, another repo, or a second machine) the user saw
 * two or more copies of one skill. Pull now keeps one dir per own skill;
 * this command repairs installs made before that.
 *
 * Only pull-managed entries (in `pulled.json`) are candidates. Per entry:
 *   - a local `<name>` at the same or a higher version exists → remove the copy
 *   - no local `<name>` in the install root → move the copy into the `<name>` slot
 *   - the install root's `<name>` is older → replace its SKILL.md (old one kept
 *     as SKILL.md.bak), then remove the copy
 *   - only an older project `<name>` exists → keep the copy (project files are
 *     the repo's; the user decides)
 */

import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, recordPull, removePullEntry, unlinkSymlinks, type PulledEntry } from "./manifest.js";
import { detectAgentSkillsRoots } from "./agent-roots.js";
import { fanOutSymlinks, readLocalVersion, resolvePullDestination } from "./pull.js";

export interface DedupeOptions {
  myUsername: string;
  /** Project whose `.claude/skills/<name>` also counts as a local copy. */
  cwd: string;
  dryRun?: boolean;
}

export type DedupeAction = "removed" | "moved" | "replaced" | "kept" | "failed";

export interface DedupeEntry {
  dirName: string;
  name: string;
  path: string;
  action: DedupeAction;
  dryRun: boolean;
  reason: string;
}

function isOwnCopy(e: PulledEntry, me: string): boolean {
  return e.author === me && e.dirName !== e.name && e.dirName.endsWith(`--${me}`);
}

function removeCopy(e: PulledEntry): void {
  rmSync(join(e.installRoot, e.dirName), { recursive: true, force: true });
  unlinkSymlinks(e.symlinks);
  removePullEntry(e.install, e.installRoot, e.dirName);
}

function moveCopy(e: PulledEntry): void {
  const slot = join(e.installRoot, e.name);
  renameSync(join(e.installRoot, e.dirName), slot);
  unlinkSymlinks(e.symlinks);
  removePullEntry(e.install, e.installRoot, e.dirName);
  const symlinks = e.install === "global" ? fanOutSymlinks(slot, e.name, detectAgentSkillsRoots(e.installRoot)) : [];
  recordPull({ ...e, dirName: e.name, symlinks });
}

function replaceSlot(e: PulledEntry): void {
  const slotFile = join(e.installRoot, e.name, "SKILL.md");
  copyFileSync(slotFile, `${slotFile}.bak`);
  copyFileSync(join(e.installRoot, e.dirName, "SKILL.md"), slotFile);
  removeCopy(e);
}

function decide(e: PulledEntry, cwd: string): { action: DedupeAction; reason: string } {
  const copyVersion = readLocalVersion(join(e.installRoot, e.dirName, "SKILL.md")) ?? e.remoteVersion;
  const slotVersion = readLocalVersion(join(e.installRoot, e.name, "SKILL.md"));
  const projectVersion = e.install === "global"
    ? readLocalVersion(join(resolvePullDestination("project", cwd), e.name, "SKILL.md"))
    : null;
  const localMax = Math.max(slotVersion ?? -1, projectVersion ?? -1);
  if (localMax >= copyVersion) {
    return { action: "removed", reason: `local ${e.name} v${localMax} >= copy v${copyVersion}` };
  }
  const slotExists = existsSync(join(e.installRoot, e.name));
  if (slotExists && slotVersion === null) {
    return { action: "kept", reason: `${e.name} exists without a version; resolve by hand` };
  }
  if (!slotExists && projectVersion === null) {
    return { action: "moved", reason: `no local ${e.name}; copy v${copyVersion} becomes ${e.name}` };
  }
  if (slotVersion !== null) {
    return { action: "replaced", reason: `local ${e.name} v${slotVersion} < copy v${copyVersion}` };
  }
  return { action: "kept", reason: `project ${e.name} v${projectVersion} < copy v${copyVersion}; update the project copy by hand` };
}

const APPLY: Record<Exclude<DedupeAction, "kept" | "failed">, (e: PulledEntry) => void> = {
  removed: removeCopy,
  moved: moveCopy,
  replaced: replaceSlot,
};

function apply(
  e: PulledEntry,
  decision: { action: DedupeAction; reason: string },
  dryRun: boolean,
): { action: DedupeAction; reason: string } {
  if (dryRun || decision.action === "kept" || decision.action === "failed") return decision;
  try {
    APPLY[decision.action](e);
    return decision;
  } catch (err: any) {
    return { action: "failed", reason: `${decision.action}: ${err?.message ?? err}` };
  }
}

export function runDedupe(opts: DedupeOptions): DedupeEntry[] {
  const dryRun = opts.dryRun ?? false;
  const out: DedupeEntry[] = [];
  for (const e of loadManifest().entries) {
    if (!isOwnCopy(e, opts.myUsername)) continue;
    const path = join(e.installRoot, e.dirName);
    if (!existsSync(path)) continue;
    const decision = decide(e, opts.cwd);
    out.push({ dirName: e.dirName, name: e.name, path, dryRun, ...apply(e, decision, dryRun) });
  }
  return out;
}
