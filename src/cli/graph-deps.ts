import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { ensureDir, log, pkgRoot, warn, writeJson } from "./util.js";
import { SHARED_DIR, SHARED_NODE_MODULES } from "./embeddings.js";

/**
 * The code-graph feature resolves `tree-sitter` (+ language grammars) at
 * runtime from the SAME shared `embed-deps/node_modules` that the graph-on-stop
 * hook symlinks to. `ensureSharedDeps` only installs @huggingface/transformers
 * there, so on a real agent install tree-sitter is absent and the graph never
 * auto-builds (the hook degrades to a graceful skip). This module provisions
 * the parsers where the hook looks.
 *
 * tree-sitter is a NATIVE module: symlinking the package dir alone is not
 * enough (it needs its own node-gyp-build / node-addon-api siblings resolved),
 * so we run a scoped `npm install` and let npm lay down the full tree.
 */
export function isGraphDepsInstalled(
  sharedNodeModules: string = SHARED_NODE_MODULES,
  specs: string[] = treeSitterSpecs(),
): boolean {
  // Require EVERY requested parser to be present — not just `tree-sitter` — so
  // an interrupted or partial install counts as "needs (re)install" rather
  // than being skipped as done. `<name>@<range>` → dir name is the part before
  // the (unscoped) version separator.
  if (specs.length === 0) return false;
  return specs.every((s) => existsSync(join(sharedNodeModules, s.slice(0, s.lastIndexOf("@")))));
}

/**
 * Build `<name>@<range>` specs for every tree-sitter* entry in the package's
 * own optionalDependencies. Reading them from package.json (rather than a
 * hardcoded list) keeps the embed-deps versions in lockstep with what the
 * bundles were built against — no drift, no ABI mismatch.
 */
export function treeSitterSpecs(pkgJsonPath: string = join(pkgRoot(), "package.json")): string[] {
  let opt: Record<string, string> = {};
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    opt = pkg.optionalDependencies ?? {};
  } catch { return []; }
  return Object.keys(opt)
    .filter((n) => n === "tree-sitter" || n.startsWith("tree-sitter-"))
    .sort()
    .map((n) => `${n}@${opt[n]}`);
}

/**
 * The "ready" key stamped into the marker after BOTH the npm install AND the
 * native heal succeed. Keyed by the exact spec set PLUS the runtime identity
 * that a compiled native addon is bound to — platform, arch, and the Node
 * module ABI (`process.versions.modules`). A change in any of these (a version
 * bump, moving the home dir across machines, or upgrading Node to a new ABI)
 * flips the key and forces a full reprovision, so a stale `.node` built for a
 * different ABI never lingers as a silent load failure.
 *
 * NOTE: `specs` are the REQUESTED ranges (`tree-sitter@^0.21.1`), not the
 * resolved versions npm actually laid down. A range bump in package.json flips
 * the key (good), but re-resolving the SAME range to a newer patch inside the
 * range does NOT — that's an accepted trade-off: the heal re-validates the
 * bindings load on every reprovision, so a functionally-broken resolve still
 * fails the heal and leaves no marker.
 */
export function graphDepsReadyKey(specs: string[]): string {
  return [
    specs.join("\n"),
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `abi=${process.versions.modules}`,
  ].join("\n");
}

/**
 * Max age of the install lockdir before a contender reclaims it as stale.
 * 30 minutes: a from-source tree-sitter compile on a slow arm64 box can take
 * many minutes, and we refresh the lockdir mtime around each long phase (see
 * `refreshLock`), so only a genuinely dead installer ages past this window.
 */
const LOCK_STALE_MS = 30 * 60 * 1000;

/**
 * How long a recorded provisioning FAILURE suppresses the next attempt. Without
 * this, an offline box (npm can't reach the registry) would re-attempt — and
 * re-fail after a network timeout — on every single session start: a retry
 * storm. 6 hours lets a transient outage self-heal by the next working day
 * while never touching this file on the healthy fast path.
 */
const ATTEMPT_BACKOFF_MS = 6 * 60 * 60 * 1000;

/**
 * Injection seam for ensureGraphDeps. Tests replace the two external boundaries
 * (`runNpm` = the npm install, `runHeal` = the native-build heal) and point
 * `sharedDir` / `sharedNodeModules` / `specs` at a tmp fixture, so the branch
 * logic runs against real fs without spawning npm or compiling anything.
 */
export interface GraphDepsDeps {
  sharedDir?: string;
  sharedNodeModules?: string;
  specs?: string[];
  runNpm?: (specs: string[], cwd: string) => void;
  runHeal?: (cwd: string) => void;
  logFn?: (msg: string) => void;
  warnFn?: (msg: string) => void;
}

