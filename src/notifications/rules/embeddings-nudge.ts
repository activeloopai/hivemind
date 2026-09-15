/**
 * Embeddings-disabled nudge — a one-time SessionStart banner telling users
 * that proactive recall is off because embeddings aren't installed.
 *
 * On a fresh marketplace install, `@huggingface/transformers` is absent and
 * the recall hook silently no-ops on every prompt — the headline feature of
 * Hivemind is inactive with no user-visible signal. This rule fires once to
 * surface the problem and point at the fix.
 *
 * Fires when: embeddings are in the "no-transformers" state (not installed,
 * not a user opt-out). Suppressed when the user explicitly disabled
 * embeddings — they made an intentional choice and don't need a nudge.
 *
 * Shown exactly once (stable dedupKey). If the user installs embeddings and
 * then uninstalls them again, the nudge won't re-fire — acceptable given the
 * rarity of that path.
 */

import type { Rule } from "../types.js";
import type { EmbeddingsStatus } from "../../embeddings/disable.js";

export const embeddingsNudgeRule: Rule = {
  id: "embeddings-nudge",
  trigger: "session_start",
  evaluate({ embeddingsStatus }) {
    // Only nudge when transformers aren't installed — not when the user
    // explicitly opted out (user-disabled) or when embeddings are working.
    if (embeddingsStatus !== "no-transformers") return null;
    return {
      id: "embeddings-nudge",
      severity: "warn",
      title: "Proactive recall is off — embeddings not installed",
      body: "Run `hivemind embeddings install` to enable semantic memory search. Until then, proactive recall silently skips every prompt.",
      // Stable key → shown once, ever.
      dedupKey: { v: 1 },
    };
  },
};

// Extend NotificationContext with the embeddings status field.
// Declared here to keep the rule self-contained; the hook entry point
// populates it before calling drainSessionStart.
declare module "../types.js" {
  interface NotificationContext {
    /** Pre-read embeddings status — populated by the hook entry point so the
     *  rule stays IO-free. Undefined when the entry point doesn't provide it
     *  (e.g. older test harnesses); treated as "enabled" (no nudge). */
    embeddingsStatus?: EmbeddingsStatus;
  }
}
