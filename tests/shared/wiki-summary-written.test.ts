import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { markSummaryUnwritten, summaryWasWritten } from "../../src/hooks/wiki-offset.js";

/**
 * "Did the agent actually write?" is the decision that separates a real summary
 * from the placeholder-forever bug: answering "yes" when the child wrote nothing
 * uploads the pre-seeded stub AND advances the offset, destroying the unread
 * events. These pin the answer on every filesystem the workers can land on.
 */

const realFs = { existsSync, utimesSync, statSync };

function withFile(body: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "summary-written-"));
  try { body(join(dir, "summary.md")); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("markSummaryUnwritten / summaryWasWritten", () => {
  it("reports NOT written when the agent leaves the pre-seeded file alone", () => {
    withFile((p) => {
      writeFileSync(p, "# placeholder\n");
      const base = markSummaryUnwritten(p, realFs);
      expect(base.trusted).toBe(true);
      expect(summaryWasWritten(p, base, false, realFs)).toBe(false);
    });
  });

  it("reports WRITTEN when the agent rewrites the identical bytes", () => {
    // The regression the timestamp check exists for: content equality alone
    // would call this a no-op and freeze the offset forever.
    withFile((p) => {
      writeFileSync(p, "# same\n");
      const base = markSummaryUnwritten(p, realFs);
      writeFileSync(p, "# same\n");
      expect(summaryWasWritten(p, base, false, realFs)).toBe(true);
    });
  });

  it("reports WRITTEN when the agent writes different content", () => {
    withFile((p) => {
      writeFileSync(p, "# before\n");
      const base = markSummaryUnwritten(p, realFs);
      writeFileSync(p, "# after\n");
      expect(summaryWasWritten(p, base, true, realFs)).toBe(true);
    });
  });

  it("treats a first run with no pre-seeded file as written when content appeared", () => {
    withFile((p) => {
      const base = markSummaryUnwritten(p, realFs);
      expect(base).toEqual({ mtimeMs: 0, trusted: true });
      writeFileSync(p, "# fresh\n");
      expect(summaryWasWritten(p, base, true, realFs)).toBe(true);
    });
  });

  it("does not throw — and distrusts the timestamp — when utimes is rejected", () => {
    // A read-only or exotic filesystem must not abort the worker: before this
    // was routed through the helper, the utimes call sat outside the try and a
    // throw killed the run outright.
    withFile((p) => {
      writeFileSync(p, "# ro\n");
      const fs = { existsSync, statSync, utimesSync: () => { throw new Error("EPERM"); } };
      const base = markSummaryUnwritten(p, fs);
      expect(base.trusted).toBe(false);
      // Untrusted timestamps fall back to content, erring toward skipping.
      expect(summaryWasWritten(p, base, false, realFs)).toBe(false);
      expect(summaryWasWritten(p, base, true, realFs)).toBe(true);
    });
  });

  it("distrusts the timestamp when utimes silently does nothing", () => {
    // The coarse-clock hole: a filesystem that accepts utimes and ignores it
    // would leave the baseline at "now", where a same-tick identical rewrite
    // is indistinguishable from no write at all.
    withFile((p) => {
      writeFileSync(p, "# noop\n");
      const fs = { existsSync, statSync, utimesSync: () => { /* silently ignored */ } };
      const base = markSummaryUnwritten(p, fs);
      expect(base.trusted).toBe(false);
      expect(summaryWasWritten(p, base, false, realFs)).toBe(false);
    });
  });

  it("falls back to content when the file vanishes before the check", () => {
    withFile((p) => {
      writeFileSync(p, "# gone\n");
      const base = markSummaryUnwritten(p, realFs);
      rmSync(p);
      expect(summaryWasWritten(p, base, true, realFs)).toBe(true);
      expect(summaryWasWritten(p, base, false, realFs)).toBe(false);
    });
  });
});