/**
 * Install the tree-sitter parsers into the shared embed-deps dir. Idempotent
 * and best-effort: any failure is logged and swallowed so it never aborts the
 * caller — the graph stays disabled but nothing else breaks, and the
 * graph-on-stop hook degrades gracefully rather than crashing.
 *
 * Called from EVERY session start (before the credentials early-return), so it
 * must be a genuine no-op on the common already-provisioned path: when the
 * ready-marker matches the current specs + platform + arch + Node ABI AND
 * every parser dir is present, it returns without spawning npm OR the heal.
 *
 * Concurrency: a mkdir-based lockdir in the shared dir serializes contenders.
 * A session that can't acquire the lock (another install is in flight) skips
 * silently — the next session retries. A lock older than LOCK_STALE_MS is
 * reclaimed so a crashed installer never wedges provisioning forever.
 *
 * The marker is a true "ready" marker: it is written ONLY after BOTH the npm
 * install AND scripts/ensure-tree-sitter.mjs (the native heal) succeed. A
 * partial/interrupted install therefore leaves no marker and re-runs next time.
 *
 * Two-phase native provisioning: `npm install --ignore-scripts` first, so a
 * platform without a prebuild (arm64 / Node 24) doesn't fail the download,
 * THEN the heal validates the bindings load and compiles from source where no
 * prebuild exists.
 *
 * Decoupled from the ~600 MB embeddings download: this installs ONLY the
 * parsers (tens of MB), so the code graph can work without semantic search.
 */
export function ensureGraphDeps(deps: GraphDepsDeps = {}): void {
  const {
    sharedDir = SHARED_DIR,
    sharedNodeModules = SHARED_NODE_MODULES,
    specs = treeSitterSpecs(),
    runNpm = defaultRunNpm,
    runHeal = defaultRunHeal,
    logFn = log,
    warnFn = warn,
  } = deps;
  try {
    // Same disable switch the graph-on-stop auto-build hook honors
    // (HIVEMIND_GRAPH_ON_STOP=0): if the graph feature is off there's nothing
    // to provision for, so skip the install entirely.
    if (process.env.HIVEMIND_GRAPH_ON_STOP === "0") {
      logFn(`  Graph          provisioning skipped (HIVEMIND_GRAPH_ON_STOP=0)`);
      return;
    }
    if (specs.length === 0) {
      warnFn(`  Graph          no tree-sitter optionalDependencies found in package.json — skipping`);
      return;
    }
    const marker = join(sharedDir, ".graph-deps");
    const attemptFile = join(sharedDir, ".graph-deps.attempt");
    const wantKey = graphDepsReadyKey(specs);
    // Cheap no-op fast path: BEFORE taking the lock, touching npm, or reading
    // the attempt file, if the ready-marker already matches (same specs +
    // platform + arch + ABI) AND every parser is present, there's nothing to
    // do. This is the path every steady-state session hits, so it must spawn
    // nothing AND never touch the attempt-backoff file — a healthy install
    // stays completely untouched.
    if (readMarker(marker) === wantKey && isGraphDepsInstalled(sharedNodeModules, specs)) {
      logFn(`  Graph          tree-sitter parsers already present at ${sharedDir}`);
      return;
    }

    // Offline retry-storm guard: if the LAST attempt failed recently, skip
    // this one. Checked AFTER the fast-path (healthy installs never see it)
    // but BEFORE the lock (a wedged network shouldn't even contend). A
    // successful provision clears this file; the fast path above means a
    // once-provisioned box never re-reads it.
    if (recentlyFailed(attemptFile)) {
      logFn(`  Graph          skipping provision — a recent attempt failed (backing off ${ATTEMPT_BACKOFF_MS / 3_600_000}h)`);
      return;
    }

    ensureDir(sharedDir);
    // Global atomic install lock. Acquired BEFORE re-checking markers/packages
    // so only one contender provisions at a time. A failure to acquire means
    // another install is in flight (or we couldn't create the dir) — skip
    // silently; the next session retries.
    const lockDir = join(sharedDir, ".graph-deps.lock");
    const token = lockToken();
    if (!acquireLock(lockDir, token)) {
      logFn(`  Graph          another install holds the lock — skipping (will retry next session)`);
      return;
    }
    try {
      // Re-check under the lock: a contender we raced may have finished the
      // install while we waited, making our work redundant.
      if (readMarker(marker) === wantKey && isGraphDepsInstalled(sharedNodeModules, specs)) {
        logFn(`  Graph          tree-sitter parsers already present at ${sharedDir}`);
        return;
      }
      // Invalidate the ready marker BEFORE any mutation. From here until the
      // final re-stamp the install is "in progress" and MUST NOT be trusted:
      // if npm or the heal crashes mid-flight, the absent marker forces the
      // next session to retry rather than fast-path over a half-broken tree.
      try { rmSync(marker, { force: true }); } catch { /* absent is fine */ }
      // Create a package.json if none exists yet (user never ran embeddings
      // install). Don't clobber an existing one — it may already declare
      // transformers; the parsers are installed alongside.
      const pkgPath = join(sharedDir, "package.json");
      if (!existsSync(pkgPath)) {
        writeJson(pkgPath, { name: "hivemind-embed-deps", version: "1.0.0", private: true, dependencies: {} });
      }
      logFn(`  Graph          installing tree-sitter parsers into ${sharedDir} (code-graph; ~tens of MB)`);
      // Refresh the lock mtime immediately before npm so a genuinely long
      // install isn't reclaimed as stale mid-flight by a racing session.
      refreshLock(lockDir);
      runNpm(specs, sharedDir);
      // Heal AFTER the install: validates bindings load + compiles from source
      // where no prebuild exists (arm64 / Node 24). Repairs an interrupted or
      // ABI-mismatched one. Refresh the lock again before it — a from-source
      // arm64 compile is the single longest phase.
      refreshLock(lockDir);
      runHeal(sharedDir);
      // Only NOW — after BOTH steps succeeded — stamp the ready marker and
      // clear any recorded failure. If either threw, we never reach here, the
      // marker stays absent, and the catch below records the failure.
      writeFileSync(marker, wantKey);
      clearAttempt(attemptFile);
    } finally {
      releaseLock(lockDir, token);
    }
  } catch (err) {
    // Record the failure so the offline retry-storm guard backs off next time.
    // Best-effort: if we can't even write the attempt file (permissions), the
    // provision still degrades gracefully — we just lose the backoff.
    recordFailure(join(sharedDir, ".graph-deps.attempt"));
    warnFn(`  Graph          tree-sitter provisioning failed (${err instanceof Error ? err.message : String(err)}); code graph stays disabled — everything else works`);
  }
}

