import { installClaude, uninstallClaude } from "./install-claude.js";
import { installCodex, uninstallCodex } from "./install-codex.js";
import { installOpenclaw, uninstallOpenclaw } from "./install-openclaw.js";
import { installCursor, uninstallCursor } from "./install-cursor.js";
import { installHermes, uninstallHermes } from "./install-hermes.js";
import { installCowork, uninstallCowork } from "./install-cowork.js";
import { installPi, uninstallPi } from "./install-pi.js";
import {
  disableEmbeddings,
  enableEmbeddings,
  installEmbeddings,
  statusEmbeddings,
  uninstallEmbeddings,
} from "./embeddings.js";
import { ensureGraphDeps } from "./graph-deps.js";
import { ensureLoggedIn, isLoggedIn, loginWithProvidedToken, maybeShowOrgChoice } from "./auth.js";
import { runAuthCommand } from "../commands/auth-login.js";
// NOTE: ../commands/graph.js is intentionally NOT imported statically. It pulls
// in the tree-sitter native addon (an optionalDependency), which fails to build
// on some platforms (e.g. Node 24 / arm64, where tree-sitter@0.21 needs C++20).
// A static import would hoist `import "tree-sitter"` to the top of the bundle
// and crash EVERY `hivemind` command — including `install` — with
// ERR_MODULE_NOT_FOUND when the addon is absent. It is loaded lazily below
// (with `splitting` enabled in esbuild, the tree-sitter chunk is split out and
// only loaded when `hivemind graph` actually runs).
import { runDashboardCommand } from "../commands/dashboard.js";
import { runSkillifyCommand } from "../commands/skillify.js";
import { runRulesCommand } from "../commands/rules.js";
import { runGoalCommand, runKpiCommand } from "../commands/goal.js";
import { runDocsCommand } from "../commands/docs.js";
import { runContextCommand } from "../commands/context.js";
import { runBackfillMemory } from "../commands/backfill-memory.js";
import { runFlushMemory } from "../commands/flush-memory.js";
import { maybeAutoBackfillMemory } from "../skillify/spawn-backfill-memory-worker.js";
import { confirm, detectPlatforms, allPlatformIds, log, promptLine, warn, type PlatformId } from "./util.js";
import { getVersion } from "./version.js";
import { docsInstallLines, docsHintShown, markDocsHintShown } from "../docs/install-hint.js";
import { runUpdate } from "./update.js";
import { renderCliHelpBlock } from "./skillify-spec.js";
import { maybeAutoMineLocal } from "../skillify/spawn-mine-local-worker.js";

const AUTH_SUBCOMMANDS = new Set([
  "whoami",
  "logout",
  "org",
  "workspaces",
  "workspace",
  "invite",
  "members",
  "remove",
  "autoupdate",
  "sessions",
]);

