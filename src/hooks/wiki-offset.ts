/**
 * Offset bookkeeping for the wiki summary workers.
 *
 * The summary is regenerated incrementally: each run reads how many session
 * rows were already summarized (the offset) and feeds the agent only the rows
 * after it. Two helpers keep that offset stable and the input bounded:
 *
 *  - `stampOffset` writes the offset into the persisted summary itself, so the
 *    value never depends on the LLM echoing a bookkeeping line back. The
 *    sidecar (summary-state) is the primary source of truth; this keeps the
 *    stored summary's offset authoritative too (the cross-machine fallback).
 *  - `capLinesByBytes` bounds the JSONL handed to the agent by byte size,
 *    keeping the MOST RECENT rows. The offset already bounds a normal run to
 *    its increment; this is the safety net for the first summary of an
 *    already-huge session, or a single giant row.
 */

/** Max bytes of session JSONL fed to the summarizer in one run. */
export const WIKI_JSONL_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Max session rows the DB fallback fetches, newest-first. The old fallback did an
 * unbounded `ORDER BY creation_date ASC` with no limit, which materializes the WHOLE fat
 * `message` column — tens of MB, ~30s cold on a mega-session — even though the summarizer
 * only ever consumes the newest un-summarized rows (`capLinesByBytes` discards the rest).
 * This caps the fetch to a superset of what any one run can use.
 */
export const WIKI_FALLBACK_MAX_ROWS = 2000;

/**
 * Select the un-summarized "new" rows from a BOUNDED newest-N window.
 *
 * The workers fetch the whole session ASC and take `rows.slice(prevOffset)`, where
 * `prevOffset` is a count over the FULL history. When the fetch is instead bounded to the
 * newest `window.length` rows (of a `total`-row session), that full-history index no longer
 * addresses the window, so the plain slice is wrong. This maps it correctly:
 *
 *   newCount = max(0, total - prevOffset)   // rows added since the last summary
 *   → the LAST `newCount` rows of the window are the un-summarized ones.
 *
 * When the window doesn't reach back to `prevOffset` (the session grew by more than the
 * window since the last summary), `newCount >= window.length` and the whole window is
 * returned — the older new rows fell outside the fetch, exactly the ones `capLinesByBytes`
 * would drop anyway (it keeps the newest). So bounding never changes what a run summarizes
 * beyond what the byte cap already does. `prevOffset <= 0` returns the whole window.
 */
export function newRowsFromWindow<T>(window: readonly T[], total: number, prevOffset: number): T[] {
  if (prevOffset <= 0) return window.slice();
  const newCount = Math.max(0, total - prevOffset);
  if (newCount >= window.length) return window.slice();
  return window.slice(window.length - newCount);
}

/** Matches the offset line in a stored summary, regardless of leading bullet.
 *  Single source of truth for both detection (stampOffset) and extraction
 *  (parseOffset) so the round-trip contract can't drift. */
const OFFSET_RE = /\*\*JSONL offset\*\*:\s*(\d+)/;

