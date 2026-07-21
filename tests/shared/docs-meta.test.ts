import { describe, expect, it } from "vitest";
import {
  CLAIM_TTL_MS,
  commitRefresh,
  readRefreshMeta,
  tryClaimTurn,
  type RefreshMeta,
} from "../../src/docs/meta.js";
import { docRowId } from "../../src/docs/write.js";

const T = "hivemind_docs";
const P = "github.com/acme/api";
const noSleep = () => Promise.resolve();

/** Query spy: scripted SELECT responses, records every statement. */
function makeQuery(selectResponses: Array<Array<Record<string, unknown>>>) {
  const calls: string[] = [];
  let selectIdx = 0;
  const query = async (sql: string) => {
    calls.push(sql);
    if (/^SELECT/i.test(sql.trim())) {
      return selectResponses[Math.min(selectIdx++, selectResponses.length - 1)] ?? [];
    }
    return [];
  };
  return { query, calls };
}

const metaRow = (meta: Partial<RefreshMeta>, updated_at = "2026-07-08T10:00:00.000Z") => [
  { content: JSON.stringify(meta), updated_at },
];

describe("docRowId", () => {
  it("namespaces by project and scope so shared-table rows cannot collide", () => {
    expect(docRowId(P, "main", "wiki/src/core")).toBe(`${P}|main|wiki/src/core`);
    expect(docRowId(undefined, undefined, "a.ts")).toBe("|main|a.ts");
  });
});

describe("readRefreshMeta", () => {
  it("returns null when the row does not exist", async () => {
    const { query } = makeQuery([[]]);
    expect(await readRefreshMeta(query, T, P)).toBeNull();
  });

  it("parses the JSON content and targets the namespaced _meta id", async () => {
    const { query, calls } = makeQuery([metaRow({ last_refresh_sha: "abc" })]);
    const res = await readRefreshMeta(query, T, P);
    expect(res?.meta.last_refresh_sha).toBe("abc");
    expect(res?.meta.claimed_by).toBeNull();
    expect(calls[0]).toContain(`id = '${P}|main|_meta'`);
  });

  it("survives malformed content (falls back to empty meta, no throw)", async () => {
    const { query } = makeQuery([[{ content: "not json", updated_at: "t" }]]);
    const res = await readRefreshMeta(query, T, P);
    expect(res?.meta).toEqual({ last_refresh_sha: "", claimed_by: null, claimed_at: null, patch_counts: {} });
  });
});

