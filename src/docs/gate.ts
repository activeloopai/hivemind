/**
 * The doc-edit gate — objective invariants a proposed doc refresh must pass
 * before it is written back. Prose quality has no auto-grader (SkillOpt #6),
 * so the gate deliberately checks only things that ARE objectively decidable:
 *
 *   1. Non-empty, within length cap.
 *   2. SLOW tier is human-curated — auto-refresh is rejected outright (the
 *      protected-section invariant: a fast/automatic edit must never rewrite
 *      slow, hard-won project knowledge).
 *   3. Every anchor in the proposed version references a symbol that still
 *      exists in the graph — no dangling anchors get persisted.
 *   4. Bounded edit (a textual learning rate, SkillOpt): the line-diff between
 *      the previous and proposed content must stay within budget. A refresh
 *      that rewrites the whole doc is rejected as slop, not accepted silently.
 *
 * Pure and synchronous — no I/O, no LLM. Easy to unit-test exhaustively.
 */

import type { GraphSnapshot } from "../graph/types.js";
import type { DocAnchor, DocTier } from "./read.js";

/** Default ceiling on changed lines for a single bounded refresh. */
export const DEFAULT_MAX_CHANGED_LINES = 40;
/** Hard content length cap (mirrors the store's own cap). */
export const GATE_MAX_CONTENT_LENGTH = 50_000;

export interface GateInput {
  tier: DocTier;
  /** The current (previous) doc body. Empty string for a brand-new doc. */
  prevContent: string;
  /** The proposed new doc body from the refresh worker. */
  newContent: string;
  /** The anchors the proposed version would carry. */
  newAnchors: DocAnchor[];
  /** Current graph snapshot — used to confirm anchored symbols still exist. */
  snap: GraphSnapshot;
  /** Override the changed-line budget. */
  maxChangedLines?: number;
  /**
   * Permit slow-tier edits. Default false (slow = human-curated, protected).
   * The ONLY legitimate caller is the wiki update-worker: wiki pages are
   * slow-tier but machine-authored, so their own pipeline may patch them.
   */
  allowSlow?: boolean;
}

export interface GateResult {
  ok: boolean;
  /** Human-readable rejection reasons (empty when ok). */
  reasons: string[];
  /** Number of changed lines measured (for logging / tuning). */
  changedLines: number;
}

/**
 * Count changed lines between two texts via an LCS line diff:
 *   changed = (prevLines - lcs) + (newLines - lcs)
 * This is the classic added+removed edit count — deterministic and stable
 * under line reordering noise (unlike a naive set difference).
 */
export function countChangedLines(prev: string, next: string): number {
  const a = prev === "" ? [] : prev.split("\n");
  const b = next === "" ? [] : next.split("\n");
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  // LCS length via rolling DP (O(n*m) time, O(m) space).
  let prevRow = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const curRow = new Array<number>(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      curRow[j] = a[i - 1] === b[j - 1]
        ? prevRow[j - 1] + 1
        : Math.max(prevRow[j], curRow[j - 1]);
    }
    prevRow = curRow;
  }
  const lcs = prevRow[m];
  return (n - lcs) + (m - lcs);
}

/** Run the gate over a proposed doc edit. */
export function gateDocEdit(input: GateInput): GateResult {
  const reasons: string[] = [];
  const tooLong = input.newContent.length > GATE_MAX_CONTENT_LENGTH;

  if (input.newContent.length === 0) {
    reasons.push("proposed content is empty");
  }
  if (tooLong) {
    reasons.push(`proposed content exceeds ${GATE_MAX_CONTENT_LENGTH} chars (got ${input.newContent.length})`);
  }
  if (input.tier === "slow" && !input.allowSlow) {
    reasons.push("slow-tier docs are human-curated; automatic refresh is not allowed");
  }

  const nodeIds = new Set(input.snap.nodes.map((n) => n.id));
  for (const a of input.newAnchors) {
    if (!nodeIds.has(a.symbol_id)) {
      reasons.push(`anchor references a symbol absent from the graph: ${a.symbol_id}`);
    }
  }

  // Skip the O(n*m) LCS diff when the content is already over the size cap —
  // it would burn CPU on output that is guaranteed to be rejected anyway.
  let changedLines = 0;
  if (!tooLong) {
    changedLines = countChangedLines(input.prevContent, input.newContent);
    const budget = input.maxChangedLines ?? DEFAULT_MAX_CHANGED_LINES;
    if (changedLines > budget) {
      reasons.push(`edit exceeds the bounded-change budget: ${changedLines} > ${budget} lines`);
    }
  }

  return { ok: reasons.length === 0, reasons, changedLines };
}