/** Same pattern used by the workers to READ the offset back. */
export function parseOffset(summary: string): number | null {
  const m = summary.match(OFFSET_RE);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Return `summary` with its `**JSONL offset**: N` line set to `offset`.
 * Replaces an existing line (preserving its leading bullet) or, if none is
 * present, inserts one right after the title line.
 */
export function stampOffset(summary: string, offset: number): string {
  const line = `**JSONL offset**: ${offset}`;
  if (OFFSET_RE.test(summary)) return summary.replace(OFFSET_RE, line);
  const nl = summary.indexOf("\n");
  if (nl === -1) return `${summary}\n- ${line}\n`;
  return `${summary.slice(0, nl + 1)}- ${line}\n${summary.slice(nl + 1)}`;
}

/**
 * Keep the newest lines whose total serialized size (with `\n` separators)
 * stays within `maxBytes`, dropping the oldest. Always keeps at least the last
 * line even if it alone exceeds the budget. Returns the kept lines (in original
 * order) and how many were dropped, so the caller can log it — never a silent
 * truncation.
 *
 * INTENTIONAL TRADEOFF: the workers advance the offset to the full row total
 * even when `dropped > 0`, so the dropped (oldest) rows are NOT re-summarized on
 * a later run. This only fires in a degenerate case — a single increment over
 * `maxBytes`, i.e. the first summary of an already-huge backlog (offset 0) or a
 * lone giant row. With a correct offset, normal increments are tiny and nothing
 * is ever dropped. In the rare overflow we deliberately keep the most RECENT
 * content (the useful "current state" for resuming) over exhaustive coverage of
 * ancient rows, and log the skip.
 *
 * A single retained line can itself exceed `maxBytes` (one giant event, e.g. a
 * huge tool output). We keep it but truncate its bytes so the JSONL handed to
 * the agent is always bounded — otherwise a lone oversized row would reopen the
 * timeout risk this cap exists to prevent. `truncated` reports whether that
 * happened so the caller can log it.
 */
export function capLinesByBytes(lines: string[], maxBytes: number): { kept: string[]; dropped: number; truncated: boolean } {
  if (lines.length === 0) return { kept: [], dropped: 0, truncated: false };
  let start = lines.length - 1;
  let total = Buffer.byteLength(lines[start], "utf8");
  for (let i = lines.length - 2; i >= 0; i--) {
    const size = Buffer.byteLength(lines[i], "utf8") + 1;
    if (total + size > maxBytes) break;
    total += size;
    start = i;
  }
  const kept = lines.slice(start);
  // Only a lone retained line can still exceed the budget (the loop keeps
  // cumulative size within maxBytes for every other case). Truncate it.
  let truncated = false;
  if (kept.length === 1 && Buffer.byteLength(kept[0], "utf8") > maxBytes) {
    kept[0] = truncateUtf8(kept[0], maxBytes);
    truncated = true;
  }
  return { kept, dropped: start, truncated };
}

/** Truncate `s` to at most `maxBytes` UTF-8 bytes, dropping any partial
 *  trailing multibyte character cleanly. */
function truncateUtf8(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(buf.subarray(0, maxBytes)).replace(/�+$/, "");
}

/**
 * Did THIS run's agent actually write the summary?
 *
 * Exit 0 is not proof of work: a child that cannot reach the scratch dir (an
 * enterprise policy disabling bypassPermissions, say) exits 0 having written
 * nothing, leaving the pre-seeded summary in place. Uploading that unchanged
 * placeholder still advances the offset and slices the unread events away
 * forever, so the worker must be able to tell "wrote nothing" from "wrote".
 *
 * Content equality alone cannot: an agent that legitimately regenerates the
 * same text would read as a no-op and freeze the offset. So the baseline
 * stamps the file a minute into the past and the check compares timestamps —
 * any real write lands far outside any plausible filesystem granularity.
 *
 * When the filesystem will not cooperate (utimes throwing or silently doing
 * nothing) the timestamp proves nothing, and the check falls back to content.
 * That errs toward skipping: re-summarizing the same rows next run wastes work,
 * whereas a wrong upload destroys events. Never the other way round.
 */
export interface SummaryBaseline {
  mtimeMs: number;
  /** False when utimes threw or left the timestamp unchanged. */
  trusted: boolean;
}

const SUMMARY_BACKDATE_MS = 60_000;

export function markSummaryUnwritten(
  path: string,
  fs: Pick<typeof import("node:fs"), "existsSync" | "utimesSync" | "statSync">,
): SummaryBaseline {
  if (!fs.existsSync(path)) return { mtimeMs: 0, trusted: true };
  const sentinel = new Date(Date.now() - SUMMARY_BACKDATE_MS);
  try {
    fs.utimesSync(path, sentinel, sentinel);
    const mtimeMs = fs.statSync(path).mtimeMs;
    // A filesystem that ignores utimes reports something far from the sentinel.
    return { mtimeMs, trusted: Math.abs(mtimeMs - sentinel.getTime()) < 2_000 };
  } catch {
    return { mtimeMs: 0, trusted: false };
  }
}

export function summaryWasWritten(
  path: string,
  baseline: SummaryBaseline,
  contentChanged: boolean,
  fs: Pick<typeof import("node:fs"), "statSync">,
): boolean {
  if (!baseline.trusted) return contentChanged;
  try {
    return fs.statSync(path).mtimeMs !== baseline.mtimeMs;
  } catch {
    return contentChanged;
  }
}