const USAGE = `
hivemind — one brain for every agent on your team

Usage:
  hivemind install   [--only <platforms>] [--skip-auth] [--token <value>]
                     [--ref <code>] [--no-scan]
      Auto-detect assistants on this machine and install hivemind into each.
      --only takes a comma-separated list: ${allPlatformIds().join(",")}
      --token, or env HIVEMIND_TOKEN, signs in non-interactively (useful
      for CI / scripted installs). Without it, a TTY install shows a
      consent prompt; a headless install skips auth and prints a hint
      for 'hivemind login'.
      --ref <code> attributes a NEW signup to an affiliate/referrer code
      (e.g. --ref mario). Ignored for already-registered users.
      By default install kicks off a background scan of your recent Claude
      Code sessions for repeatable mistakes (surfaced next session). Pass
      --no-scan, or set HIVEMIND_INSTALL_SCAN=0, to skip it.

  hivemind uninstall [--only <platforms>]
      Auto-detect installed assistants and remove hivemind from each.
      --only takes the same list to scope the removal.

  hivemind claude  install | uninstall
  hivemind codex   install | uninstall
  hivemind claw    install | uninstall
  hivemind cursor  install | uninstall
  hivemind hermes  install | uninstall
  hivemind claude_cowork install | uninstall
  hivemind pi      install | uninstall
      Install or remove hivemind for a specific assistant.

  hivemind login [--ref <code>]
                            Run device-flow login (open browser). --ref
                            attributes a new signup to a referrer code.
  hivemind status           Show which assistants are wired up.
  hivemind update [--dry-run]
      Check npm for a newer @deeplake/hivemind, upgrade the CLI, and refresh
      every detected agent bundle. Single command for all agents.

  hivemind dashboard [--cwd <path>] [--out <path>] [--no-open]
                     [--serve] [--port <n>]
      Build a self-contained HTML dashboard for this repo. Combines
      KPI cards (tokens saved, skills created, memory recalls,
      sessions) with the codebase-graph visualization. Writes to
      ~/.hivemind/dashboards/<repo-key>/index.html by default.
      --no-open skips the browser launch (headless / CI scenarios).
      --serve starts a loopback HTTP server at http://127.0.0.1:<port>
      (default 8123) so the dashboard is reachable via a URL — useful
      over SSH; VS Code / Cursor Remote-SSH auto-forwards the port
      and opens it in the integrated Simple Browser tab on click.

Semantic search (embeddings):
  hivemind embeddings install                Download @huggingface/transformers
                                             once (~600 MB) into a shared dir,
                                             symlink every detected agent
                                             plugin to it, and set
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Idempotent.
  hivemind embeddings enable                 Light opt-in: flip
                                             embeddings.enabled = true in
                                             ~/.deeplake/config.json. Use this
                                             after \`disable\` to turn back on
                                             without re-running install.
  hivemind embeddings disable                Light opt-out: flip
                                             embeddings.enabled = false and
                                             SIGTERM the running daemon. Shared
                                             deps stay on disk.
  hivemind embeddings uninstall [--prune]    Full opt-out: remove the per-agent
                                             symlinks, flip
                                             embeddings.enabled = false, and
                                             SIGTERM the daemon. --prune also
                                             deletes the shared dir to reclaim
                                             ~600 MB.
  hivemind embeddings status                 Show config + shared-deps + per-
                                             agent state.

  Add --with-embeddings to "hivemind install" (or "hivemind <agent> install")
  to run "embeddings install" automatically after installing the agent(s).

Codebase graph (per-repo AST snapshot + cloud sync):
  hivemind graph build [--cwd <path>]        Walk TypeScript sources, extract
                                             AST nodes + edges, write a
                                             snapshot, and push to cloud.
  hivemind graph diff <sha1> <sha2>          Diff two snapshots by commit.
  hivemind graph history [-n N] [--json]     Show last N build entries.
  hivemind graph init [--force]              Install a managed
                                             .git/hooks/post-commit hook
                                             that rebuilds on each commit.
  hivemind graph pull                        Download the freshest cloud
                                             snapshot for HEAD into local.
  hivemind graph uninstall                   Remove the managed post-commit
                                             hook.
  Agents query the local snapshot via the Deeplake mount at
  ~/.deeplake/memory/graph/{index.md,find/<pattern>,show/<handle-or-pattern>}.

Skill management (mine + share reusable Claude skills across the org):
${renderCliHelpBlock()}

Team-wide rules:
  hivemind rules add "<text>" [--scope team]   Add a new rule (org-wide).
  hivemind rules list [--status active|done|all] [--limit N]
                                               List rules. Default: active, 10 newest.
  hivemind rules edit <rule-id> "<new text>"   Edit a rule (bumps version).
  hivemind rules done <rule-id>                Mark a rule done.
  Note: active rules are auto-injected into the SessionStart block for
  claude-code / cursor / hermes; codex / pi / openclaw use 'hivemind context'.

Cross-agent helpers:
  hivemind context                             Print the rules + open-goals block on demand.
                                               Fallback for harnesses/pi/openclaw agents (no SessionStart hook)
                                               and read-only diagnostic for any agent.

Account / org / workspace:
  hivemind whoami                          Show current user, org, workspace.
  hivemind logout                          Remove credentials.
  hivemind org list                        List organizations.
  hivemind org switch <name-or-id>         Switch active organization.
  hivemind workspaces                      List workspaces in current org.
  hivemind workspace list                  List workspaces (alias of 'workspaces').
  hivemind workspace switch <name-or-id>   Switch active workspace.
  hivemind members                         List org members.
  hivemind invite <email> <ADMIN|WRITE|READ>  Invite a teammate.
  hivemind remove <user-id>                Remove a member.
  hivemind autoupdate [on|off]             Toggle Claude Code plugin auto-update.
  hivemind sessions prune [...]            Manage your captured sessions.

  hivemind --version        Print the hivemind version.
  hivemind --help           Show this message.

Docs:  https://github.com/activeloopai/hivemind
`.trim();