/** Read the ready marker, or "" when absent/unreadable. */
function readMarker(marker: string): string {
  try { return existsSync(marker) ? readFileSync(marker, "utf8") : ""; } catch { return ""; }
}

/** A per-process owner token stamped into the lockdir: pid + randomness. */
function lockToken(): string {
  return `${process.pid}.${randomBytes(8).toString("hex")}`;
}

/** Path of the owner-token file written inside the lockdir on acquire. */
function ownerFile(lockDir: string): string {
  return join(lockDir, "owner");
}

/**
 * Acquire the install lock via an atomic `mkdir` (fails EEXIST if held), then
 * write our owner token inside it so `releaseLock` can prove ownership. If the
 * existing lockdir is older than LOCK_STALE_MS it's a crashed installer's
 * leftover — reclaim it (rm the stale dir, then attempt a fresh mkdir). The
 * reclaim mkdir can itself lose to another concurrent reclaimer (both saw the
 * same stale dir, one removed + recreated it first) — that's fine: the loser's
 * mkdir throws EEXIST and we return false, so it simply skips this session.
 * Returns false when the lock is held by a live contender or the mkdir fails.
 */
function acquireLock(lockDir: string, token: string): boolean {
  const claim = (): boolean => {
    mkdirSync(lockDir);
    writeFileSync(ownerFile(lockDir), token);
    return true;
  };
  try {
    return claim();
  } catch {
    // Held (or unmakeable). Reclaim only if demonstrably stale.
    try {
      const age = Date.now() - statSync(lockDir).mtimeMs;
      if (age < LOCK_STALE_MS) return false;
      rmSync(lockDir, { recursive: true, force: true });
      return claim(); // may lose to a concurrent reclaimer → EEXIST → false
    } catch {
      return false;
    }
  }
}

/**
 * Refresh the lockdir mtime so a long-but-live install isn't reclaimed as stale
 * mid-flight. Touches BOTH the dir and its owner file (some filesystems only
 * surface mtime changes on the file). Best-effort — a failure here just risks
 * an over-eager reclaim, which the ownership-safe release then absorbs.
 */
function refreshLock(lockDir: string): void {
  const now = new Date();
  try { utimesSync(lockDir, now, now); } catch { /* best-effort */ }
  try { utimesSync(ownerFile(lockDir), now, now); } catch { /* best-effort */ }
}

