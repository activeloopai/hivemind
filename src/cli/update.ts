/**
 * `hivemind update` — manual upgrade flow.
 *
 * Single source of truth for upgrades is the npm package
 * `@deeplake/hivemind`. Per-agent autoupdate paths (Claude marketplace,
 * Codex git-clone) are legacy: they remain in src/hooks/* until the next
 * major, but new behavior centralizes here.
 *
 * Three-step flow when a newer version is on npm:
 *   1. Upgrade the CLI itself  (`npm install -g @deeplake/hivemind@latest`)
 *   2. Re-exec the just-installed binary to refresh agent bundles
 *      (so we use the NEW pkgRoot()/bundle paths, not stale in-memory ones)
 *   3. Print a summary
 *
 * The re-exec matters: after `npm install -g @latest` rewrites the install
 * directory, our running process still holds in-memory references to old
 * files. Calling runSingleInstall() in this process would either copy old
 * bundles or hit ENOENT for files that were unlinked-and-replaced. Spawning
 * the new binary side-steps both.
 */

import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getVersion } from "./version.js";
import { log, warn } from "./util.js";
import { isNewer } from "../utils/version-check.js";

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@deeplake/hivemind/latest";
const PKG_NAME = "@deeplake/hivemind";

/**
 * Default lock path: `~/.deeplake/hivemind-update.lock`. Matches the
 * existing convention (`src/notifications/queue.ts`,
 * `src/embeddings/protocol.ts`) of keeping per-user state under
 * `~/.deeplake/`.
 */
export function defaultLockPath(): string {
  return join(homedir(), ".deeplake", "hivemind-update.lock");
}

export type InstallKind =
  | "npm-global"   // npm install -g @deeplake/hivemind — owns its own prefix dir
  | "npx"          // ran via `npx @deeplake/hivemind` — cached in ~/.npm/_npx
  | "local-dev"    // git checkout / npm link — has a .git nearby
  | "unknown";     // can't tell — refuse to upgrade automatically

export interface DetectedInstall {
  kind: InstallKind;
  /** The directory of the installed package (resolved through symlinks). */
  installDir: string;
}

/**
 * Detect how the running CLI was installed by walking up from the
 * binary's real path.
 *
 * Heuristics, in priority order:
 *   1. Path contains `/_npx/` or `/.npx/` segment             → "npx"
 *   2. Path contains `node_modules/(@deeplake/)?hivemind`     → "npm-global"
 *   3. A `.git` directory is reachable within 6 levels of the
 *      install dir (only checked if #1 and #2 didn't fire)    → "local-dev"
 *   4. Otherwise                                              → "unknown"
 *
 * Path-pattern checks (#1, #2) come BEFORE the .git probe (#3) so an
 * npm-global install whose grandparent happens to be a git repo (dotfiles
 * tree, nvm-installed-via-git, CI checkouts where the home dir is part of
 * the workspace) doesn't get mis-flagged as `local-dev` and refused.
 * Without this ordering, users with a typical `git clone` install of nvm
 * had `~/.nvm/.git` reachable from `~/.nvm/.../node_modules/@deeplake/hivemind`
 * and `hivemind update` would refuse with "this is a dev checkout."
 */
