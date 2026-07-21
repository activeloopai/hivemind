/**
 * Shared autoupdate helper for session-start hooks.
 *
 * One source of truth: the npm package `@deeplake/hivemind`.
 * One mechanism: the `hivemind update` CLI, the same command users run
 * manually. Session-start is just the *trigger*.
 *
 * Replaces the divergent legacy paths:
 *   - Claude Code:   `claude plugin update hivemind@hivemind --scope X`
 *                    against marketplace + GitHub raw `package.json`
 *   - Codex:         `git clone --branch v<latest>` + cp into ~/.codex/hivemind
 *                    against GitHub raw `package.json`
 *   - OpenClaw:      ClawHub registry version check + advice text
 *
 * Cursor / Hermes / pi previously had no autoupdate at all; they pick it
 * up for free here.
 *
 * ## Hot-path constraint: NEVER block session-start
 *
 * Real-world testing 2026-05-06 surfaced a destructive bug: an awaited
 * `hivemind update` spawn added 3-5s latency to every session start (the
 * spawned process always fetches the npm registry, ~500ms typical, up to
 * 3s+ on slow links). User flagged "destructive". Hard rule: no awaited
 * spawns, no awaited fetches, on the session-start hot path.
 *
 * Implementation: fire-and-forget detached spawn. The hook returns
 * immediately (sub-50ms). The spawned `hivemind update` process runs
 * fully detached (`child.unref()`) and survives the parent's exit. The
 * upgrade outcome is delivered on the NEXT session start, when
 * `getInstalledVersion()` reads the freshly-upgraded plugin.json.
 *
 * The lock that prevents concurrent `hivemind update` runs no longer
 * lives here (we'd release it instantly after dispatching, defeating
 * its purpose). Follow-up: move it into `src/cli/update.ts:runUpdate()`
 * so the long-running update process owns the lock for its lifetime.
 *
 * ## No cache (intentional, per review)
 *
 * Earlier drafts of this helper had a 4h "last-checked" cache to avoid
 * firing the spawn on every session-start. Reviewer feedback (efenocchi,
 * 2026-05-07): in the worst case "we publish a new release at 13:01,
 * users who started a session at 13:00 don't pick it up until 17:00."
 * That's an unacceptable UX paper cut for a small background-CPU win
 * (the cache was only saving an npm registry GET + version compare in
 * the spawned process — it never affected session-start latency, since
 * the dispatch is detached either way).
 *
 * So the cache is gone. Every session-start fires the detached spawn.
 * The detached `hivemind update` checks npm itself; if up-to-date it
 * exits silently. Trade-off accepted: more npm registry GETs (1 per
 * session-start instead of 1 per 4h), in exchange for ~zero "miss new
 * release" window. Concurrent invocations are serialized by the
 * follow-up flock in `runUpdate()` (see PR #97 review thread).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { Credentials } from "../../commands/auth-creds.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("autoupdate", msg);

export type AgentId = "claude" | "codex" | "cursor" | "hermes" | "pi" | "openclaw";

export interface AutoUpdateOpts {
  agent: AgentId;
  /**
   * Directory the running bundle lives in (`dirname(fileURLToPath(import.meta.url))`
   * at the call site). When it identifies a Codex-managed (plugin directory)
   * install, the npm self-update is skipped — Codex owns updates there via
   * marketplace snapshots. Omit for channels that have no directory install.
   */
  bundleDir?: string;
  /** Test override: resolved hivemind binary path or null. When provided, skips the PATH walk. */
  hivemindBinaryPath?: string | null;
  /** Test override: replaces the actual subprocess spawn with a fake. Must return the spawned child's pid (or 0). */
  spawn?: (cmd: string, args: string[]) => { pid?: number };
}

/**
 * Is the running bundle a Codex-managed (plugin directory) install rather
 * than our npm `hivemind install`?
 *
 * Codex extracts marketplace plugins under `<codexHome>/plugins/cache/
 * <marketplace>/<plugin>/<ref>/bundle/` (e.g. the `openai-curated` directory).
 * Our npm installer instead copies bundles to `<codexHome>/hivemind/bundle/`
 * and bakes absolute paths. ONLY the managed channel must skip the npm
 * self-update: there, Codex refreshes the plugin from marketplace snapshots
 * and an `npm install -g` + `hivemind install` would fight its file
 * management.
 *
 * Deliberately CONSERVATIVE. Returns true only on positive identification of
 * the managed cache path. Every other location — our npm path, a dev
 * checkout, an unrecognized layout — returns false so the update STILL runs.
 * The dangerous failure mode is a false "managed" verdict that silently
 * freezes updates for npm users; the safe default is therefore always
 * "not managed → update". A missed managed detection only costs a redundant,
 * self-serializing update attempt (see the flock in `runUpdate`).
 *
 * `plugins/cache` is anchored to a `.codex` segment (or an explicit
 * `CODEX_HOME`), so an unrelated path that merely contains `plugins/cache`
 * does not trip the skip.
 */
