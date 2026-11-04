import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncRecallCache, buildPageSql, rowToDoc, type QueryFn } from "../../../src/recall/sync.js";
import { cacheDir, loadIndex, loadStore, acquireSyncLock, condenseSummary } from "../../../src/recall/cache.js";

/**
 * Fake memory table that evaluates the exact keyset / author / path filters
 * the sync emits, so pagination and incremental behaviour are tested against
 * real SQL text rather than a mock that returns canned pages.
 */
type Row = { path: string; author: string; project: string; description: string; summary: string; last_update_date: string; summary_embedding?: number[] | null };

function fakeTable(rows: Row[]) {
  const sqls: string[] = [];
  const query: QueryFn = async (sql) => {
    sqls.push(sql);
    const me = /author <> '([^']*)'/.exec(sql)?.[1];
    let out = rows.filter((r) => r.path.startsWith("/summaries/") && r.author !== me);
    const ks = /last_update_date > '([^']*)' OR \(last_update_date = '([^']*)' AND path > '([^']*)'\)/.exec(sql);
    if (ks) out = out.filter((r) => r.last_update_date > ks[1] || (r.last_update_date === ks[2] && r.path > ks[3]));
    if (/^SELECT path FROM/.test(sql)) return out.map((r) => ({ path: r.path }));
    out.sort((a, b) => a.last_update_date.localeCompare(b.last_update_date) || a.path.localeCompare(b.path));
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 1e9);
    return out.slice(0, limit) as unknown as Record<string, unknown>[];
  };
  return { query, sqls };
}

const row = (i: number, over: Partial<Row> = {}): Row => ({
  path: `/summaries/bob/s${String(i).padStart(3, "0")}.md`,
  author: "bob",
  project: "api",
  description: `session ${i} fixed redis timeout`,
  summary: `## What Happened\nstuff\n\n## Key Facts\n- fact ${i}\n\n## Files Modified\n- a.ts`,
  // Several rows share a timestamp to exercise the (date, path) tie-break.
  last_update_date: `2026-10-${String(1 + Math.floor(i / 3)).padStart(2, "0")}T00:00:00Z`,
  summary_embedding: null, // legacy rows with no embedding must sync fine
  ...over,
});

