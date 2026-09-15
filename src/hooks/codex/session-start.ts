#!/usr/bin/env node

/**
 * Codex SessionStart hook (fast path):
 * Only reads local credentials and injects context into Codex's developer prompt.
 * All server calls (table setup, placeholder, version check) are handled by
 * session-start-setup.js which runs as a separate async hook.
 *
 * Codex input:  { session_id, transcript_path, cwd, hook_event_name, model, source }
 * Codex output: plain text on stdout (added as developer context)
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCredentials, healDriftedOrgToken, resolveWorkspaceOverride } from "../../commands/auth.js";
import { readStdin } from "../../utils/stdin.js";
import { countLocalManifestEntries } from "../../skillify/local-manifest.js";
import { maybeAutoMineLocal } from "../../skillify/spawn-mine-local-worker.js";
import { log as _log } from "../../utils/debug.js";
import { getInstalledVersion } from "../../utils/version-check.js";
import { autoPullSkills } from "../../skillify/auto-pull.js";
import { spawnGraphPullWorker } from "../../graph/spawn-pull-worker.js";
import type { Notification } from "../../notifications/index.js";
import { drainSessionStart, enqueueNotification, registerRule } from "../../notifications/index.js";
import { bumpSessionCount } from "../../notifications/state.js";
import { referralInviteRule } from "../../notifications/rules/referral-invite.js";
import { renderCodexChannels } from "../../notifications/delivery/codex.js";
const log = (msg: string) => _log("codex-session-start", msg);

/** How long this hook waits on the notifications drain before emitting
 *  without it. Codex kills the hook at 10s and this hook also carries the
 *  memory/login context, so the drain never gets to be the reason the whole
 *  output is lost. */
const DRAIN_DEADLINE_MS = 4000;

/** Hard ceiling for the whole hook. Codex kills it at 10s (see buildHooksJson
 *  in src/cli/install-codex.ts) and discards EVERYTHING when it does — the
 *  user sees `SessionStart hook (failed) error: hook timed out after 10s` and
 *  loses the login context AND any billing CTA. Observed in real sessions.
 *  Bounding only the drain was not enough: the auto-pull, the org-token heal
 *  and module init all sit outside it. Emit whatever we have by this point. */
const HOOK_BUDGET_MS = 7000;

/** Resolves after `ms`. `unref` so a pending timer can't hold the process
 *  open once the hook has written its output. */
