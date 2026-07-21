/**
 * Docs auto-sync trigger — spawn a detached refresh when the user opted in.
 *
 * Two call sites feed it:
 *  - `hivemind graph build` (post-commit hook): the instant the build
 *    finishes, the snapshot on disk is fresh, so this is the race-free place
 *    to detect drift and regenerate docs. We do NOT touch the hook body
 *    itself (shipped + tested) — we hang the trigger off the end of the
 *    build command.
 *  - the SessionStart hook (`full: true`): the catch-up tick for pulled
 *    commits and long-idle repos that post-commit alone misses.
 *
 * The ONLY gate is the per-(org, project) consent registry the user wrote
 * via `graph init` / `hivemind docs auto on` — no env var, OFF by default:
 * auto-refresh shells out to the host LLM, which costs tokens and time, so
 * consent is explicit per repo AND per org. The refresh runs in a detached
 * child so the caller never blocks on it.
 */

import { spawnDetachedNodeWorker } from "../utils/spawn-detached.js";
import { isAutoEnabled } from "./auto-registry.js";

export interface AutoRefreshDeps {
  /** The CLI entry script to re-invoke (defaults to the running cli bundle). */
  cliEntry?: string;
  /** Injectable spawn for tests. */
  spawn?: (workerPath: string, args: readonly string[]) => void;
  /** Injectable registry check for tests. */
  isAutoEnabledFn?: (orgId: string, project: string) => boolean;
}

/**
 * Spawn `hivemind docs refresh --cwd <cwd>` (per-file docs) and
 * `hivemind docs wiki-refresh --cwd <cwd>` (subsystem pages) detached when
 * auto-refresh is enabled. `ctx.full` adds `--full` to the per-file refresh
 * (hash-scan of ALL docs instead of the HEAD~1..HEAD git window) — the
 * SessionStart catch-up needs it because pulled or long-idle multi-commit
 * gaps are invisible to the one-commit window; wiki-refresh needs no flag,
 * its own `last_refresh_sha..HEAD` window already spans the gap. The wiki cycle carries its own cheap guards
 * (sha-unchanged, 6h quiet period, lease claim), so firing it on every
 * commit is safe — most spawns exit in one read. Returns true if refreshes
 * were spawned, false if it was a no-op (flag off, or no CLI entry to
 * re-invoke). Best-effort and non-throwing.
 */
export function maybeSpawnDocsRefresh(cwd: string, ctx: { orgId: string; project: string; full?: boolean }, deps: AutoRefreshDeps = {}): boolean {
  // The ONLY switch is the per-(org, project) registry the user opted into via
  // the CLI. No env var: an automatic LLM spend must never start from ambient
  // shell state the user did not explicitly set for THIS repo and THIS org.
  const enabled = (deps.isAutoEnabledFn ?? isAutoEnabled)(ctx.orgId, ctx.project);
  if (!enabled) return false;
  const cliEntry = deps.cliEntry ?? process.argv[1];
  if (!cliEntry) return false;
  const spawn = deps.spawn ?? spawnDetachedNodeWorker;
  spawn(cliEntry, ["docs", "refresh", ...(ctx.full ? ["--full"] : []), "--cwd", cwd]);
  spawn(cliEntry, ["docs", "wiki-refresh", "--cwd", cwd]);
  return true;
}
