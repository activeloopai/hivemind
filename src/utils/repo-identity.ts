/**
 * Stable per-repo identity helpers.
 *
 * Used by skillify (per-project state directory) and the upcoming codebase-graph
 * feature (per-repo storage path + Deeplake row key). Lives in src/utils so
 * both consumers can import without cross-feature coupling.
 *
 * The original implementation lived in src/skillify/state.ts; it was moved
 * here unchanged when the graph module needed the same identity. state.ts
 * re-exports for backward compatibility.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { realpathSync } from "node:fs";

/**
 * Default port per scheme. If the URL carries `:<defaultPort>` explicitly,
 * we strip it so `https://host:443/x` collapses with `https://host/x`
 * (otherwise the two hash to different project keys despite being the same
 * remote). Non-default ports (e.g. `:8443`) are preserved — they're
 * load-bearing.
 */
const DEFAULT_PORTS: Record<string, string> = {
  http: "80",
  https: "443",
  ssh: "22",
  git: "9418",
};

/**
 * Collapse the many surface forms of a git remote URL down to a canonical
 * string so different clone styles of the SAME repo produce the same hash.
 *
 * Without this, sha1 raw input gives 5 different keys for the same repo:
 *   git@github.com:org/repo.git
 *   git@github.com:org/repo
 *   https://github.com/org/repo.git
 *   https://github.com/org/repo
 *   https://user@github.com/org/repo.git
 *
 * All collapse to `github.com/org/repo`. Returns the input unchanged when
 * it doesn't look like a git URL (so the cwd-fallback path keeps absolute
 * disk paths distinct).
 */
export function normalizeGitRemoteUrl(url: string): string {
  let s = url.trim();
  // 1. Capture + strip URL scheme (https://, http://, git://, ssh://, …).
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (schemeMatch) s = s.slice(schemeMatch[0].length);
  // 2. SCP-style remote (no scheme prefix): `[user@]host:path` → `host/path`.
  //    Only applies when the original input had no scheme — otherwise the
  //    `:` is from `host:port`, not the SCP separator.
  if (!scheme) {
    const scp = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scp) s = `${scp[1]}/${scp[2]}`;
  }
  // 3. Strip embedded credentials (user@ or user:pass@) from the host part.
  s = s.replace(/^[^@/]+@/, "");
  // 4. Strip the default port for the scheme (e.g. `:443` on https) — it
  //    is implied and shouldn't make the hash diverge from the port-less
  //    form. Non-default ports stay (e.g. `:8443`).
  if (scheme && DEFAULT_PORTS[scheme]) {
    s = s.replace(new RegExp(`^([^/]+):${DEFAULT_PORTS[scheme]}(/|$)`), "$1$2");
  }
  // 5. Drop trailing `.git` (with or without trailing slash) and any
  //    remaining trailing slash.
  s = s.replace(/\.git\/?$/i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

/**
 * Stable project identifier — git remote URL hash, fallback to absolute-cwd hash.
 *
 * cwd is resolved to absolute up-front so the fallback key (used when there's
 * no git remote) is stable regardless of caller location. Without this, the
 * same directory addressed as `.`, `./foo`, or its absolute path would hash
 * to three different keys — and the `--cwd <relative>` CLI argument would
 * become caller-position-dependent. The git-remote branch is unaffected
 * (already location-independent: the remote URL is the same wherever you run
 * `git config` from inside the repo). CodeRabbit P1 fix.
 */
export function deriveProjectKey(cwd: string): { key: string; project: string } {
  const absCwd = canonicalPath(cwd);
  const project = basename(absCwd) || "unknown";
  let signature: string | null = null;
  try {
    const raw = execSync("git config --get remote.origin.url", {
      cwd: absCwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    signature = raw ? normalizeGitRemoteUrl(raw) : null;
  } catch {
    // not a git repo, or no origin
  }
  // Hash whichever signature we have; falls back to absolute cwd so two
  // different checkouts with no remote still get distinct keys.
  const input = signature ?? absCwd;
  const key = createHash("sha1").update(input).digest("hex").slice(0, 16);
  return { key, project };
}

export function canonicalPath(path: string): string {
  const resolvedPath = resolve(path);
  try { return realpathSync.native(resolvedPath); } catch { return resolvedPath; }
}