function deadline(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

// Same rule registration as Claude Code's notifications hook
// (src/hooks/session-notifications.ts). Rules are pure — registering them
// costs nothing when none fire.
registerRule(referralInviteRule);

const __bundleDir = dirname(fileURLToPath(import.meta.url));
// Codex DOES NOT have a model-only context channel for SessionStart hooks: any
// `additionalContext` we emit is rendered as a `hook context: <text>` history
// cell, user-visible. The big DEEPLAKE MEMORY tier doc + hivemind/skillify
// command list that Claude Code's hook injects via `additionalContext` would
// clobber the Codex UI every session, so we omit it entirely here. Codex's
// skill autoloader already exposes the hivemind/* skills as Skill tool entries,
// and the model can discover memory tiers and CLI flags on demand via bash.
// See src/notifications/AGENT_CHANNELS.md → "Codex" for the source-level reasoning.

interface CodexSessionStartInput {
  session_id: string;
  transcript_path?: string | null;
  cwd: string;
  hook_event_name: string;
  model: string;
  source?: string;
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  const input = await readStdin<CodexSessionStartInput>();

  let creds = loadCredentials();
  let workspaceWarning = "";

  if (!creds?.token) {
    log("no credentials found — run auth login to authenticate");
    const auto = maybeAutoMineLocal();
    log(`auto-mine: ${auto.triggered ? "triggered (background)" : `skipped (${auto.reason})`}`);
  } else {
    log(`credentials loaded: org=${creds.orgName ?? creds.orgId}`);
    creds = await healDriftedOrgToken(creds, log);
    // Must run before the setup worker is spawned so it reads the learned alias.
    const wsOverride = await resolveWorkspaceOverride(creds, log, input.cwd ?? process.cwd());
    creds = wsOverride.creds;
    workspaceWarning = wsOverride.warning ? `\n${wsOverride.warning}` : "";
  }

  // Spawn async setup (graph-deps provisioning, table creation, placeholder,
  // version check) as a detached process. Codex doesn't support async hooks,
  // so we use the same pattern as the wiki worker.
  //
  // Spawned UNCONDITIONALLY — not gated on creds. The setup worker runs
  // ensureGraphDeps() (purely local code-graph provisioning) BEFORE its own
  // credentials early-return, so it must fire even when logged out. The
  // remote/credentialed work (autoupdate, table + placeholder) stays gated
  // INSIDE the worker on its `if (!creds?.token) return`.
  {
    const setupScript = join(__bundleDir, "session-start-setup.js");
    const child = spawn("node", [setupScript], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      // SW_HIDE: libuv applies it alongside detached. No-op on POSIX.
      windowsHide: true,
      env: { ...process.env },
    });
    // Feed the same stdin input to the setup process
    child.stdin?.write(JSON.stringify(input));
    child.stdin?.end();
    child.unref();
    log("spawned async setup process");
  }

  // Auto-pull skills from all org users on every SessionStart (5s timeout).
  // File writes inside runPull are idempotent (skipped when local version
  // is at-or-newer than remote), so re-running every session is cheap on
  // disk; the only per-call cost is the SQL round-trip. autoPullSkills
  // never rejects — all errors are swallowed inside. Hard opt-out:
  // HIVEMIND_AUTOPULL_DISABLED=1.
  // Notifications drain. Until this landed, Codex users never saw ANY
  // notification the framework produced — most damagingly the
  // `balance-exhausted` banner enqueued by deeplake-api's 402 handler. The
  // result was hivemind failing completely silently on Codex: captures and
  // recalls returned nothing and no CTA to top up ever surfaced (reported
  // 2026-08-12 in #platform).
  //
  // The drain writes nothing itself — Codex accepts exactly ONE JSON object
  // on a hook's stdout and this hook already owns it, so we collect the
  // claimed notifications via the `deliver` override and merge them into the
  // single output object below.
  //
  // Run in parallel with the auto-pull so the drain's fetches don't add to
  // this blocking hook's wall time. drainSessionStart never throws (it
  // catches internally); autoPullSkills never rejects.
  //
  // Deadline: unlike Claude Code — where the drain is its own hook command —
  // this hook must ALSO deliver the memory/login context, and Codex kills the
  // hook at 10s (see buildHooksJson in src/cli/install-codex.ts). A slow
  // drain (goals SQL retries behind a stalled network) would take the whole
  // hook down with it and drop everything, so we stop waiting well before
  // that. If the drain lands late, its notifications go back on the queue
  // for the next session rather than being marked shown but never rendered.
  const rawSessionId = typeof input.session_id === "string" ? input.session_id.trim() : "";
  const sessionId = rawSessionId.length > 0 ? rawSessionId : undefined;
  const sessionCount = bumpSessionCount(sessionId);
  let notified: Notification[] = [];
  let emitted = false;
  const drained = drainSessionStart({
    agent: "codex",
    creds,
    sessionId,
    source: input.source,
    sessionCount,
    deliver: (ns) => {
      if (!emitted) { notified = ns; return; }
      log(`notifications arrived after the deadline — re-queuing ${ns.length}`);
      for (const n of ns) enqueueNotification(n).catch(() => undefined);
    },
  });
  const [pullResult] = await Promise.all([
    autoPullSkills(),
    Promise.race([drained, deadline(DRAIN_DEADLINE_MS)]),
  ]);
  emitted = true;
  log(`autopull: pulled=${pullResult.pulled} skipped=${pullResult.skipped}`);
  log(`notifications: ${notified.length} claimed`);

  let versionNotice = "";
  const current = getInstalledVersion(__bundleDir, ".codex-plugin");
  if (current) {
    versionNotice = `\nHivemind v${current}`;
  }

  const localMined = countLocalManifestEntries();
  const skillNoun = localMined === 1 ? "skill" : "skills";

  // Codex SessionStart output schema (verified against
  // https://developers.openai.com/codex/hooks and codex-rs source @ 0.130.0):
  //   - `systemMessage` (top-level): warning shown to the user in the TUI
  //     history cell as `warning: <text>`. Use sparingly — every line lands
  //     in the user's face. Only set on real CTAs.
  //   - `hookSpecificOutput.additionalContext`: ALSO user-visible in Codex,
  //     rendered as `hook context: <text>` in the same history cell. Unlike
  //     Claude Code (where additionalContext is invisible system-prompt
  //     injection), Codex eagerly leaks the model's context to the user.
  //     `common::append_additional_context` in codex-rs pushes the string
  //     to BOTH the user-visible entries vec AND the model context vec —
  //     there is no model-only path. `suppressOutput: true` is parsed but
  //     ignored for SessionStart, so we can't hide it either.
  // Practical consequence: keep additionalContext MINIMAL on Codex. The
  // bulky DEEPLAKE MEMORY tier doc + hivemind/skillify command list that
  // claude-code's hook injects via `context` would clobber the Codex UI
  // every session. Codex's skill autoloader already exposes hivemind/skillify
  // command surfaces via per-skill SKILL.md files; the model can discover
  // memory tiers via `hivemind --help` and `ls ~/.deeplake/memory/` on demand.
  // We therefore emit only login-state + version here, and trust the model
  // to bootstrap the rest.
  // The proactive memory instruction (check team memory + pull rules/goals)
  // is NOT injected here. Codex has no model-only channel — every
  // additionalContext byte is also rendered to the user as a `hook context:`
  // cell, so a per-session block would be visible noise. Instead that guidance
  // lives in the managed hivemind block of `~/.codex/AGENTS.md` (written by
  // install-codex.ts), which Codex auto-loads into the model context every
  // session SILENTLY — no TUI cell. Empirically verified: a sentinel placed in
  // ~/.codex/AGENTS.md reaches the model without surfacing in the transcript.
  // So additionalContext stays minimal: login-state + version only.

  // Async auto-pull of the latest cloud snapshot for HEAD. Detached and
  // truly fire-and-forget — see src/graph/spawn-pull-worker.ts and
  // src/hooks/graph-pull-worker.ts. Lands for the NEXT SessionStart.
  //
  // Gate on creds: pullSnapshot would early-return "skipped-no-auth"
  // anyway when there's no token, but spawning a worker just to have it
  // exit is wasted process churn. The check also keeps the codex
  // session-start "spawn must not fire when unauthenticated" contract
  // (tests/codex/codex-session-start-hook.test.ts).
  if (creds?.token) spawnGraphPullWorker(input.cwd, __bundleDir);

  const additionalContext = creds?.token
    ? `Hivemind: logged in as org ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"}).${workspaceWarning}${versionNotice}`
    : `Hivemind: not logged in. Run \`hivemind login\` to enable shared memory + skill sharing.${versionNotice}`;

  const systemMessage = (!creds?.token && localMined > 0)
    ? `💡 ${localMined} ${skillNoun} mined from your local sessions live in ~/.claude/skills/. Run 'hivemind login' to share them with your team.`
    : undefined;

  // Merge the drained notifications into the single JSON object Codex will
  // accept. Notifications go FIRST in both channels — a "credits exhausted"
  // warning must not be pushed below the routine login-state line.
  const notifChannels = renderCodexChannels(notified);
  const mergedSystemMessage = [notifChannels.systemMessage, systemMessage]
    .filter(Boolean).join("\n\n");
  const mergedContext = [notifChannels.additionalContext, additionalContext]
    .filter(Boolean).join("\n\n");

  const output: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: mergedContext,
    },
  };
  if (mergedSystemMessage) output.systemMessage = mergedSystemMessage;
  console.log(JSON.stringify(output));
}

