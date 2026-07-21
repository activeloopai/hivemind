/**
 * Per-directory Hivemind config — an in-tree `.hivemind` file that overlays the
 * global identity (`~/.deeplake/credentials.json`) for sessions launched under
 * that directory. Two things it can do:
 *
 *   1. ROUTE — send this directory's captured traces to a specific
 *      org / workspace:
 *        { "orgId": "acme", "workspaceId": "clientA" }
 *   2. OPT OUT — never collect traces from this directory:
 *        { "collect": false }
 *
 * Two filenames are recognized at each level:
 *   - `.hivemind`        — meant to be COMMITTED (shared team routing, like
 *                          `.editorconfig`).
 *   - `.hivemind.local`  — meant to be GITIGNORED (a personal override /
 *                          opt-out, like `.env.local`). Wins over `.hivemind`
 *                          in the same directory.
 *
 * Discovery is nearest-wins: we walk UP from the session `cwd` and take the
 * first file found (like `.git`), so routing is unambiguous — NOT a
 * `.gitignore`-style merge across ancestors.
 *
 * The file NEVER carries a token — auth stays in `~/.deeplake/credentials.json`.
 * A routing override therefore only ever takes effect against orgs the user's
 * existing token already authorizes; the API rejects anything else. Where the
 * traces actually land is disclosed to the user in the session-start banner,
 * so a routing override is never silent.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig, type Config } from "./config.js";

/** Committed (shared) and local (personal, gitignored) filenames, local first. */
export const DIR_CONFIG_FILENAMES = [".hivemind.local", ".hivemind"] as const;

export interface DirConfigFile {
  orgId?: string;
  orgName?: string;
  workspaceId?: string;
  /** false → never capture traces from this directory. Default true. */
  collect?: boolean;
}

export interface FoundDirConfig {
  /** Absolute path to the file that applied. */
  path: string;
  raw: DirConfigFile;
}

/**
 * Walk up from `startDir` (to the filesystem root, or `stopAt` inclusive)
 * returning the nearest readable, parseable config. At each level a
 * `.hivemind.local` beats a `.hivemind`; nearer directories beat farther ones.
 */
export function findDirConfig(startDir: string, stopAt?: string): FoundDirConfig | null {
  let dir = resolve(startDir);
  const boundary = stopAt ? resolve(stopAt) : null;
  for (;;) {
    for (const name of DIR_CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      try {
        const raw = parseDirConfig(readFileSync(candidate, "utf-8"));
        if (raw) return { path: candidate, raw };
      } catch {
        // absent / unreadable — try the next name / level
      }
    }
    if (boundary && dir === boundary) break;
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

/** Parse a `.hivemind` JSON body, whitelisting known fields. Null on garbage. */
export function parseDirConfig(contents: string): DirConfigFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const out: DirConfigFile = {};
  if (typeof o.orgId === "string") out.orgId = o.orgId;
  if (typeof o.orgName === "string") out.orgName = o.orgName;
  if (typeof o.workspaceId === "string") out.workspaceId = o.workspaceId;
  if (typeof o.collect === "boolean") out.collect = o.collect;
  return out;
}

export interface ResolvedDirConfig {
  /** Config to capture with — org/workspace-overlaid when a `.hivemind` routes. */
  config: Config;
  /** false → caller must skip capture entirely for this cwd. */
  collect: boolean;
  /** The file that applied, if any (for the session-start banner / diagnostics). */
  found: FoundDirConfig | null;
}

/**
 * Overlay the nearest `.hivemind` onto `base` for a session in `cwd`.
 *
 * The two concerns are INDEPENDENT:
 *   - `orgId` / `workspaceId` are IDENTITY — they apply to reads (memory
 *     search, recall, the VFS) as well as capture. Omitted fields fall back to
 *     the global identity in `base`.
 *   - `collect` is the CAPTURE switch — writes only. It never suppresses the
 *     identity overlay, so `{ "collect": false, "workspaceId": "x" }` reads
 *     from `x` while writing nothing. (Reads are still authorized by the
 *     caller's existing token; the API rejects anything it doesn't grant.)
 *
 * Callers on the capture path must therefore gate on `collect`; callers on a
 * read path use `config` unconditionally.
 *
 * Precedence follows the conventional `env > config-file > stored-creds` order:
 * an explicitly-set `HIVEMIND_ORG_ID` / `HIVEMIND_WORKSPACE_ID` LOCKS that field
 * so a `.hivemind` routing value can't override it. (`base` already folded the
 * env var in via `loadConfig()`, so a locked field simply keeps `base`'s value.)
 * `collect: false` is unaffected by env — it's a fail-safe opt-out.
 *
 * Tests may inject the two lock vars via `envOverride`; in production the vars
 * are read as LITERAL `process.env.X` accesses (never an aliased `process.env`)
 * so the openclaw esbuild `define` stubs them to `undefined` and the ClawHub
 * env-harvesting scan stays clean — see the note in src/config.ts.
 */
export function resolveDirConfig(
  base: Config,
  cwd: string,
  envOverride?: { HIVEMIND_ORG_ID?: string; HIVEMIND_WORKSPACE_ID?: string },
): ResolvedDirConfig {
  const found = findDirConfig(cwd);
  if (!found) return { config: base, collect: true, found: null };

  const orgLocked = !!(envOverride ? envOverride.HIVEMIND_ORG_ID : process.env.HIVEMIND_ORG_ID);
  const wsLocked = !!(envOverride ? envOverride.HIVEMIND_WORKSPACE_ID : process.env.HIVEMIND_WORKSPACE_ID);
  const config: Config = {
    ...base,
    orgId: orgLocked ? base.orgId : (found.raw.orgId ?? base.orgId),
    orgName: orgLocked ? base.orgName : (found.raw.orgName ?? found.raw.orgId ?? base.orgName),
    workspaceId: wsLocked ? base.workspaceId : (found.raw.workspaceId ?? base.workspaceId),
  };
  return { config, collect: found.raw.collect !== false, found };
}

/**
 * THE single entry point for a workspace-scoped Config.
 *
 * Any code path that builds a `DeeplakeApi` against per-directory workspace data
 * — CLI commands (goals, rules, skills), memory read/write hooks, recall — MUST
 * get its config from here, never from a bare `loadConfig()`. It folds the
 * nearest `.hivemind` (and the `HIVEMIND_*` env locks, via resolveDirConfig)
 * into one place, so routing can never again be half-wired across call sites.
 *
 * Drop-in for `loadConfig()`: same `Config | null` shape, `cwd` defaults to the
 * process cwd (correct for every CLI command). Hooks that carry an explicit
 * session cwd pass it in. `collect` is intentionally NOT surfaced here — it
 * gates capture only; callers on the capture path use `resolveDirConfig`
 * directly so they can honor the opt-out.
 *
 * The guard in tests/shared/dir-config-single-source.test.ts enforces that
 * workspace-touching modules call this and not `loadConfig()`.
 */
export function loadRoutedConfig(cwd: string = process.cwd()): Config | null {
  const base = loadConfig();
  if (!base) return null;
  return resolveDirConfig(base, cwd).config;
}