export function detectInstallKind(argv1?: string): DetectedInstall {
  const realArgv1 = (() => {
    try { return realpathSync(argv1 ?? process.argv[1] ?? fileURLToPath(import.meta.url)); }
    catch { return argv1 ?? process.argv[1] ?? fileURLToPath(import.meta.url); }
  })();

  // Walk up looking for our package.json — gives us the install dir to
  // report and to use as the .git-search root.
  let dir = dirname(realArgv1);
  let installDir: string | null = null;
  for (let i = 0; i < 10; i++) {
    const pkgPath = `${dir}${sep}package.json`;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name === PKG_NAME || pkg.name === "hivemind") {
        installDir = dir;
        break;
      }
    } catch { /* not here, keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  installDir ??= dirname(realArgv1);

  // 1. npx-cached install (path-based — definitive).
  if (realArgv1.includes(`${sep}_npx${sep}`) || realArgv1.includes(`${sep}.npx${sep}`)) {
    return { kind: "npx", installDir };
  }

  // 2. node_modules layout (path-based — definitive). Catches both an npm
  // global prefix (`/usr/.../lib/node_modules/@deeplake/hivemind`) and a
  // project-local install (`<proj>/node_modules/@deeplake/hivemind`). Both
  // upgrade safely via `npm install -g @latest` from the user's POV.
  if (realArgv1.includes(`${sep}node_modules${sep}@deeplake${sep}hivemind`) ||
      realArgv1.includes(`${sep}node_modules${sep}hivemind`)) {
    return { kind: "npm-global", installDir };
  }

  // 3. .git-reachable fallback. Only reached when path-based checks above
  // didn't fire — i.e. install dir is NOT under any node_modules tree.
  // That's the strong signal for a true dev checkout (`npm link` from a
  // git clone, or `tsx src/cli/index.ts` straight from the repo).
  let gitDir = installDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(`${gitDir}${sep}.git`)) {
      return { kind: "local-dev", installDir };
    }
    const parent = dirname(gitDir);
    if (parent === gitDir) break;
    gitDir = parent;
  }

  return { kind: "unknown", installDir };
}

/**
 * Fetch the latest version from the npm registry. Returns null on any
 * failure — callers treat that as "skip update".
 *
 * Uses the npm registry directly (not GitHub raw) because npm is now the
 * canonical channel: a git tag without a corresponding npm publish is not
 * a release, so GitHub-raw can lie ahead of npm.
 */
export async function getLatestNpmVersion(timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(NPM_REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const meta = await res.json() as { version?: string };
    return meta.version ?? null;
  } catch {
    return null;
  }
}

export interface UpdateOptions {
  /** Skip the actual upgrade, just print what would happen. */
  dryRun?: boolean;
  /** Override the install-kind detection (tests). */
  installKindOverride?: DetectedInstall;
  /** Override the latest-version fetch (tests). */
  latestVersionOverride?: string | null;
  /** Override the running version (tests). */
  currentVersionOverride?: string;
  /** Inject the spawn impl (tests). Default: execSync with stdio inherit. */
  spawn?: (cmd: string, args: string[]) => void;
  /** Override the lockfile path (tests). Default: `~/.deeplake/hivemind-update.lock`. */
  lockPathOverride?: string;
}

const defaultSpawn = (cmd: string, args: string[]): void => {
  execFileSync(cmd, args, { stdio: "inherit" });
};

/**
 * Non-blocking O_EXCL pidfile lock around `npm install -g @deeplake/hivemind`.
 *
 * Why this exists: `SessionStart` hooks dispatch `hivemind update` detached
 * on every Claude Code session start (twice per session — from both
 * `session-start.ts` and `session-start-setup.ts`, by design). Multiple
 * sessions starting within the same second produced 2–N concurrent
 * `npm install -g @deeplake/hivemind@latest` invocations, which race in
 * npm's reify step: each one renames the existing install to the SAME
 * deterministic backup path (`.hivemind-<hash>`), all but one fail with
 * `ENOTEMPTY`, and the winner can still be SIGKILLed mid-extract — leaving
 * a partially-populated install on disk (node_modules/ present but
 * package.json / bundle/ missing → dangling bin symlink → `hivemind:
 * command not found`). Observed in production on 2026-05-19 with three
 * concurrent installs at 17:39:21 from cwd `~/al-projects/tests`.
 *
 * Semantics on contention: non-blocking. The autoupdate path is
 * fire-and-forget — late arrivals must exit 0 silently, not queue up and
 * eventually run a redundant install. The next session start will dispatch
 * again anyway (the cache was intentionally removed; see
 * src/hooks/shared/autoupdate.ts:37-54).
 *
 * Stale-lock reclaim: if the lockfile holds a PID that `process.kill(pid, 0)`
 * reports gone (ESRCH / not-a-process), the previous holder crashed and we
 * reclaim the lock atomically.
 *
 * Returns the open fd on success (caller must `releaseLock(fd, path)` on
 * every exit path), or `null` if a live holder owns it.
 */
function tryAcquireLock(path: string): number | null {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

  const claim = (): number => {
    const fd = openSync(path, "wx", 0o600);
    writeSync(fd, String(process.pid));
    return fd;
  };

  try {
    return claim();
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }

  // EEXIST: check if the holder is alive.
  let holderPid = 0;
  try {
    holderPid = Number(readFileSync(path, "utf-8").trim()) || 0;
  } catch {
    // Lockfile vanished between EEXIST and read — another caller is mid-
    // cleanup. Try once more to acquire; if that also fails, treat the
    // current state as "someone else owns it" and bail.
    try { return claim(); } catch { return null; }
  }

  if (holderPid > 0) {
    try {
      process.kill(holderPid, 0);
      // Holder is alive — refuse to proceed.
      log(`another hivemind update is already running (pid=${holderPid}); skipping.`);
      return null;
    } catch {
      // Holder is gone — fall through to stale-reclaim.
    }
  }

  // Stale lock: unlink + retry once. If retry races against another
  // reclaim, give up — they own it now.
  try { unlinkSync(path); } catch { /* best-effort */ }
  try {
    return claim();
  } catch {
    log(`another hivemind update is already running; skipping.`);
    return null;
  }
}

function releaseLock(fd: number, path: string): void {
  try { closeSync(fd); } catch { /* best-effort */ }
  try { unlinkSync(path); } catch { /* best-effort */ }
}

/**
 * Run the update flow. Returns the exit code the CLI should use.
 *
 * Exit codes:
 *   0 — already up to date OR upgrade succeeded OR dry-run
 *   1 — couldn't reach npm OR upgrade failed OR install kind unsupported
 */
export async function runUpdate(opts: UpdateOptions = {}): Promise<number> {
  const current = opts.currentVersionOverride ?? getVersion();
  const latest = opts.latestVersionOverride !== undefined
    ? opts.latestVersionOverride
    : await getLatestNpmVersion();

  if (!latest) {
    warn(`Could not reach npm registry to check for updates.`);
    warn(`Current version: ${current}`);
    return 1;
  }

  if (!isNewer(latest, current)) {
    log(`hivemind ${current} is up to date (npm latest: ${latest}).`);
    return 0;
  }

  log(`Update available: ${current} → ${latest}`);

  const detected = opts.installKindOverride ?? detectInstallKind();
  const spawn = opts.spawn ?? defaultSpawn;

  switch (detected.kind) {
    case "npm-global": {
      if (opts.dryRun) {
        log(`(dry-run) Would run: npm install -g ${PKG_NAME}@${latest}`);
        log(`(dry-run) Would re-run: hivemind install --skip-auth`);
        return 0;
      }

      // Serialize concurrent updaters. The autoupdate path can dispatch
      // 2–N `hivemind update` processes within the same second (per-session
      // double-fire × N concurrent sessions); without this lock they race
      // on npm's reify step and corrupt the install. See `tryAcquireLock`
      // for the full incident context.
      const lockPath = opts.lockPathOverride ?? defaultLockPath();
      const lockFd = tryAcquireLock(lockPath);
      if (lockFd === null) return 0;

      try {
        log(`Upgrading via npm…`);
        try {
          // Pin to the exact version fetched from the registry rather than
          // re-resolving `@latest` at install time — avoids a race where a
          // new (potentially malicious) publish lands between the version
          // check and the install.
          spawn("npm", ["install", "-g", `${PKG_NAME}@${latest}`]);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          warn(`npm install failed: ${msg}`);
          warn(`Try running it manually: npm install -g ${PKG_NAME}@${latest}`);
          return 1;
        }
        log(``);
        log(`Refreshing agent bundles…`);
        try {
          // Re-exec the NEW binary to use new pkgRoot()/bundle paths. The
          // user's $PATH is preserved through stdio: "inherit", so this
          // resolves to the freshly-installed `hivemind` regardless of how
          // npm laid it out.
          spawn("hivemind", ["install", "--skip-auth"]);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          warn(`Agent refresh failed: ${msg}`);
          warn(`Run manually: hivemind install`);
          return 1;
        }
        log(``);
        log(`Updated to ${latest}.`);
        return 0;
      } finally {
        releaseLock(lockFd, lockPath);
      }
    }

    case "npx": {
      if (opts.dryRun) {
        log(`(dry-run) Would print npx-pin instructions (no persistent install to upgrade).`);
        return 0;
      }
      log(`You ran hivemind via npx, which does not have a persistent global install.`);
      log(`To use the new version, re-run with the explicit version pin:`);
      log(``);
      log(`  npx ${PKG_NAME}@${latest} install`);
      log(``);
      log(`Or install globally so future updates are one command:`);
      log(``);
      log(`  npm install -g ${PKG_NAME}@${latest}`);
      return 0;
    }

    case "local-dev": {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: running from a local dev checkout (${detected.installDir}).`);
        return 0;
      }
      warn(`hivemind is running from a local development checkout (${detected.installDir}).`);
      warn(`Update via your dev workflow (git pull + npm install + npm run build),`);
      warn(`not via 'hivemind update'.`);
      return 1;
    }

    case "unknown":
    default: {
      if (opts.dryRun) {
        log(`(dry-run) Would refuse: install kind unknown (${detected.installDir}).`);
        return 0;
      }
      warn(`Could not determine how hivemind was installed (path: ${detected.installDir}).`);
      warn(`Update manually: npm install -g ${PKG_NAME}@${latest}`);
      return 1;
    }
  }
}
