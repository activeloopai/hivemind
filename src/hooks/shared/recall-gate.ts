/**
 * Proactive-recall gate — decides whether a user prompt is worth a memory
 * search BEFORE paying for one.
 *
 * Searching on every prompt is wrong: most turns are acks/continuations with
 * no relevant memory, so an unconditional search adds latency to every turn
 * and injects low-relevance noise that trains the model to ignore the block.
 * This gate keeps the lookup rare and high-precision; the lexical relevance
 * bar in src/recall/policy.ts is the second, stricter filter. Bias: when in
 * doubt, SKIP — a missed recall is invisible, a noisy injection every turn is
 * actively annoying.
 *
 * Pure + side-effect-free so it is exhaustively unit-testable; all tuning
 * lives in the exported constants.
 */

/** Minimum substantive prompt length (chars) before we consider searching. */
const MIN_PROMPT_CHARS = 24;
/** Minimum word count for the "substantive prose" path. */
const MIN_PROMPT_WORDS = 6;

// Short acknowledgements / continuations — never recall-worthy on their own.
const ACK_RE =
  /^(y|n|yes|yep|yeah|no|nope|ok|okay|kk|k|sure|go|go on|go ahead|continue|cont|proceed|next|do it|please do|thanks|thank you|ty|thx|nice|great|perfect|cool|done|stop|wait|hold on|undo|revert|retry|try again|again|run it|run them|rerun|fix it|fix that|fix this|same|yep do it)\b[\s.!?]*$/i;

// STRONG signal markers — an unambiguous reason to check prior work, so they
// win regardless of prompt length (a 3-word "segfault on scan" must recall).
const STRONG_SIGNAL_RES: RegExp[] = [
  // Errors / failures / stack traces
  /\b(error|exception|traceback|stack ?trace|panic|segfault|sigsegv|sigabrt|assertion|failed|failing|crash(ed|ing)?|throws?|undefined|null pointer|cannot find|not found|unresolved|deadlock|timeout|oom|leak)\b/i,
  /\b[\w./-]+:\d+(:\d+)?\b/, // file:line(:col) reference
  /\b[A-Z][A-Za-z0-9]*(Error|Exception)\b/, // TypeError, FooException
  // Recall / continuity intent ("how did we …", "last time", "known issue")
  /\b(remember|recall|last time|previously|before|earlier|we (did|used|tried|decided|chose|hit|saw|had)|did we|have we|how did we|what did we|where did we|known issue|again)\b/i,
];

// WEAK signal — a bare generic question / how-to phrasing. On its own this is
// NOT enough to recall: short conversational follow-ups ("which folder",
// "what's the cap?") match it but should be skipped. It only upgrades a prompt
// that ALSO clears the substantive-length bar to a "signal" recall.
const QUESTION_RE =
  /\b(how (do|to|can|should)|why (does|is|are|did)|what(?:'s| is| are)|where (is|are|do)|which|when should)\b/i;

export interface RecallDecision {
  /** Whether to run the memory search for this prompt. */
  recall: boolean;
  /** Short machine reason (telemetry): "ack" | "too-short" | "signal" | "substantive" | "low-signal". */
  reason: string;
}

/**
 * Decide whether `prompt` warrants a proactive memory search.
 * Order matters: acks and STRONG signals are evaluated BEFORE the length gate,
 * so short-but-high-signal prompts ("TypeError in auth", "segfault on scan",
 * "how did we fix X?") still recall. A bare generic question word is only a
 * WEAK signal — it must also clear the substantive-length bar, so short
 * conversational follow-ups ("which folder", "what's the cap?") are skipped.
 */
export function shouldRecall(prompt: string | undefined | null): RecallDecision {
  const text = (prompt ?? "").trim();
  if (!text) return { recall: false, reason: "empty" };
  // Acks/continuations are never recall-worthy, regardless of length.
  if (ACK_RE.test(text)) return { recall: false, reason: "ack" };
  // Strong error / recall signals win regardless of length.
  if (STRONG_SIGNAL_RES.some((re) => re.test(text))) return { recall: true, reason: "signal" };
  // Everything else must clear the substantive-length bar (a real request/
  // description), not a terse mid-task instruction or a short follow-up
  // question. This is what keeps "which folder" / "what's the cap?" out.
  if (text.length < MIN_PROMPT_CHARS) return { recall: false, reason: "too-short" };
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_PROMPT_WORDS) return { recall: false, reason: "low-signal" };
  // Substantive length: a question/how-to phrasing makes it a "signal" recall;
  // otherwise it's substantive prose. Both recall.
  return { recall: true, reason: QUESTION_RE.test(text) ? "signal" : "substantive" };
}