function parseOnly(args: string[]): PlatformId[] | null {
  const idx = args.findIndex(a => a === "--only" || a.startsWith("--only="));
  if (idx === -1) return null;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  if (!raw) return null;
  const ids = raw.split(",").map(s => s.trim()).filter(Boolean) as PlatformId[];
  const valid = new Set(allPlatformIds());
  const bad = ids.filter(id => !valid.has(id));
  if (bad.length > 0) {
    warn(`Unknown platform(s): ${bad.join(", ")}. Valid: ${allPlatformIds().join(", ")}`);
    process.exit(1);
  }
  return ids;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseToken(args: string[]): string | undefined {
  const idx = args.findIndex(a => a === "--token" || a.startsWith("--token="));
  if (idx === -1) return undefined;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  return raw && raw.length > 0 ? raw : undefined;
}

// Affiliate referral code from `--ref <code>` / `--ref=<code>`. Carried into the
// device flow so a NEW signup can be attributed to the referring influencer.
function parseRef(args: string[]): string | undefined {
  const idx = args.findIndex(a => a === "--ref" || a.startsWith("--ref="));
  if (idx === -1) return undefined;
  const raw = args[idx].includes("=") ? args[idx].split("=", 2)[1] : args[idx + 1];
  // A bare `--ref` followed by another flag (e.g. `--ref --skip-auth`) must not
  // swallow that flag as the code. Reject anything that looks like a flag.
  if (!raw || raw.startsWith("--")) return undefined;
  const code = raw.trim();
  return code.length > 0 ? code : undefined;
}

function hasEnvToken(): boolean {
  return Boolean(process.env.HIVEMIND_TOKEN);
}

// Decide how to sign the user in before platform install runs. Three paths,
// in priority order:
//   1. A token is provided (flag or env). Validate via /me and save creds —
//      honored regardless of TTY since a typed/exported token is itself an
//      act of consent.
//   2. Non-TTY without a token. We CANNOT prompt (readline would hang on
//      closed stdin), so print a one-time hint and continue install.
//   3. TTY without a token. Show the consent prompt; only on "Yes" do we
//      open the browser via ensureLoggedIn() / device flow.
// In every path, a failure (or "No") continues the install — hooks land and
// the user can `hivemind login` later. This is the deliberate inversion
// behind the consent rollout: install ≠ auth.
/**
 * The background install-time session scan is on by default. Users who don't
 * want their recent sessions mined (or their Claude subscription spent on it)
 * opt out with `--no-scan` on the install command or HIVEMIND_INSTALL_SCAN set
 * to a falsy value ("0", "false", "no", "off").
 */
function installScanOptedOut(args: string[]): boolean {
  if (args.includes("--no-scan")) return true;
  const env = (process.env.HIVEMIND_INSTALL_SCAN ?? "").trim().toLowerCase();
  return env === "0" || env === "false" || env === "no" || env === "off";
}

async function runAuthGate(args: string[]): Promise<void> {
  const flagToken = parseToken(args);
  const isTTY = Boolean(process.stdin.isTTY);

  // If a token is supplied via flag or env, try it first — but on failure
  // fall through to the next path (consent prompt in TTY, headless hint
  // otherwise) so a typoed / revoked token doesn't dead-end the install
  // with no recovery. Codex review on PR #190 surfaced this.
  if (flagToken || hasEnvToken()) {
    const ok = await loginWithProvidedToken(flagToken);
    if (ok) return;
  }

  if (!isTTY) {
    log("");
    log("No TTY detected — continuing without sign-in.");
    log("To sign in:");
    log("  1) Visit https://app.deeplake.ai/api-keys to create an API key");
    log("  2) Rerun: HIVEMIND_TOKEN=<key> hivemind install");
    log("Or run `hivemind login` after install.");
    return;
  }

  // Install-time value-show: kick off a scan of the user's recent Claude
  // Code sessions for repeatable mistakes in the BACKGROUND — never block the
  // install on it. A detached `mine-local` worker mines + ranks while install
  // continues; the resulting insight surfaces at the next SessionStart via the
  // local-mined notification rule (src/notifications/rules/local-mined.ts).
  //
  // We don't ask first: the scan reads only local session files (nothing
  // leaves the machine until sign-in) and the sole real cost — a few Claude
  // subscription calls — is disclosed inline, not gated behind a prompt.
  // Gating lost every user who said "no" (or "not now") before seeing any
  // value; the earlier synchronous version also blocked the terminal for up
  // to 5 minutes. Opt out with `--no-scan` or HIVEMIND_INSTALL_SCAN=0.
  if (!installScanOptedOut(args)) {
    const auto = maybeAutoMineLocal({
      sessionCount: 10,
      onlyAgent: "claude_code",
      advise: true,
    });
    if (auto.triggered) {
      log("");
      log("🐝 Scanning your recent Claude Code sessions for repeatable mistakes in the");
      log("   background (using your Claude Code subscription). Your first insight will");
      log("   appear the next time you start Claude Code.");
    }
  }

  log("");
  log("🐝 One more step to unlock Hivemind");
  log("");
  log("To enable shared memory and auto-learning across your agents,");
  log("we need to sign you in. Your traces will be securely stored in");
  log("your private Hivemind, so all your agents can recall them.");
  log("");
  log("You can later connect your own cloud storage like S3/GCS/Azure Blob.");
  log("");
  const yes = await confirm("Sign in now?", true);

  let signedIn = false;
  if (yes) {
    signedIn = await ensureLoggedIn(parseRef(args));
    if (!signedIn) {
      warn("Login did not complete.");
    }
  }

  // Fallback: if user declined OR said Yes but the device flow didn't
  // finish, offer the API-key paste path. This catches both "I don't want
  // to do the browser dance" and "I started but it timed out / I closed
  // the tab" — both used to dead-end the install with no auth.
  //
  // The paste prompt loops up to MAX_PASTE_ATTEMPTS times so a single
  // typo / stale key doesn't kick the user back out of the install. On
  // empty input we skip; on success we exit immediately.
  if (!signedIn) {
    log("");
    log("Alternatively, sign in at https://app.deeplake.ai/api-keys, create");
    log("an API key, and paste it here. Press Enter to skip and continue");
    log("installing without sign-in (you can run `hivemind login` later).");
    log("");

    const MAX_PASTE_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt++) {
      const pasted = await promptLine("API key: ");
      if (!pasted) break;
      signedIn = await loginWithProvidedToken(pasted);
      if (signedIn) break;
      const remaining = MAX_PASTE_ATTEMPTS - attempt;
      if (remaining > 0) {
        log("");
        log(`That key wasn't accepted (likely invalid or revoked). Try again (${remaining} attempt${remaining === 1 ? "" : "s"} left) or press Enter to skip.`);
        log("");
      }
    }

    if (!signedIn) {
      log("");
      log("Continuing install without sign-in. Run `hivemind login` later, or");
      log("rerun with `HIVEMIND_TOKEN=<key> hivemind install`.");
    }
  }
}

