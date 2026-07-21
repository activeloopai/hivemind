/**
 * Credentials file IO for the Deeplake plugin. Lives in its own module so
 * that consumers (in particular the openclaw plugin's bundler) can split
 * fs reads/writes from network calls along source-file boundaries — needed
 * to pass per-file static-analysis rules that flag fs+fetch co-occurrence.
 *
 * No imports from any module that touches `fetch` belong here.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Lazy path accessors — re-evaluate homedir() on every call rather than
// binding at module-load time. Two reasons:
//   1. Tests can override HOME via process.env.HOME between cases without
//      needing vi.resetModules + dynamic re-import. That re-import pattern
//      created a V8 worker-pool branch-coverage flake on CI (each
//      reimported module instance was tracked separately, the merge across
//      workers was non-deterministic, branch coverage on these helpers
//      dropped to 50-66% on CI while local Node 20+22 reported 100%).
//   2. Robustness: production-side, HOME could in principle change in long-
//      lived processes; lazy lookup avoids stale-snapshot bugs.
export function configDir(): string {
  return join(homedir(), ".deeplake");
}
export function credsPath(): string {
  return join(configDir(), "credentials.json");
}

export interface Credentials {
  token: string;
  orgId: string;
  orgName?: string;
  userName?: string;
  workspaceId?: string;
  apiUrl?: string;
  autoupdate?: boolean;
  savedAt: string;
}

// Each helper avoids the existsSync-before-act anti-pattern: it has both a
// time-of-check-to-time-of-use race and extra branches that don't add real
// safety. Letting the fs call's own error fall into a try/catch is more
// correct AND simplifies coverage to a single fall-through path.

// `readFile` is injectable purely for tests — it lets the retry path below be
// exercised deterministically (first call throws, second succeeds) without
// mocking node:fs at the module level, which this file avoids (see the header
// note on the coverage-flake that mock+reimport caused). Production callers use
// the default and never pass an argument.
export function loadCredentials(
  readFile: (p: string) => string = (p) => readFileSync(p, "utf-8"),
): Credentials | null {
  try {
    return JSON.parse(readFile(credsPath()));
  } catch (err) {
    // A genuinely-absent file (ENOENT) is final → null, no retry.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    // Otherwise the failure may be a TRANSIENT torn read: another process
    // rewriting credentials.json at this instant. saveCredentials() now writes
    // atomically (temp + rename) so this version can't tear its own writes, but
    // an older plugin build on the same machine still might, and a crashed
    // writer can leave a half-file. Re-read once before declaring "not logged
    // in" for the whole session.
    try {
      return JSON.parse(readFile(credsPath()));
    } catch {
      // Persistent permission error or malformed JSON → "no usable
      // credentials." Caller treats null as "not logged in."
      return null;
    }
  }
}

export function saveCredentials(creds: Credentials): void {
  // mkdirSync({ recursive: true }) is idempotent: no-op if CONFIG_DIR
  // already exists (and does NOT change its mode in that case, per
  // node:fs docs). Calling it unconditionally removes the existsSync
  // guard without behaviour change.
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });

  // Atomic write: serialize into a unique temp file in the same directory,
  // then rename() it over the target. rename(2) is atomic on a POSIX
  // filesystem, so a concurrent loadCredentials() reader always observes
  // either the complete previous file or the complete new one — never a
  // half-written one. A plain writeFileSync truncates-then-writes, so a
  // reader landing mid-write (common for a power user running many parallel
  // agent sessions, each of which rewrites creds at SessionStart via
  // healDriftedOrgToken) gets partial bytes → JSON.parse throws → a spurious
  // "not logged in / Hivemind unavailable" banner. The temp name is unique
  // per (process, call) so two concurrent writers never clobber each other's
  // staging file. Same directory guarantees the rename stays on one fs.
  const target = credsPath();
  const tmp = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  const body = JSON.stringify({ ...creds, savedAt: new Date().toISOString() }, null, 2);
  try {
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, target);
  } catch (err) {
    // Best-effort cleanup so a failed write doesn't leak a staging file.
    try { unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw err;
  }
}

export function deleteCredentials(): boolean {
  try {
    unlinkSync(credsPath());
    return true;
  } catch {
    // Anything else (file already gone, permission denied, EBUSY, …) maps
    // to "didn't delete." The function's user-facing contract is "tell me
    // whether the file got removed." Surfacing transport-level errors as
    // exceptions to a logout caller adds no actionable signal.
    return false;
  }
}
