/**
 * Read-stability gate for the Deeplake SQL backend.
 *
 * The backend exhibits read-after-write inconsistency: for a window after a
 * burst of INSERTs, the SAME `SELECT` returns a NON-DETERMINISTIC PARTIAL
 * subset of the rows (the backend itself reports the partial count). It
 * eventually converges, but any read in that window can silently miss rows —
 * which for the doc system means `refresh` skips stale docs, and a latest-row
 * read can resolve to an OLD version. (Repro: deeplake-readafterwrite-repro.mjs.)
 *
 * Key property we exploit: every partial read is a SUBSET of the true row set
 * (counts observed range from partial up to the true count, never above). So
 * the UNION of rows across repeated reads monotonically approaches the
 * complete set. We re-read until the union stops growing for `stableReads`
 * consecutive reads (converged), or `maxReads` is hit, and return the union.
 *
 * "Two consecutive reads agree" is NOT used — two consecutive identical
 * partial reads happen often (e.g. 4,4) and would lock onto a partial set.
 * Union-until-stable cannot under-return for rows that appeared in any read.
 */

export type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export interface StableReadOpts {
  /** Unique row-identity column to union on. Default "id". */
  idKey?: string;
  /**
   * Consecutive non-growing reads required to call it converged. Default 3.
   * Higher is safer: a partial result can REPEAT (e.g. 5,5,5 with a true
   * count of 8), so a very low value risks locking onto a partial before a
   * fuller read arrives. The union only grows, so a few confirmations suffice.
   */
  stableReads?: number;
  /** Hard cap on reads. Default 10. */
  maxReads?: number;
  /** Extra delay between reads (ms). Default 0 — HTTP round-trips already space them. */
  delayMs?: number;
  /** Optional logger. */
  log?: (msg: string) => void;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `sql` repeatedly and return the UNION of all distinct rows seen (keyed
 * by `idKey`). Stops early once the union has not grown for `stableReads`
 * consecutive reads. Returns as soon as the first read already looks stable
 * on a tiny set, but always does at least `stableReads` reads so a partial
 * first read can't end the loop prematurely.
 */
export async function stableUnionRows(
  query: QueryFn,
  sql: string,
  opts: StableReadOpts = {},
): Promise<Array<Record<string, unknown>>> {
  const idKey = opts.idKey ?? "id";
  const stableReads = Math.max(1, opts.stableReads ?? 3);
  const maxReads = Math.max(stableReads, opts.maxReads ?? 10);
  // Each read is a separate HTTP round-trip (~hundreds of ms), which already
  // spaces the reads out — an extra artificial delay just adds latency for no
  // consistency benefit. Default 0; callers can set one if a backend ever
  // needs explicit backoff.
  const delayMs = opts.delayMs ?? 0;
  const sleep = opts.sleep ?? defaultSleep;

  const union = new Map<string, Record<string, unknown>>();
  let stableStreak = 0;
  let reads = 0;

  while (reads < maxReads) {
    const rows = await query(sql);
    reads++;
    let grew = false;
    for (const row of rows) {
      const k = String(row[idKey] ?? "");
      if (k === "") continue; // can't union rows without an identity key
      if (!union.has(k)) {
        union.set(k, row);
        grew = true;
      }
    }
    stableStreak = grew ? 0 : stableStreak + 1;
    if (stableStreak >= stableReads) break;
    if (reads < maxReads) await sleep(delayMs);
  }

  opts.log?.(`stable-read: ${union.size} rows after ${reads} reads (streak ${stableStreak})`);
  return [...union.values()];
}