export function isCodexManagedInstall(
  bundleDir: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!bundleDir) return false;
  const norm = bundleDir.replace(/\\/g, "/");
  if (norm.includes("/.codex/plugins/cache/")) return true;
  const codexHome = env.CODEX_HOME;
  if (codexHome && codexHome.trim() !== "") {
    const h = codexHome.replace(/\\/g, "/").replace(/\/+$/, "");
    if (norm.includes(`${h}/plugins/cache/`)) return true;
  }
  return false;
}

/**
 * Default detached spawn — fire-and-forget. The child process inherits no
 * stdio, becomes its own session leader (`detached: true`), and is
 * `unref`-ed so the parent can exit without waiting for it. Real Node
 * semantics: this returns in < 5ms in practice (process fork is the only
 * blocking cost, and it's cheap).
 */
const defaultSpawn = (cmd: string, args: string[]): { pid?: number } => {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  // Swallow the unhandled 'error' event that fires synchronously when
  // the binary doesn't exist — without this listener it'd crash the
  // parent process.
  child.on("error", () => {});
  return { pid: child.pid };
};

/** Find the hivemind binary on PATH synchronously. ~5ms; on the hot path. */
function findHivemindOnPath(): string | null {
  // node:os doesn't expose `which`. Walk PATH manually — sync, fast,
  // no subprocess. PATH is delimited by ':' on POSIX and ';' on Windows
  // (path.delimiter), and on Windows the binary is a `.cmd`/`.exe` shim
  // (an extensionless `hivemind` is not a runnable Windows program).
  const PATH = process.env.PATH ?? "";
  const dirs = PATH.split(delimiter).filter(Boolean);
  const candidates =
    process.platform === "win32"
      ? ["hivemind.cmd", "hivemind.exe", "hivemind.bat", "hivemind"]
      : ["hivemind"];
  for (const dir of dirs) {
    for (const name of candidates) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Trigger an autoupdate check. Best-effort, fire-and-forget. Returns
 * synchronously (sub-50ms) — never blocks the session-start hook on
 * network or subprocess I/O.
 *
 * The actual upgrade work (npm install -g + re-exec install) happens
 * inside the detached `hivemind update` process. If that process
 * upgrades the install, the user sees the new version on the NEXT
 * session start (when `getInstalledVersion()` reads the freshly-
 * upgraded plugin.json).
 *
 * Returns void; declared async so the call sites can `await` it
 * without changing their structure (the await is a no-op functionally
 * but makes the call site uniform with other async hook helpers).
 */
export async function autoUpdate(
  creds: Credentials | null,
  opts: AutoUpdateOpts,
): Promise<void> {
  const t0 = Date.now();
  log(`agent=${opts.agent} entered`);
  if (isCodexManagedInstall(opts.bundleDir)) {
    log(`agent=${opts.agent} skip: Codex-managed install (${opts.bundleDir}); updates come via marketplace snapshots (${Date.now() - t0}ms)`);
    return;
  }
  if (!creds?.token) { log(`agent=${opts.agent} skip: no creds.token (${Date.now() - t0}ms)`); return; }
  if (creds.autoupdate === false) { log(`agent=${opts.agent} skip: autoupdate=false (${Date.now() - t0}ms)`); return; }

  const binaryPath = opts.hivemindBinaryPath !== undefined
    ? opts.hivemindBinaryPath
    : findHivemindOnPath();
  if (!binaryPath) { log(`agent=${opts.agent} skip: hivemind binary not on PATH (${Date.now() - t0}ms)`); return; }

  log(`agent=${opts.agent} binary=${binaryPath} → dispatching detached update`);
  const spawnFn = opts.spawn ?? defaultSpawn;
  let pid: number | undefined;
  try {
    pid = spawnFn(binaryPath, ["update"]).pid;
  } catch (e: any) {
    log(`agent=${opts.agent} dispatch threw: ${e?.message ?? e} (${Date.now() - t0}ms)`);
    return;
  }
  log(`agent=${opts.agent} dispatched (pid=${pid ?? "?"}) (${Date.now() - t0}ms total)`);
}