let root = "";
const key = { orgId: "org1", workspaceId: "ws1", table: "memory" };
const T0 = Date.parse("2026-11-04T00:00:00Z");
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "recall-sync-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("syncRecallCache", () => {
  it("pages through every teammate summary, skipping the current user's own", async () => {
    const rows = [...Array.from({ length: 23 }, (_, i) => row(i)), row(99, { author: "me", path: "/summaries/me/x.md" })];
    const t = fakeTable(rows);
    const r = await syncRecallCache({ ...key, query: t.query, userName: "me", root, pageSize: 5, now: T0 });
    expect(r).toMatchObject({ status: "synced", fetched: 23, total: 23, pages: 5 });
    const store = loadStore(cacheDir(key, root), "me");
    expect(Object.keys(store.docs)).toHaveLength(23);
    expect(store.docs["/summaries/me/x.md"]).toBeUndefined();
    expect(loadIndex(cacheDir(key, root))?.docs).toHaveLength(23);
  });

  it("never reads the embedding column and filters author server-side", async () => {
    const t = fakeTable([row(1)]);
    await syncRecallCache({ ...key, query: t.query, userName: "o'brien", root, now: T0 });
    for (const sql of t.sqls) expect(sql).not.toMatch(/embedding/);
    expect(t.sqls[0]).toContain("author <> 'o''brien'");
  });

  it("is incremental: a second sync only fetches rows changed since the cursor", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i));
    const t = fakeTable(rows);
    await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 });
    rows.push(row(50, { last_update_date: "2026-11-01T00:00:00Z" }));
    rows[2] = row(2, { description: "rewritten", last_update_date: "2026-11-02T00:00:00Z" });
    const r = await syncRecallCache({ ...key, query: t.query, userName: "me", root, force: true, now: T0 + 1000 });
    expect(r).toMatchObject({ status: "synced", fetched: 2, total: 11 });
    expect(loadStore(cacheDir(key, root), "me").docs[rows[2].path].description).toBe("rewritten");
  });

  it("is throttled unless forced", async () => {
    const t = fakeTable([row(1)]);
    await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 });
    const n = t.sqls.length;
    const r = await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 + 60_000 });
    expect(r.status).toBe("fresh");
    expect(t.sqls.length).toBe(n);
    const later = await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 + 16 * 60_000 });
    expect(later.status).toBe("synced");
  });

  it("keeps the progress made before a mid-sync failure and resumes from it", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i));
    const t = fakeTable(rows);
    let calls = 0;
    const flaky: QueryFn = async (sql) => { if (++calls === 2) throw new Error("Query timeout"); return t.query(sql); };
    const r = await syncRecallCache({ ...key, query: flaky, userName: "me", root, pageSize: 5, now: T0 });
    expect(r).toMatchObject({ status: "error", fetched: 5, error: "Query timeout" });
    const r2 = await syncRecallCache({ ...key, query: t.query, userName: "me", root, pageSize: 5, now: T0 + 1 });
    expect(r2).toMatchObject({ status: "synced", fetched: 7, total: 12 });
  });

  it("reconciles deletions weekly", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => row(i));
    const t = fakeTable(rows);
    await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 });
    rows.splice(0, 1);
    const soon = await syncRecallCache({ ...key, query: t.query, userName: "me", root, force: true, now: T0 + 86_400_000 });
    expect(soon.removed).toBe(0);
    const week = await syncRecallCache({ ...key, query: t.query, userName: "me", root, force: true, now: T0 + 8 * 86_400_000 });
    expect(week).toMatchObject({ removed: 1, total: 3 });
  });

  it("caps the cache to the most recent maxDocs", async () => {
    const t = fakeTable(Array.from({ length: 9 }, (_, i) => row(i)));
    const r = await syncRecallCache({ ...key, query: t.query, userName: "me", root, maxDocs: 3, now: T0 });
    expect(r.total).toBe(3);
    const paths = Object.keys(loadStore(cacheDir(key, root), "me").docs).sort();
    expect(paths).toEqual(["/summaries/bob/s006.md", "/summaries/bob/s007.md", "/summaries/bob/s008.md"]);
  });

  it("starts over when the logged-in user changes", async () => {
    const t = fakeTable([row(1), row(2, { author: "alice", path: "/summaries/alice/a.md" })]);
    await syncRecallCache({ ...key, query: t.query, userName: "alice", root, now: T0 });
    expect(Object.keys(loadStore(cacheDir(key, root), "bob").docs)).toHaveLength(0);
    const r = await syncRecallCache({ ...key, query: t.query, userName: "bob", root, now: T0 + 1 });
    expect(r.total).toBe(1);
  });

  it("rebuilds an index from an older version without querying the backend", async () => {
    const t = fakeTable([row(1), row(2)]);
    await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 });
    const dir = cacheDir(key, root);
    writeFileSync(join(dir, "index.json"), JSON.stringify({ v: 1, docs: [] }));
    expect(loadIndex(dir)).toBeNull();
    const n = t.sqls.length;
    const r = await syncRecallCache({ ...key, query: t.query, userName: "me", root, now: T0 + 60_000 });
    expect(r.status).toBe("fresh");
    expect(t.sqls.length).toBe(n);
    expect(loadIndex(dir)?.docs).toHaveLength(2);
  });

  it("is single-flighted by the lock", async () => {
    const dir = cacheDir(key, root);
    const release = acquireSyncLock(dir, T0);
    expect(release).toBeTruthy();
    const r = await syncRecallCache({ ...key, query: fakeTable([row(1)]).query, userName: "me", root, now: T0 });
    expect(r.status).toBe("locked");
    release!();
    expect(existsSync(join(dir, "sync.lock"))).toBe(false);
  });

  it("writes cache files owner-only", async () => {
    await syncRecallCache({ ...key, query: fakeTable([row(1)]).query, userName: "me", root, now: T0 });
    const mode = statSync(join(cacheDir(key, root), "store.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("cache helpers", () => {
  it("cacheDir sanitizes ids so they can't escape the root", () => {
    expect(cacheDir({ orgId: "../x", workspaceId: "..", table: "a/b" }, "/r")).toBe("/r/.._x/_/a_b");
  });

  it("condenseSummary keeps only recall sections and drops 'none'", () => {
    const s = "# S\n## What Happened\nnoise\n\n## Errors & Fixes\nnone\n\n## Key Facts\n- k\n\n## Next Steps\nnone";
    expect(condenseSummary(s)).toBe("## Key Facts\n- k");
  });

  it("condenseSummary keeps free-form rows as leading text", () => {
    expect(condenseSummary("plain note without headings")).toBe("plain note without headings");
  });

  it("rowToDoc tolerates missing / non-string columns", () => {
    expect(rowToDoc({ path: "/summaries/a/b.md", summary: null, last_update_date: undefined })).toEqual({
      path: "/summaries/a/b.md", author: "", project: "", description: "", body: "", lastUpdate: "",
    });
  });

  it("buildPageSql escapes the cursor", () => {
    expect(buildPageSql("memory", "me", { date: "x'y", path: "/p'q" }, 5)).toContain("'x''y'");
  });

  it("a stale lock (crashed worker) is taken over", () => {
    const dir = cacheDir(key, root);
    acquireSyncLock(dir, T0);
    writeFileSync(join(dir, "sync.lock"), "123");
    expect(acquireSyncLock(dir, Date.now() + 11 * 60_000)).toBeTruthy();
    expect(readdirSync(dir).filter((f) => f.includes("stale"))).toEqual([]);
  });

  it("a live lock is never taken over, and is left in place", () => {
    const dir = cacheDir(key, root);
    const release = acquireSyncLock(dir);
    expect(acquireSyncLock(dir)).toBeNull();
    expect(acquireSyncLock(dir, Date.now() + 60_000)).toBeNull();
    expect(existsSync(join(dir, "sync.lock"))).toBe(true);
    release!();
  });

  it("only one of two recoverers takes over a stale lock", () => {
    const dir = cacheDir(key, root);
    acquireSyncLock(dir, T0);
    const later = Date.now() + 11 * 60_000;
    const first = acquireSyncLock(dir, later);
    expect(first).toBeTruthy();
    // The second recoverer sees the first one's fresh lock (mtime = now).
    expect(acquireSyncLock(dir, Date.now())).toBeNull();
    first!();
  });
});
