/**
 * Embeddings nudge — a one-time SessionStart banner telling users that
 * semantic memory search is off because embeddings are not enabled.
 *
 * Embeddings default to off (`embeddings.enabled` is seeded `false` in
 * ~/.deeplake/config.json on first read, see user-config.ts), and the
 * transformers deps ship separately via `hivemind embeddings install`. So on
 * a fresh install `embeddingsStatus()` reports "user-disabled" even though
 * the user never chose anything, and the semantic half of memory search is
 * silently inactive. The status enum cannot tell that default apart from a
 * deliberate `hivemind embeddings disable`, so the rule fires on every
 * non-enabled state and relies on the stable dedupKey to show at most once.
 */

import type { Rule } from "../types.js";
import type { EmbeddingsStatus } from "../../embeddings/disable.js";

export const embeddingsNudgeRule: Rule = {
  id: "embeddings-nudge",
  trigger: "session_start",
  evaluate({ embeddingsStatus }) {
    // Undefined means the entry point did not provide a status (older
    // harness wiring); treat as enabled and stay quiet.
    if (embeddingsStatus === undefined || embeddingsStatus === "enabled") return null;
    return {
      id: "embeddings-nudge",
      severity: "warn",
      title: "Semantic memory search is off — embeddings not enabled",
      body: "Run `hivemind embeddings install` to enable semantic search over your team's memory. Until then, memory search is keyword-only.",
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