async function runInstallAll(args: string[]): Promise<void> {
  const only = parseOnly(args);
  const skipAuth = hasFlag(args, "--skip-auth");
  const withEmbeddings = hasFlag(args, "--with-embeddings");

  const targets: PlatformId[] = only ?? detectPlatforms().map(p => p.id);

  if (targets.length === 0) {
    log("No supported assistants detected.");
    log("Supported: Claude Code, Codex, OpenClaw, Cursor, Hermes Agent, Pi, Claude Cowork.");
    log("Install one and rerun `hivemind install`, or target a specific assistant: `hivemind cursor install`.");
    return;
  }

  log(`Installing hivemind ${getVersion()} for: ${targets.join(", ")}`);
  log("");

  if (!skipAuth && !isLoggedIn()) {
    await runAuthGate(args);
  }

  for (const id of targets) runSingleInstall(id);

  if (withEmbeddings) {
    log("");
    installEmbeddings();
  }

  await maybeShowOrgChoice();

  // Kick off the one-shot memory backfill in the background: stage knowledge
  // from the user's past local agent sessions (claude/codex/…) without
  // blocking install. Auth-free (it stages to disk); a later
  // `hivemind memory flush` uploads it once signed in. Detached + sentinel-
  // guarded, so this is a no-op on subsequent installs.
  const backfill = maybeAutoBackfillMemory();
  if (backfill.triggered) {
    log("");
    log("Mining your past sessions for team memory in the background — sign in, then run `hivemind memory flush` to push.");
  }

  // Docs onboarding at install — extracted to src/docs/install-docs.ts so the
  // decision + detached-worker spawn are unit-tested. Everything effectful is
  // injected here; a docs hiccup must never break install (guarded inside).
  const { homedir } = await import("node:os");
  const { tryGitTopLevel } = await import("../graph/git-hook-install.js");
  const { loadConfig } = await import("../config.js");
  const { spawnDetachedNodeWorker } = await import("../utils/spawn-detached.js");
  const { isAutoEnabled } = await import("../docs/auto-registry.js");
  const { deriveProjectKey } = await import("../utils/repo-identity.js");
  const { runInstallDocsOnboarding } = await import("../docs/install-docs.js");
  await runInstallDocsOnboarding({
    cwd: process.cwd(),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    loggedIn: isLoggedIn(),
    home: homedir(),
    gitTopLevel: (cwd) => tryGitTopLevel(cwd),
    loadCfg: () => loadConfig(),
    autoEnabled: (orgId, root) => isAutoEnabled(orgId, deriveProjectKey(root).key),
    // Build inline (fast, no LLM) so the wiki worker has a snapshot + the
    // page estimate is real. Heavy graph deps stay lazy.
    buildGraph: async (root) => {
      const { runBuildCommand } = await import("../commands/graph.js");
      await runBuildCommand(["--cwd", root, "--trigger", "manual"]);
    },
    onboard: async ({ root, orgId, orgName }) => {
      const { runDocsOnboarding } = await import("../docs/onboarding.js");
      const { deriveProjectKey } = await import("../utils/repo-identity.js");
      const { loadCurrentSnapshot } = await import("../graph/load-current.js");
      return runDocsOnboarding({
        root, isGitRepo: true, orgId, orgName,
        project: deriveProjectKey(root).key,
        snap: loadCurrentSnapshot(root),
      });
    },
    spawn: (workerArgs) => {
      const cliEntry = process.argv[1];
      if (!cliEntry) return false;
      spawnDetachedNodeWorker(cliEntry, workerArgs);
      return true;
    },
    showHint: () => {
      if (docsHintShown()) return;
      log("");
      for (const line of docsInstallLines()) log(line);
      markDocsHintShown();
    },
    log,
    warn,
  });

  log("");
  log("Done. Restart each assistant to activate hooks.");
}

