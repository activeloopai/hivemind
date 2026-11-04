import { describe, it, expect } from "vitest";
import { buildIndex, search, type RecallDoc } from "../../../src/recall/lexical-index.js";
import { passesGate, thresholds } from "../../../src/recall/policy.js";

const NOW = Date.parse("2026-11-04T00:00:00Z");

function doc(p: Partial<RecallDoc> & { path: string }): RecallDoc {
  return { author: "bob", project: "api", description: "", body: "", lastUpdate: "2026-10-01T00:00:00Z", ...p };
}

// Filler docs so idf is meaningful (rare terms really are rare).
const filler = Array.from({ length: 40 }, (_, i) => doc({
  path: `/summaries/carol/f${i}.md`,
  description: `Refactored the billing dashboard page ${i}`,
  body: "## Key Facts\n- Updated the React components and CSS for the dashboard\n- Error handling for forms",
}));

const target = doc({
  path: "/summaries/bob/oid.md",
  description: "Fixed CREATE INDEX failing right after CREATE TABLE",
  body: "## Errors & Fixes\n- 'table with oid 16666 not found' — cause: catalog not yet visible — fix: retry after 2s",
});

const corpus = [...filler, target];

describe("buildIndex / search", () => {
  const idx = buildIndex(corpus, new Date(NOW));

  it("indexes every doc and computes avgdl", () => {
    expect(idx.docs).toHaveLength(corpus.length);
    expect(idx.avgdl).toBeGreaterThan(0);
  });

  it("ranks the summary that shares the error phrase first", () => {
    const [h] = search(idx, "ERROR: table with oid 42 not found", { now: NOW });
    expect(h.doc.p).toBe("/summaries/bob/oid.md");
    expect(h.phrases).toBeGreaterThanOrEqual(2);
    expect(h.coverage).toBeGreaterThan(0.9);
    expect(passesGate(h, thresholds("failure", {})).pass).toBe(true);
  });

  it("counts unseen query terms against coverage", () => {
    const [h] = search(idx, "table oid zzqvx wwkkp yyrrt", { now: NOW });
    expect(h.doc.p).toBe("/summaries/bob/oid.md");
    expect(h.coverage).toBeLessThan(0.5);
  });

  it("excludes the current user and already-injected paths", () => {
    expect(search(idx, "table oid found", { excludeAuthor: "bob", now: NOW }).some((h) => h.doc.a === "bob")).toBe(false);
    expect(search(idx, "table oid found", { exclude: new Set([target.path]), now: NOW })
      .some((h) => h.doc.p === target.path)).toBe(false);
  });

  it("boosts the current project and prefers recent docs", () => {
    const a = doc({ path: "/summaries/x/a.md", project: "web", description: "redis connection reset by peer", lastUpdate: "2026-10-01T00:00:00Z" });
    const b = doc({ path: "/summaries/x/b.md", project: "api", description: "redis connection reset by peer", lastUpdate: "2026-10-01T00:00:00Z" });
    const c = doc({ path: "/summaries/x/c.md", project: "web", description: "redis connection reset by peer", lastUpdate: "2024-01-01T00:00:00Z" });
    const i2 = buildIndex([...filler, a, b, c]);
    const hits = search(i2, "redis connection reset by peer", { project: "api", now: NOW });
    expect(hits.map((h) => h.doc.p).slice(0, 3)).toEqual(["/summaries/x/b.md", "/summaries/x/a.md", "/summaries/x/c.md"]);
  });

  it("returns nothing for an empty index or no shared terms", () => {
    expect(search(buildIndex([]), "anything")).toEqual([]);
    expect(search(idx, "zzqvx wwkkp", { now: NOW })).toEqual([]);
  });

  it("caps the scored terms to the rarest ones", () => {
    const hits = search(idx, "dashboard react components css forms table oid found", { maxTerms: 3, now: NOW });
    expect(hits[0].terms.every((t) => ["table", "oid", "found"].includes(t))).toBe(true);
  });
});

describe("anchors (ports / error codes)", () => {
  const pg = doc({ path: "/summaries/alice/pg.md", description: "integration tests could not reach the test database",
    body: "## Errors & Fixes\n- 'Error: connect ECONNREFUSED 127.0.0.1:5432' — cause: test Postgres container down — fix: docker compose up -d db" });
  const ts = doc({ path: "/summaries/alice/ts.md", description: "type error in the parser",
    body: "## Errors & Fixes\n- 'error TS2345: Argument of type string is not assignable to parameter of type number' — fix: parse first" });
  const idx = buildIndex([...filler, pg, ts]);
  const th = thresholds("failure", {});
  const best = (q: string) => search(idx, q, { now: NOW })[0];

  it("matches the same error on another port-mapped host", () => {
    const h = best("Error: connect ECONNREFUSED 10.0.0.7:5432");
    expect(h.doc.p).toBe(pg.path);
    expect(passesGate(h, th)).toEqual({ pass: true });
  });

  it("rejects the same words on a different port (Redis is not Postgres)", () => {
    const h = best("Error: connect ECONNREFUSED ::1:6379");
    expect(h.doc.p).toBe(pg.path);
    expect(h.anchorMiss).toBe(true);
    expect(passesGate(h, th)).toEqual({ pass: false, reason: "anchor" });
  });

  it("rejects a different TypeScript error code with the same wording", () => {
    const h = best("error TS2322: Argument of type string is not assignable to parameter of type number");
    expect(passesGate(h, th)).toEqual({ pass: false, reason: "anchor" });
    expect(passesGate(best("error TS2345: Argument of type string is not assignable to parameter of type number"), th).pass).toBe(true);
  });

  it("queries without anchors are unaffected", () => {
    expect(best("Error: table with oid 9 not found")?.anchorMiss ?? false).toBe(false);
  });
});

describe("passesGate", () => {
  const base = { doc: target as never, score: 1, matched: 5, coverage: 0.8, rarestDf: 0.01, phrases: 2, anchorMiss: false, terms: [] };
  const th = thresholds("failure", {});
  it.each([
    [{ matched: 2 }, "matched"],
    [{ coverage: 0.2 }, "coverage"],
    [{ rarestDf: 0.5 }, "common"],
    [{ phrases: 1 }, "phrase"],
    [{ anchorMiss: true }, "anchor"],
  ])("rejects %o with reason %s", (patch, reason) => {
    expect(passesGate({ ...base, ...patch } as never, th)).toEqual({ pass: false, reason });
  });
  it("passes a strong hit", () => {
    expect(passesGate(base as never, th)).toEqual({ pass: true });
  });
});
