/**
 * Per-repo auto-refresh registry — the ONLY switch for automatic doc sync.
 *
 * There is deliberately no env-var path: the user opts in per (org, project)
 * through the CLI (graph init's onboarding or `docs auto on`), the decision is
 * persisted here, and the post-commit trigger consults this file. Keying on
 * (orgId, projectKey) — NOT on the filesystem path — gives two properties for
 * free:
 *   - nested checkouts / worktrees / second clones of the same repo (same git
 *     origin → same project key) share ONE entry, so no duplicate spend;
 *   - switching org never leaks the setting: auto enabled on org A does not
 *     fire on org B (where the first cycle would otherwise silently generate
 *     a whole corpus in the wrong org's table).
 *
 * The stored `path` is display-only (updated to the last place the user
 * enabled from). Reads are hook-safe: a missing or corrupt file is an empty
 * registry, never a throw.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface AutoEntry {
  orgId: string;
  /** Display name of the org at enable time (best-effort). */
  orgName?: string;
  /** Repo project key (deriveProjectKey(cwd).key). */
  project: string;
  /** Display-only: where the user enabled from, last write wins. */
  path: string;
  auto: boolean;
  enabledAt: string;
}

export interface AutoRegistry {
  entries: AutoEntry[];
}

export function registryPath(): string {
  return process.env.HIVEMIND_DOCS_AUTO_FILE ?? join(homedir(), ".deeplake", "docs-auto.json");
}

/** Read the registry. Missing/corrupt file → empty (hooks must never crash). */
export function readAutoRegistry(file = registryPath()): AutoRegistry {
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Partial<AutoRegistry>;
    if (!Array.isArray(raw.entries)) return { entries: [] };
    const entries = raw.entries.filter(
      (e): e is AutoEntry =>
        !!e && typeof e === "object" &&
        typeof (e as AutoEntry).orgId === "string" &&
        typeof (e as AutoEntry).project === "string" &&
        typeof (e as AutoEntry).path === "string" &&
        typeof (e as AutoEntry).auto === "boolean",
    );
    return { entries };
  } catch {
    return { entries: [] };
  }
}

/** Atomic write (tmp + rename) so a crash never leaves a torn file. */
function writeAutoRegistry(reg: AutoRegistry, file = registryPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 1) + "\n");
  renameSync(tmp, file);
}

/** Is automatic doc sync enabled for (org, project)? Hook-safe, read-only. */
export function isAutoEnabled(orgId: string, project: string, file = registryPath()): boolean {
  return readAutoRegistry(file).entries.some(
    (e) => e.orgId === orgId && e.project === project && e.auto,
  );
}

export function findEntry(orgId: string, project: string, file = registryPath()): AutoEntry | undefined {
  return readAutoRegistry(file).entries.find((e) => e.orgId === orgId && e.project === project);
}

/**
 * Enable/disable auto sync for (org, project). Upserts: one entry per key,
 * path/orgName refreshed to the caller's context.
 */
export function setAuto(
  entry: { orgId: string; orgName?: string; project: string; path: string; auto: boolean },
  file = registryPath(),
  now: () => Date = () => new Date(),
): AutoEntry {
  const reg = readAutoRegistry(file);
  const existing = reg.entries.find((e) => e.orgId === entry.orgId && e.project === entry.project);
  const next: AutoEntry = {
    orgId: entry.orgId,
    orgName: entry.orgName ?? existing?.orgName,
    project: entry.project,
    path: entry.path,
    auto: entry.auto,
    enabledAt: entry.auto && !existing?.auto ? now().toISOString() : existing?.enabledAt ?? now().toISOString(),
  };
  reg.entries = [...reg.entries.filter((e) => !(e.orgId === entry.orgId && e.project === entry.project)), next];
  writeAutoRegistry(reg, file);
  return next;
}

export function listEntries(file = registryPath()): AutoEntry[] {
  return [...readAutoRegistry(file).entries].sort((a, b) => a.path.localeCompare(b.path));
}
