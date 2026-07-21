#!/usr/bin/env node

/**
 * Claude Code SessionStart hook entry point — notifications channel.
 *
 * Wired as a SECOND SessionStart hook command in harnesses/claude-code/hooks/hooks.json,
 * alongside the existing memory/hivemind hook (session-start.js).
 *
 * Bundle target: bundle/session-notifications.js. See esbuild.config.mjs.
 *
 * Failure isolation: any error here is swallowed and the process exits 0.
 * The sibling memory/hivemind hook is not affected.
 */

import { loadCredentials } from "../commands/auth.js";
import { readStdin } from "../utils/stdin.js";
import { drainSessionStart, registerRule } from "../notifications/index.js";
import { bumpSessionCount } from "../notifications/state.js";
import { referralInviteRule } from "../notifications/rules/referral-invite.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("session-notifications", msg);

// Welcome/savings and the anonymous signup brief are rendered by
// pickPrimaryBanner inside drainSessionStart (see sources/primary-banner.ts).
// The referral nudge is a registered rule: it fires once, from the 3rd session
// on, for signed-in users (see rules/referral-invite.ts). localMinedRule
// remains in the tree but unregistered.
registerRule(referralInviteRule);

interface SessionStartInput {
  session_id?: string;
  cwd?: string;
  /** "startup" | "resume" | "clear" | "compact" — Claude Code tells us why the
   *  session started. The "where you left off" banner is only meaningful on a
   *  fresh startup; on a resume you already have the thread, so we suppress it. */
  source?: string;
}

async function main(): Promise<void> {
  // Skip if this is a sub-session spawned by the wiki worker — same guard
  // as session-start.ts. Avoids duplicate work for nested invocations.
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  // Drain stdin so Claude Code's writer doesn't EPIPE. We also extract
  // session_id so primary-banner can scope its dedupKey to the current
  // session — two parallel hook fires for the same session share the
  // same id and dedupe to one emission via the atomic claim file.
  const input = await readStdin<SessionStartInput>().catch(() => ({} as SessionStartInput));
  // Trim + non-empty check: an empty or whitespace-only session_id would
  // collapse the dedupKey across unrelated sessions. pickPrimaryBanner
  // returns null when sessionId is undefined; route there instead of
  // letting an empty string slip through.
  const rawSessionId = typeof input?.session_id === "string" ? input.session_id.trim() : "";
  const sessionId = rawSessionId.length > 0 ? rawSessionId : undefined;
  const source = typeof input?.source === "string" ? input.source : undefined;

  // Advance the per-install session counter (deduped by session_id across the
  // two parallel hook fires) so cadence rules like the referral nudge can wait
  // out the first sessions.
  const sessionCount = bumpSessionCount(sessionId);

  const creds = loadCredentials();
  await drainSessionStart({ agent: "claude-code", creds, sessionId, source, sessionCount });
}

main().catch((e) => { log(`fatal: ${e?.message ?? String(e)}`); process.exit(0); });