/**
 * Ownership-safe lock release: remove the lockdir ONLY when its owner token
 * matches ours. If a stale-reclaim handed the lock to another process while we
 * were still running (we over-ran LOCK_STALE_MS), the token no longer matches
 * and we DON'T delete — deleting would rip the lock out from under the new
 * owner mid-install. A token we can't read (dir already gone) is treated as
 * not-ours and left alone.
 */
function releaseLock(lockDir: string, token: string): void {
  try {
    const owner = existsSync(ownerFile(lockDir)) ? readFileSync(ownerFile(lockDir), "utf8") : "";
    if (owner !== token) return; // reclaimed by someone else — not ours to remove
    rmSync(lockDir, { recursive: true, force: true });
  } catch { /* stale-reclaim handles a leftover */ }
}

/**
 * True when a prior provisioning attempt failed within ATTEMPT_BACKOFF_MS.
 * A malformed / unreadable attempt file counts as "not recently failed" so a
 * corrupt file can never wedge provisioning forever.
 */
function recentlyFailed(attemptFile: string): boolean {
  try {
    if (!existsSync(attemptFile)) return false;
    const { lastAttemptAt } = JSON.parse(readFileSync(attemptFile, "utf8")) as { lastAttemptAt?: number };
    if (typeof lastAttemptAt !== "number") return false;
    return Date.now() - lastAttemptAt < ATTEMPT_BACKOFF_MS;
  } catch {
    return false;
  }
}

/** Record a failed attempt (timestamp + running failure count). Best-effort. */
function recordFailure(attemptFile: string): void {
  try {
    let failures = 0;
    try {
      const prev = JSON.parse(readFileSync(attemptFile, "utf8")) as { failures?: number };
      if (typeof prev.failures === "number") failures = prev.failures;
    } catch { /* no prior file / unreadable → start at 0 */ }
    writeFileSync(attemptFile, JSON.stringify({ lastAttemptAt: Date.now(), failures: failures + 1 }));
  } catch { /* best-effort — losing the backoff record is non-fatal */ }
}

/** Clear the recorded-failure file after a successful provision. Best-effort. */
function clearAttempt(attemptFile: string): void {
  try { rmSync(attemptFile, { force: true }); } catch { /* absent is fine */ }
}

/**
 * Default npm boundary. `--ignore-scripts` fetches the packages without the
 * native build that fails on platforms lacking a prebuild (the heal does the
 * build). The parsers ARE saved to the shared package.json (default): a plain
 * `npm install` PRUNES unsaved packages (verified on npm 11), so an unsaved
 * install would be wiped by ensureSharedDeps' transformers reconcile. Being
 * declared, they're neither pruned nor (once present and version-satisfied)
 * rebuilt by that reconcile — so ensureSharedDeps stays free of
 * --ignore-scripts, which would break onnxruntime-node / sharp (both have real
 * install/postinstall native steps).
 */
function defaultRunNpm(specs: string[], cwd: string): void {
  execFileSync("npm", ["install", ...specs, "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund", "--ignore-scripts"], {
    cwd,
    stdio: "inherit",
  });
}

/**
 * Default heal boundary: run scripts/ensure-tree-sitter.mjs.
 *
 * Two correctness properties over a naive "run it if present":
 *
 * 1. STRICT mode (`HIVEMIND_STRICT_POSTINSTALL=1`) turns the script's final
 *    bindings-load check into a non-zero exit. By DEFAULT that script exits 0
 *    even when the from-source rebuild's load check still fails (so end-user
 *    `npm install` never hard-breaks) — but here a silent heal "success" over
 *    an unloadable addon is exactly the false-success we must avoid: it would
 *    stamp the ready marker and the graph would then fail at parse time every
 *    session. Forcing strict makes a load failure throw, so no marker is
 *    written and the next session retries.
 *
 * 2. A MISSING heal script is a FAILURE, not a silent success. The heal is the
 *    only thing that validates the native bindings actually load on this
 *    platform; skipping it and stamping the marker would ship a possibly-broken
 *    install. Throwing here leaves no marker so provisioning retries once the
 *    script is present.
 */
export function defaultRunHeal(cwd: string, healScript: string = join(pkgRoot(), "scripts", "ensure-tree-sitter.mjs")): void {
  if (!existsSync(healScript)) {
    throw new Error(`heal script missing at ${healScript} — cannot validate native bindings`);
  }
  execFileSync(process.execPath, [healScript], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HIVEMIND_STRICT_POSTINSTALL: "1" },
  });
}