describe("tryClaimTurn", () => {
  const now = () => new Date("2026-07-08T12:00:00.000Z");

  it("loses immediately when a live claim is held by someone else", async () => {
    const held = metaRow({ claimed_by: "other", claimed_at: "2026-07-08T11:50:00.000Z" });
    const { query, calls } = makeQuery([held]);
    const res = await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    expect(res).toEqual({ won: false, reason: "held" });
    // Held → read only; it must NOT write anything.
    expect(calls.filter((c) => /^(DELETE|INSERT|UPDATE)/i.test(c))).toHaveLength(0);
  });

  it("takes over an EXPIRED claim (lease semantics: crashed workers leave no locks)", async () => {
    const stale = metaRow({ claimed_by: "dead-worker", claimed_at: "2026-07-08T09:00:00.000Z" });
    const mine = metaRow({ claimed_by: "me", claimed_at: now().toISOString() });
    const { query, calls } = makeQuery([stale, mine]);
    const res = await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    expect(res.won).toBe(true);
    // One row write: DELETE + INSERT + the race-healing sweep (older rows).
    const writes = calls.filter((c) => /^(DELETE|INSERT)/i.test(c));
    expect(writes).toHaveLength(3);
    expect(writes[2]).toContain("updated_at <"); // sweep only removes OLDER siblings
    expect(writes[0]).toContain(`id = '${P}|main|_meta'`);
    expect(writes[1]).toContain("'meta'"); // status=meta keeps it out of doc listings
  });

  it("claims a missing meta row (first refresh ever) and wins on read-back", async () => {
    const mine = metaRow({ claimed_by: "me", claimed_at: now().toISOString() });
    const { query } = makeQuery([[], mine]);
    const res = await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    expect(res.won).toBe(true);
  });

  it("loses the race when the read-back shows another claimer's stamp survived", async () => {
    const rival = metaRow({ claimed_by: "rival", claimed_at: now().toISOString() });
    const { query } = makeQuery([[], rival]);
    const res = await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    expect(res).toEqual({ won: false, reason: "lost-race" });
  });

  it("preserves last_refresh_sha and patch_counts through a claim", async () => {
    const prior = metaRow({ last_refresh_sha: "abc", patch_counts: { "wiki/x": 3 } });
    const mine = metaRow({ claimed_by: "me", claimed_at: now().toISOString() });
    // Three reads: held-check, pre-write fresh read, post-write read-back.
    const { query, calls } = makeQuery([prior, prior, mine]);
    await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    const insert = calls.find((c) => /^INSERT/i.test(c))!;
    expect(insert).toContain('"last_refresh_sha":"abc"');
    expect(insert).toContain('"wiki/x":3');
  });

  it("the claim write carries a sha COMMITTED between the held-check and the write (no regression)", async () => {
    const stale = metaRow({ last_refresh_sha: "old", patch_counts: {} });
    // A rival commits "newer" after our held-check read — the pre-write fresh
    // read must pick it up so our claim does not restore the old sha.
    const committed = metaRow({ last_refresh_sha: "newer", claimed_by: null, patch_counts: {} });
    const mine = metaRow({ claimed_by: "me", claimed_at: now().toISOString() });
    const { query, calls } = makeQuery([stale, committed, mine]);
    await tryClaimTurn(query, T, P, "main", { owner: "me", now, sleep: noSleep });
    const insert = calls.find((c) => /^INSERT/i.test(c))!;
    expect(insert).toContain('"last_refresh_sha":"newer"');
    expect(insert).not.toContain('"last_refresh_sha":"old"');
  });

  it("default TTL matches the design (30 min lease)", () => {
    expect(CLAIM_TTL_MS).toBe(30 * 60 * 1000);
  });
});

describe("commitRefresh", () => {
  it("advances the sha, releases the claim, persists counters — one row write", async () => {
    const mine = metaRow({ claimed_by: "me", claimed_at: "2026-07-08T12:00:00.000Z" });
    const { query, calls } = makeQuery([mine]);
    const res = await commitRefresh(query, T, P, "main", "sha999", { "wiki/core": 2 }, { owner: "me" });
    expect(res).toEqual({ committed: true });
    const writes = calls.filter((c) => /^(DELETE|INSERT)/i.test(c));
    expect(writes).toHaveLength(3); // DELETE + single INSERT + healing sweep
    const insert = writes[1];
    expect(insert).toContain('"last_refresh_sha":"sha999"');
    expect(insert).toContain('"claimed_by":null');
    expect(insert).toContain('"wiki/core":2');
  });

  it("REFUSES the commit when the lease was lost (stale worker must not regress the sha)", async () => {
    const rival = metaRow({ claimed_by: "rival", claimed_at: "2026-07-08T12:05:00.000Z", last_refresh_sha: "newer" });
    const { query, calls } = makeQuery([rival]);
    const res = await commitRefresh(query, T, P, "main", "old-sha", {}, { owner: "me" });
    expect(res).toEqual({ committed: false, reason: "lost-lease" });
    expect(calls.filter((c) => /^(DELETE|INSERT|UPDATE)/i.test(c))).toHaveLength(0);
  });

  it("refuses when the meta row vanished (no claim = no ownership)", async () => {
    const { query, calls } = makeQuery([[]]);
    const res = await commitRefresh(query, T, P, "main", "sha", {}, { owner: "me" });
    expect(res.committed).toBe(false);
    expect(calls.filter((c) => /^(DELETE|INSERT)/i.test(c))).toHaveLength(0);
  });
});