/**
 * Emit the minimal, always-correct output. Used when the hook blows its budget:
 * a login line still beats codex discarding everything on a 10s timeout.
 */
function emitFallback(): void {
  const creds = loadCredentials();
  const additionalContext = creds?.token
    ? `Hivemind: logged in as org ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"}).`
    : "Hivemind: not logged in. Run `hivemind login` to enable shared memory + skill sharing.";
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}

// Watchdog: whatever happens inside main(), this process must produce its JSON
// before Codex's 10s kill, because Codex discards the ENTIRE hook output on
// timeout — login context and billing CTA alike.
let wroteOutput = false;
const originalLog = console.log.bind(console);
console.log = (...args: unknown[]) => { wroteOutput = true; originalLog(...args); };

const budget = setTimeout(() => {
  if (wroteOutput) return;
  log(`hook budget of ${HOOK_BUDGET_MS}ms exceeded — emitting fallback output`);
  emitFallback();
  process.exit(0);
}, HOOK_BUDGET_MS);
budget.unref?.();

main()
  .catch((e) => {
    log(`fatal: ${e.message}`);
    // Still give Codex something: a login line beats an empty hook cell.
    if (!wroteOutput) emitFallback();
    process.exit(0);
  })
  .finally(() => clearTimeout(budget));
