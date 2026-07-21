import { describe, expect, it, vi } from "vitest";
import { stableUnionRows } from "../../src/docs/stable-read.js";

const noSleep = async () => {};

/** A query that returns a programmed sequence of row-sets, one per call. */
function scriptedQuery(sequence: Array<Array<Record<string, unknown>>>) {
  let i = 0;
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    const out = sequence[Math.min(i, sequence.length - 1)];
    i++;
    return out;
  });
  return { query, calls };
}

const rows = (...ids: number[]) => ids.map((n) => ({ id: `r${n}`, n }));

describe("stableUnionRows", () => {
  it("unions partial reads into the COMPLETE set (defeats the partial-read bug)", async () => {
    // Simulated backend: returns partial subsets, only occasionally the full 8.
    const { query } = scriptedQuery([
      rows(0, 1, 2, 3, 4),          // 5
      rows(0, 1, 2, 3, 4),          // 5 (repeat — must NOT stop here)
      rows(0, 1, 2, 3, 4, 5, 6, 7), // 8 (full)
      rows(0, 1, 2, 3),             // 4 (regression — union must not shrink)
      rows(0, 1, 2, 3, 4, 5, 6, 7),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
    ]);
    const out = await stableUnionRows(query, "SELECT ...", { sleep: noSleep, stableReads: 3, maxReads: 12 });
    expect(out).toHaveLength(8);
    expect(out.map((r) => r.id).sort()).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
  });

  it("does NOT lock onto a repeated partial result", async () => {
    // 5 appears 3x before the full 8 — a 'two/three consecutive agree' strategy
    // would wrongly return 5. Union-until-stable must still reach 8.
    const { query } = scriptedQuery([
      rows(0, 1, 2, 3, 4),
      rows(0, 1, 2, 3, 4),
      rows(0, 1, 2, 3, 4),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
      rows(0, 1, 2, 3, 4, 5, 6, 7),
    ]);
    const out = await stableUnionRows(query, "SELECT ...", { sleep: noSleep, stableReads: 3, maxReads: 12 });
    expect(out).toHaveLength(8);
  });

  it("converges quickly when reads are already complete and stable", async () => {
    const { query, calls } = scriptedQuery([rows(0, 1, 2)]);
    const out = await stableUnionRows(query, "SELECT ...", { sleep: noSleep, stableReads: 3, maxReads: 12 });
    expect(out).toHaveLength(3);
    // first read grows, then needs `stableReads` non-growing reads -> 4 total.
    expect(calls.length).toBe(4);
  });

  it("respects the maxReads cap and returns the best union so far", async () => {
    // Never returns the full set within the cap; still returns what it unioned.
    const { query, calls } = scriptedQuery([
      rows(0), rows(1), rows(2), rows(3), rows(4),
    ]);
    const out = await stableUnionRows(query, "SELECT ...", { sleep: noSleep, stableReads: 3, maxReads: 5 });
    expect(calls.length).toBe(5);
    expect(out.length).toBe(5); // unioned r0..r4 across the 5 capped reads
  });

  it("skips rows missing the identity key", async () => {
    const { query } = scriptedQuery([[{ id: "r0" }, { nope: 1 }, { id: "" }]]);
    const out = await stableUnionRows(query, "SELECT ...", { sleep: noSleep, stableReads: 2, maxReads: 4 });
    expect(out.map((r) => r.id)).toEqual(["r0"]);
  });
});
