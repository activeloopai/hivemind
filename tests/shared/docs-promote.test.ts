import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (q: (sql: string) => unknown, sql: string) => q(sql),
}));

import { planPromotions, promoteMergedOverlays, type PromoteRow } from "../../src/docs/promote.js";
import { appendFilesIndex } from "../../src/docs/wiki-generate.js";
import type { GitRunner } from "../../src/docs/branch-scope.js";

const FILES = ["pkg/core/a.ts"];
const body = (n: string) => appendFilesIndex(`## Purpose\n${n}`, FILES);
const GROUP_FILES = new Map([["wiki/pkg/core", FILES]]);

// HEAD has a.ts at blob SHA_MAIN.
const git: GitRunner = (args) =>
  args[0] === "ls-tree" && args[1] === "HEAD" ? "100644 blob SHA_MAIN\tpkg/core/a.ts\n" : null;

function row(scope: string, source_fp: Record<string, string>, content = body(scope)): PromoteRow {
  return { doc_id: "wiki/pkg/core", path: "/docs/p/wiki/pkg/core.md", content, tier: "slow", scope, source_fp: JSON.stringify(source_fp) };
}

describe("planPromotions", () => {
  it("promotes an overlay whose fingerprint equals main's current source", () => {
    const rows = [
      row("main", { "pkg/core/a.ts": "SHA_OLD" }),        // main is stale
      row("b:feat", { "pkg/core/a.ts": "SHA_MAIN" }),     // overlay == what main now has
    ];
    const plans = planPromotions(rows, git, GROUP_FILES);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ doc_id: "wiki/pkg/core", fromScope: "b:feat", mainFp: `{"pkg/core/a.ts":"SHA_MAIN"}` });
  });

  it("does NOT promote an overlay whose fingerprint differs from main (merge combined changes)", () => {
    const rows = [
      row("main", { "pkg/core/a.ts": "SHA_MAIN" }),
      row("b:feat", { "pkg/core/a.ts": "SHA_BRANCH" }), // not what main has → regenerate, not promote
    ];
    expect(planPromotions(rows, git, GROUP_FILES)).toHaveLength(0);
  });

  it("ignores non-wiki docs and pages with no overlay", () => {
    const rows: PromoteRow[] = [
      { doc_id: "src/a.ts", path: "/p", content: "x", tier: "fast", scope: "b:feat", source_fp: `{"src/a.ts":"SHA_MAIN"}` },
      row("main", { "pkg/core/a.ts": "SHA_MAIN" }), // only main, no overlay
    ];
    expect(planPromotions(rows, git, GROUP_FILES)).toHaveLength(0);
  });

  it("promotes even when main has no row yet (branch created a brand-new page now merged)", () => {
    const plans = planPromotions([row("b:feat", { "pkg/core/a.ts": "SHA_MAIN" })], git, GROUP_FILES);
    expect(plans).toHaveLength(1);
  });

  it("does NOT promote when the overlay's membership differs from the current group (codex #6)", () => {
    // Overlay documents [a.ts] (its ## Files), but the group now has [a.ts, b.ts]
    // (a member joined via the merge). Promoting would carry a stale file set →
    // skip promotion so the normal refresh regenerates with the new membership.
    const twoFileGroup = new Map([["wiki/pkg/core", ["pkg/core/a.ts", "pkg/core/b.ts"]]]);
    const gitTwo: GitRunner = (args) =>
      args[0] === "ls-tree" && args[1] === "HEAD"
        ? "100644 blob SHA_MAIN\tpkg/core/a.ts\n100644 blob SHA_B\tpkg/core/b.ts\n"
        : null;
    const rows = [row("b:feat", { "pkg/core/a.ts": "SHA_MAIN" })]; // overlay ## Files = [a.ts] only
    expect(planPromotions(rows, gitTwo, twoFileGroup)).toHaveLength(0);
  });

  it("skips a page whose group no longer exists", () => {
    expect(planPromotions([row("b:feat", { "pkg/core/a.ts": "SHA_MAIN" })], git, new Map())).toHaveLength(0);
  });
});

describe("promoteMergedOverlays", () => {
  it("upserts the overlay content at main, then archives the overlay", async () => {
    const calls: string[] = [];
    // Full DocRow shape for editDoc's getDocLatest read (needs version etc.).
    const overlayFull = {
      id: "o", doc_id: "wiki/pkg/core", path: "/docs/p/wiki/pkg/core.md", content: body("b:feat"),
      anchors: "[]", tier: "slow", status: "active", project: "p", scope: "b:feat",
      source_fp: `{"pkg/core/a.ts":"SHA_MAIN"}`, version: 1,
      created_at: "t0", updated_at: "t0", agent: "m", plugin_version: "0",
    };
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      const s = sql.trim();
      if (/^SELECT/i.test(s) && s.includes("status = 'active'")) {
        // the promote scan — both scopes
        return [
          { id: "m", ...row("main", { "pkg/core/a.ts": "SHA_OLD" }) },
          { id: "o", ...row("b:feat", { "pkg/core/a.ts": "SHA_MAIN" }) },
        ];
      }
      if (/^SELECT/i.test(s) && s.includes("scope = 'b:feat'")) {
        return [overlayFull]; // editDoc's scoped read of the overlay
      }
      return [];
    });
    const out = await promoteMergedOverlays(query, "hivemind_docs", "p", git, GROUP_FILES);
    expect(out).toEqual([{ doc_id: "wiki/pkg/core", fromScope: "b:feat", action: "promoted" }]);

    // The promoted row is written at scope main with main's fingerprint...
    const insert = calls.find((c) => /^INSERT/i.test(c) && c.includes("'p|main|wiki/pkg/core'"));
    expect(insert).toBeTruthy();
    expect(insert).toContain(`{"pkg/core/a.ts":"SHA_MAIN"}`);
    // ...and the overlay row is archived (an UPDATE to status archived on b:feat).
    const archive = calls.find((c) => /^UPDATE/i.test(c) && c.includes("'archived'"));
    expect(archive).toBeTruthy();
  });
});