function runSingleInstall(id: PlatformId): void {
  try {
    if (id === "claude") installClaude();
    else if (id === "codex") installCodex();
    else if (id === "claw") installOpenclaw();
    else if (id === "cursor") installCursor();
    else if (id === "hermes") installHermes();
    else if (id === "pi") installPi();
    else if (id === "claude_cowork") installCowork();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${(err as Error).message}`);
  }
}

function runSingleUninstall(id: PlatformId): void {
  try {
    if (id === "claude") uninstallClaude();
    else if (id === "codex") uninstallCodex();
    else if (id === "claw") uninstallOpenclaw();
    else if (id === "cursor") uninstallCursor();
    else if (id === "hermes") uninstallHermes();
    else if (id === "pi") uninstallPi();
    else if (id === "claude_cowork") uninstallCowork();
  } catch (err) {
    warn(`  ${id.padEnd(14)} FAILED: ${(err as Error).message}`);
  }
}

function runStatus(): void {
  const detected = detectPlatforms();
  log(`hivemind ${getVersion()}`);
  log(`logged in: ${isLoggedIn() ? "yes" : "no"}`);
  log("");
  log("Detected assistants:");
  if (detected.length === 0) log("  (none)");
  for (const p of detected) log(`  ${p.id.padEnd(8)} ${p.markerDir}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    log(USAGE);
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    log(getVersion());
    return;
  }

  if (cmd === "install") { await runInstallAll(args.slice(1)); return; }
  if (cmd === "uninstall") {
    const only = parseOnly(args.slice(1));
    const targets: PlatformId[] = only ?? detectPlatforms().map(p => p.id);
    for (const id of targets) runSingleUninstall(id);
    return;
  }

  if (cmd === "login") { await ensureLoggedIn(parseRef(args.slice(1))); return; }
  if (cmd === "status") { runStatus(); return; }
  if (cmd === "update") {
    const code = await runUpdate({ dryRun: hasFlag(args.slice(1), "--dry-run") });
    process.exit(code);
  }

  if (cmd === "skillify") {
    runSkillifyCommand(args.slice(1));
    return;
  }

  if (cmd === "rules") {
    await runRulesCommand(args.slice(1));
    return;
  }

  if (cmd === "goal" || cmd === "goals") {
    await runGoalCommand(args.slice(1));
    return;
  }

  if (cmd === "kpi" || cmd === "kpis") {
    await runKpiCommand(args.slice(1));
    return;
  }

  if (cmd === "docs" || cmd === "doc") {
    await runDocsCommand(args.slice(1));
    return;
  }

  if (cmd === "context") {
    await runContextCommand(args.slice(1));
    return;
  }

  if (cmd === "graph") {
    // `graph init` sets up the auto-build. Provision the tree-sitter parsers
    // into the shared embed-deps dir the graph-on-stop hook resolves from, so
    // the automatic rebuild works — not just this CLI run (which resolves
    // tree-sitter from its own package). Idempotent + best-effort; decoupled
    // from the ~600 MB embeddings download.
    if (args[1] === "init") {
      try { ensureGraphDeps(); } catch { /* best-effort — never block graph init */ }
    }
    let runGraphCommand: (a: string[]) => Promise<void> | void;
    try {
      ({ runGraphCommand } = await import("../commands/graph.js"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("tree-sitter") || (err as { code?: string })?.code === "ERR_MODULE_NOT_FOUND") {
        console.error(
          "hivemind graph requires the optional 'tree-sitter' native module, which is not installed.\n" +
            "It can fail to build on some platforms (e.g. Node 24 / arm64). Everything else in Hivemind\n" +
            "works without it. To enable the codebase graph, reinstall with a toolchain that can build\n" +
            "native addons, or install tree-sitter manually in the package directory.",
        );
        process.exit(1);
      }
      throw err;
    }
    await runGraphCommand(args.slice(1));
    return;
  }

  if (cmd === "dashboard") {
    const code = await runDashboardCommand(args.slice(1));
    process.exit(code);
  }

  if (cmd === "embeddings") {
    const sub = args[1];
    if (sub === "install") { installEmbeddings(); return; }
    if (sub === "enable") { enableEmbeddings(); return; }
    if (sub === "disable") { disableEmbeddings(); return; }
    if (sub === "uninstall") {
      uninstallEmbeddings({ prune: hasFlag(args.slice(2), "--prune") });
      return;
    }
    if (sub === "status") { statusEmbeddings(); return; }
    warn("Usage: hivemind embeddings install | enable | disable | uninstall [--prune] | status");
    process.exit(1);
  }

  if (cmd === "memory") {
    const sub = args[1];
    if (sub === "backfill") {
      const code = await runBackfillMemory(args.slice(2));
      process.exit(code);
    }
    if (sub === "flush") {
      const r = await runFlushMemory();
      if (r.reason === "not-logged-in") {
        warn("Not logged in — run `hivemind login` before flushing staged memory.");
        process.exit(1);
      }
      log(`memory flush: uploaded ${r.uploaded}/${r.pending} staged summary(ies)` +
        `${r.failed ? `, ${r.failed} failed` : ""}.`);
      return;
    }
    warn("Usage: hivemind memory backfill [--dry-run] [--force] [--n <num|all>] [--window-days N] [--project-only] [--verbose] | flush");
    process.exit(1);
  }

  // Account / org / workspace subcommands — passthrough to the auth-login dispatcher.
  if (AUTH_SUBCOMMANDS.has(cmd)) {
    await runAuthCommand(args);
    return;
  }

  const platformCmds: PlatformId[] = ["claude", "codex", "claw", "cursor", "hermes", "pi", "claude_cowork"];
  if (platformCmds.includes(cmd as PlatformId)) {
    const sub = args[1];
    if (sub === "install") {
      runSingleInstall(cmd as PlatformId);
      if (hasFlag(args.slice(2), "--with-embeddings")) {
        log("");
        installEmbeddings();
      }
    }
    else if (sub === "uninstall") runSingleUninstall(cmd as PlatformId);
    else { warn(`Usage: hivemind ${cmd} install [--with-embeddings] | uninstall`); process.exit(1); }
    return;
  }

  warn(`Unknown command: ${cmd}`);
  log(USAGE);
  process.exit(1);
}

main().catch(err => {
  warn(`hivemind: ${(err as Error).message}`);
  process.exit(1);
});
