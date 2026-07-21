/**
 * Proactive-recall gate — decides whether a user prompt is worth a memory
 * search BEFORE paying for one.
 *
 * Searching on every prompt is wrong: most turns are acks/continuations with
 * no relevant memory, so an unconditional search adds latency to every turn
 * and injects low-relevance noise that trains the model to ignore the block.
 * This gate keeps the expensive path (embed + vector query) rare and
 * high-precision. Bias: when in doubt, SKIP — a missed recall is invisible,
 * a noisy injection every turn is actively annoying.
 *
 * Pure + side-effect-free so it is exhaustively unit-testable; all tuning
 * lives in the exported constants.
 */

/**
 * Opt-out for PROACTIVE RECALL specifically — the aggressive behavior of
 * auto-searching team memory on every recall-worthy prompt and INJECTING a hit
 * into the agent's context. This is distinct from:
 *   - session CAPTURE (HIVEMIND_CAPTURE) — storing your sessions, and
 *   - the agent's own REACTIVE recall (grep / the memory skill) — which it
 *     initiates itself.
 * Disabling this leaves capture and reactive recall untouched; it only stops
 * the automatic search-and-inject.
 *
 * ENABLED BY DEFAULT. Disable via EITHER (both accepted; case-insensitive,
 * whitespace-tolerant):
 *   - HIVEMIND_PROACTIVE_RECALL          = 0 | false | no | off
 *   - HIVEMIND_PROACTIVE_RECALL_DISABLED = 1 | true | yes | on
 */
export function proactiveRecallDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (/^(1|true|yes|on)$/i.test((env.HIVEMIND_PROACTIVE_RECALL_DISABLED ?? "").trim())) return true;
  if (/^(0|false|no|off)$/i.test((env.HIVEMIND_PROACTIVE_RECALL ?? "").trim())) return true;
  return false;
}

/**
 * Cosine score (0..1, higher = closer) a hit must clear to be injected.
 *
 * Default kept at 0.55. A looser ~0.50 may help — a realistic full-sentence
 * `query` vs the `document` embedding of a long wiki summary can land in the
 * 0.50–0.55 band even when relevant — but that's SEMANTIC-only and didn't
 * reliably improve outcomes in measurement, so it's left as an operator override
 * (HIVEMIND_RECALL_THRESHOLD=0.5) rather than the default.
 */
const DEFAULT_RECALL_THRESHOLD = 0.55;

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

/** True when a hit's cosine score clears the injection threshold. */
export function passesThreshold(score: number, threshold: number = RECALL_THRESHOLD): boolean {
  return Number.isFinite(score) && score >= threshold;
}

/**
 * Minimum distinct salient keywords a summary must share with the prompt for a
 * LEXICAL (no-embeddings) recall to inject. Lexical hits have no relevance
 * score, so co-occurrence of >=N meaningful terms is the precision proxy.
 */
/** Parse a positive-number env override; fall back on NaN / 0 / negative so a
 *  bad value can't silently break a timeout or relevance threshold. */
export function parsePositive(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MIN_LEXICAL_OVERLAP = parsePositive(process.env.HIVEMIND_RECALL_MIN_OVERLAP, 2);

/**
 * Operator-tunable cosine injection threshold. Honors HIVEMIND_RECALL_THRESHOLD
 * but only when it is a sane probability (0 < t <= 1); anything else falls back
 * to the default so a typo can't silently disable or over-restrict recall.
 */
export const RECALL_THRESHOLD: number = (() => {
  const n = Number(process.env.HIVEMIND_RECALL_THRESHOLD);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_RECALL_THRESHOLD;
})();

// Common words carry no recall signal — matching them would surface noise.
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that",
  "have", "has", "had", "was", "were", "can", "could", "should", "would", "will",
  "does", "did", "what", "why", "how", "when", "where", "which", "who", "into",
  "from", "they", "them", "then", "than", "there", "here", "out", "get", "got",
  "use", "using", "used", "make", "made", "want", "need", "please", "let", "add",
  "fix", "run", "set", "all", "any", "our", "its", "his", "her", "now", "new",
  "some", "more", "most", "such", "only", "also", "just", "like", "able", "via",
]);

/**
 * Extract salient lower-cased keywords from a prompt for the lexical fallback.
 * Keeps identifier-ish tokens (snake_case, dotted, paths), drops stopwords and
 * sub-3-char tokens, de-dupes, and caps the count.
 */
export function extractKeywords(prompt: string | undefined | null, max = 8): string[] {
  const raw = (prompt ?? "").toLowerCase().match(/[a-z0-9][a-z0-9_./-]{2,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of raw) {
    const w = tok.replace(/[._/-]+$/, ""); // trim trailing separators
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}
