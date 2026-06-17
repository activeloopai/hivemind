import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import type { SkillSyncResult, SkillSyncState } from "../types/health";

function canonicalSkillsRoot(): string {
  return join(homedir(), ".claude", "skills");
}

function agentRoots(projectRoot?: string): string[] {
  // Mirrors src/skillify/agent-roots.ts detectAgentSkillsRoots().
  const home = homedir();
  const canonicalRoot = canonicalSkillsRoot();
  const out: string[] = [];
  const codexInstalled = existsSync(join(home, ".codex"));
  const piInstalled = existsSync(join(home, ".pi", "agent"));
  const hermesInstalled = existsSync(join(home, ".hermes"));
  const cursorInstalled = existsSync(join(home, ".cursor"));

  if (codexInstalled || piInstalled) out.push(join(home, ".agents", "skills"));
  if (hermesInstalled) out.push(join(home, ".hermes", "skills"));
  if (piInstalled) out.push(join(home, ".pi", "agent", "skills"));
  if (cursorInstalled) {
    out.push(join(home, ".cursor", "skills-cursor"));
    if (projectRoot) out.push(join(projectRoot, ".cursor", "skills"));
  }
  return out.filter((p) => p !== canonicalRoot);
}

function fanOutSymlinks(canonicalDir: string, dirName: string, agentRootsList: string[]): string[] {
  const out: string[] = [];
  for (const root of agentRootsList) {
    const link = join(root, dirName);
    let existing;
    try {
      existing = lstatSync(link);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isSymbolicLink()) continue;
      let current: string | null;
      try {
        current = readlinkSync(link);
      } catch {
        current = null;
      }
      if (current === canonicalDir) {
        out.push(link);
        continue;
      }
      try {
        unlinkSync(link);
      } catch {
        continue;
      }
    }
    try {
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(canonicalDir, link, "dir");
      out.push(link);
    } catch {
      /* best-effort */
    }
  }
  return out;
}

function fanOutWithConflicts(canonicalDir: string, dirName: string, roots: string[]): { links: string[]; conflicts: string[] } {
  const links = fanOutSymlinks(canonicalDir, dirName, roots);
  const conflicts: string[] = [];
  for (const root of roots) {
    const link = join(root, dirName);
    if (links.includes(link)) continue;
    try {
      const st = lstatSync(link);
      if (!st.isSymbolicLink()) conflicts.push(link);
    } catch {
      /* permission or missing — not a user-file conflict */
    }
  }
  return { links, conflicts };
}

function listPulledSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot).filter((name) => {
    if (!name.includes("--")) return false;
    try {
      return lstatSync(join(skillsRoot, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

function listMinedSkillNames(projectRoot?: string): string[] {
  const stateDir = join(homedir(), ".deeplake", "state", "skillify");
  const names = new Set<string>();
  if (existsSync(stateDir)) {
    for (const file of readdirSync(stateDir)) {
      if (!file.endsWith(".json") || file === "config.json" || file === "pulled.json") continue;
      try {
        const state = JSON.parse(readFileSync(join(stateDir, file), "utf-8")) as {
          skillsGenerated?: string[];
          project?: string;
        };
        if (projectRoot && state.project) {
          const base = basename(projectRoot);
          if (state.project !== base && !projectRoot.includes(state.project)) continue;
        }
        for (const n of state.skillsGenerated ?? []) {
          if (typeof n === "string" && n.length > 0) names.add(n);
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (projectRoot) {
    const projectSkills = join(projectRoot, ".claude", "skills");
    if (existsSync(projectSkills)) {
      for (const name of readdirSync(projectSkills)) {
        if (name.includes("--")) continue;
        if (existsSync(join(projectSkills, name, "SKILL.md"))) names.add(name);
      }
    }
  }
  return [...names].sort();
}

function readSkillShareScope(skillPath: string): "me" | "team" | "unknown" {
  try {
    const text = readFileSync(join(skillPath, "SKILL.md"), "utf-8");
    const m = text.match(/^scope:\s*(me|team)\s*$/m);
    if (m) return m[1] as "me" | "team";
  } catch {
    /* ignore */
  }
  return "unknown";
}

function parseDirName(dirName: string): { name: string; author: string } {
  const idx = dirName.lastIndexOf("--");
  if (idx <= 0) return { name: dirName, author: "" };
  return { name: dirName.slice(0, idx), author: dirName.slice(idx + 2) };
}

interface PulledEntry {
  dirName: string;
  name: string;
  author: string;
  install: "global" | "project";
  installRoot: string;
  symlinks: string[];
}

interface PulledManifest {
  version: 1;
  entries: PulledEntry[];
}

function manifestPath(): string {
  return join(homedir(), ".deeplake", "state", "skillify", "pulled.json");
}

function loadManifest(): PulledManifest {
  const path = manifestPath();
  if (!existsSync(path)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as PulledManifest;
    if (parsed.version === 1 && Array.isArray(parsed.entries)) return parsed;
  } catch {
    /* ignore */
  }
  return { version: 1, entries: [] };
}

function writeManifest(manifest: PulledManifest): void {
  const path = manifestPath();
  mkdirSync(dirname(path), { recursive: true });
  // Atomic write: serialize to a sibling temp file, then rename over the
  // target (atomic on the same filesystem). A crash mid-write or a concurrent
  // reader never observes a half-written manifest — which loadManifest would
  // silently reset to an empty manifest, dropping all recorded pull state.
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

function mergeSymlinksIntoManifest(
  install: "global" | "project",
  installRoot: string,
  dirName: string,
  freshLinks: string[],
): void {
  if (freshLinks.length === 0) return;
  const manifest = loadManifest();
  const existing = manifest.entries.find(
    (e) => e.install === install && e.installRoot === installRoot && e.dirName === dirName,
  );
  const parsed = parseDirName(dirName);
  const symlinks = [...new Set([...(existing?.symlinks ?? []), ...freshLinks])].sort();
  const next = {
    dirName,
    name: existing?.name ?? parsed.name,
    author: existing?.author ?? parsed.author,
    install,
    installRoot,
    symlinks,
  };
  const idx = manifest.entries.findIndex(
    (e) => e.install === install && e.installRoot === installRoot && e.dirName === dirName,
  );
  if (idx >= 0) manifest.entries[idx] = { ...manifest.entries[idx]!, ...next };
  else manifest.entries.push(next);
  writeManifest(manifest);
}

/** Sync canonical pulled skills into agent skill directories (incl. Cursor). */
export function syncSkillsToCursor(projectRoot?: string): SkillSyncState {
  const skillsRoot = canonicalSkillsRoot();
  const roots = agentRoots(projectRoot);
  const results: SkillSyncResult[] = [];
  const dirs = listPulledSkillDirs(skillsRoot);

  if (roots.length === 0) {
    return {
      lastSyncAt: new Date().toISOString(),
      results: dirs.map((dirName) => ({
        skillName: dirName,
        status: "skipped",
        reason: "No agent skill roots detected",
      })),
      syncedCount: 0,
      skippedCount: dirs.length,
      erroredCount: 0,
    };
  }

  let synced = 0;
  let skipped = 0;
  let errored = 0;

  for (const dirName of dirs) {
    const canonicalDir = join(skillsRoot, dirName);
    const { links, conflicts } = fanOutWithConflicts(canonicalDir, dirName, roots);
    if (links.length === 0) {
      errored++;
      results.push({
        skillName: dirName,
        status: "errored",
        reason: conflicts.length > 0
          ? `Blocked by existing file at ${conflicts[0]}`
          : "Could not create symlinks (permission or filesystem error)",
      });
      continue;
    }
    if (links.length < roots.length || conflicts.length > 0) {
      errored++;
      const conflictNote = conflicts.length > 0 ? `; conflict at ${conflicts.join(", ")}` : "";
      results.push({
        skillName: dirName,
        status: "errored",
        path: links.join(", "),
        reason: `Partial reach: ${links.length}/${roots.length} roots${conflictNote}`,
      });
    } else {
      synced++;
      results.push({
        skillName: dirName,
        status: "synced",
        path: links.join(", "),
      });
    }
    mergeSymlinksIntoManifest("global", skillsRoot, dirName, links);
  }

  return {
    lastSyncAt: new Date().toISOString(),
    results,
    syncedCount: synced,
    skippedCount: skipped,
    erroredCount: errored,
  };
}

/** Backfill agent symlinks for skills already recorded in the pull manifest. */
export function backfillCursorLinks(projectRoot?: string): number {
  const manifest = loadManifest();
  const roots = agentRoots(projectRoot);
  if (roots.length === 0) return 0;

  let updated = 0;
  for (const entry of manifest.entries) {
    const canonical = join(entry.installRoot, entry.dirName);
    if (!existsSync(canonical)) continue;
    const { links } = fanOutWithConflicts(canonical, entry.dirName, roots);
    if (links.length === 0) continue;
    mergeSymlinksIntoManifest(entry.install, entry.installRoot, entry.dirName, links);
    updated++;
  }
  return updated;
}

/** List locally mined skills for the promoter pane (not pulled --author dirs). */
export function listLocalSkillsForPromoter(): Array<{
  dirName: string;
  scope: "global" | "project";
  path: string;
  shareScope: "me" | "team" | "unknown";
}> {
  const out: Array<{ dirName: string; scope: "global" | "project"; path: string; shareScope: "me" | "team" | "unknown" }> = [];
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const globalRoot = canonicalSkillsRoot();

  const seen = new Set<string>();
  for (const name of listMinedSkillNames(workspace)) {
    const projectPath = workspace ? join(workspace, ".claude", "skills", name) : "";
    const globalPath = join(globalRoot, name);
    if (workspace && existsSync(join(projectPath, "SKILL.md"))) {
      out.push({
        dirName: name,
        scope: "project",
        path: projectPath,
        shareScope: readSkillShareScope(projectPath),
      });
      seen.add(name);
    } else if (existsSync(join(globalPath, "SKILL.md"))) {
      out.push({
        dirName: name,
        scope: "global",
        path: globalPath,
        shareScope: readSkillShareScope(globalPath),
      });
      seen.add(name);
    }
  }

  // Reconcile with what the settings "skills synced" count reports: pulled
  // skills (`<name>--<author>` dirs under the canonical root) are real,
  // installed skills too. Surfacing them here keeps the Skills tab from
  // claiming "no skills" while settings shows a non-zero synced count.
  for (const dirName of listPulledSkillDirs(globalRoot)) {
    if (seen.has(dirName)) continue;
    const pulledPath = join(globalRoot, dirName);
    if (!existsSync(join(pulledPath, "SKILL.md"))) continue;
    const declared = readSkillShareScope(pulledPath);
    out.push({
      dirName,
      scope: "global",
      path: pulledPath,
      shareScope: declared === "unknown" ? "team" : declared,
    });
    seen.add(dirName);
  }
  return out;
}

export function skillDirLabel(dirName: string): string {
  return dirName;
}

export function basenameSkill(dirName: string): string {
  return basename(dirName);
}
