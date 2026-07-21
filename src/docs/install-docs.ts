/**
 * The docs-onboarding step of `hivemind install`, factored out of
 * `runInstallAll` so it can be tested deterministically (no pty, no network).
 *
 * Behaviour, all decided here:
 *   - Resolve the git root; if we can't prompt (no TTY / not signed in / not a
 *     repo) OR the root is the user's $HOME, fall back to the one-time hint.
 *   - Otherwise: build the graph INLINE (fast, no LLM), run the onboarding
 *     (generate? → agent? → auto?), and on consent spawn `docs wiki` DETACHED
 *     so the LLM generation never blocks install — mirroring `graph init`.
 *   - A docs hiccup must never break install: the effectful section is guarded
 *     and returns "noop" on failure.
 *
 * Everything effectful is injected, so a test asserts the exact decision +
 * the exact worker spawn without touching git, the graph, or the backend.
 */

import { isHomeRoot, shouldPromptDocsSetup } from "./install-hint.js";
import type { OnboardingResult } from "./onboarding.js";

export interface InstallDocsDeps {
  cwd: string;
  interactive: boolean;
  loggedIn: boolean;
  home: string;
  /** git toplevel for cwd, or null when not a repo. May throw → treated as null. */
  gitTopLevel: (cwd: string) => string | null;
  /** Org config, or null when unavailable. */
  loadCfg: () => { orgId: string; orgName?: string } | null;
  /** Is auto docs-sync already enabled for (org, repo)? Then don't re-prompt. */
  autoEnabled: (orgId: string, root: string) => boolean;
  /** Build the code graph inline (fast, no LLM). */
  buildGraph: (root: string) => Promise<void>;
  /** Run the interactive consent flow. */
  onboard: (a: { root: string; orgId: string; orgName?: string }) => Promise<OnboardingResult>;
  /** Spawn a detached CLI worker (e.g. ["docs","wiki","--cwd",root]). False = no CLI entry. */
  spawn: (args: string[]) => boolean;
  /** Print the one-time informational hint (sentinel-gated by the caller). */
  showHint: () => void;
  log: (m: string) => void;
  warn: (m: string) => void;
}

export type InstallDocsAction =
  | { kind: "hint" }                              // couldn't/needn't prompt → hint shown
  | { kind: "already-enabled"; root: string }     // auto already on → no re-prompt
  | { kind: "declined" }                          // prompted, user said no to generate
  | { kind: "spawned"; root: string }             // consented → wiki spawned DETACHED
  | { kind: "no-entry"; root: string }            // consented but no CLI entry to spawn
  | { kind: "noop" };                             // no cfg, or a guarded failure

export async function runInstallDocsOnboarding(d: InstallDocsDeps): Promise<InstallDocsAction> {
  let inGitRepo = false;
  let repoRoot = d.cwd;
  try {
    const top = d.gitTopLevel(d.cwd);
    inGitRepo = top !== null;
    repoRoot = top ?? d.cwd;
  } catch {
    /* probe unavailable → treat as not-a-repo, fall through to the hint */
  }

  const prompt = shouldPromptDocsSetup({
    interactive: d.interactive,
    inGitRepo,
    loggedIn: d.loggedIn,
    atHome: isHomeRoot(repoRoot, d.home),
  });
  if (!prompt) {
    d.showHint();
    return { kind: "hint" };
  }

  try {
    const cfg = d.loadCfg();
    if (!cfg) return { kind: "noop" };
    // Already set up: don't re-ASK (nothing new to consent to). Still build the
    // graph — its post-build auto-refresh regenerates in the background, so an
    // auto-enabled-but-empty corpus still gets filled (idempotent when full).
    if (d.autoEnabled(cfg.orgId, repoRoot)) {
      d.log("");
      await d.buildGraph(repoRoot);
      d.log("Docs auto-sync is on for this repo — refreshing in the background. See: hivemind docs list");
      return { kind: "already-enabled", root: repoRoot };
    }
    d.log("");
    d.log("Docs (optional): set up documentation for this repository.");
    await d.buildGraph(repoRoot);
    const result = await d.onboard({ root: repoRoot, orgId: cfg.orgId, orgName: cfg.orgName });
    if (!result.generate) return { kind: "declined" };
    // Only the wiki here — same as `hivemind graph init`. Per-file docs are a
    // separate, heavy `docs generate` (every file × LLM); auto-sync generates
    // them later on commit. `docs refresh` would NOT create missing per-file
    // docs (it only refreshes drifted existing rows), so spawning it is a no-op.
    if (d.spawn(["docs", "wiki", "--cwd", repoRoot])) {
      d.log("Generating wiki docs in the background — check with: hivemind docs list");
      return { kind: "spawned", root: repoRoot };
    }
    d.log("Run `hivemind docs wiki` to generate the corpus.");
    return { kind: "no-entry", root: repoRoot };
  } catch (err) {
    d.warn(`docs setup skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: "noop" };
  }
}
