import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fingerprintEdits, alreadyProposed, priorEditSummaries, metaEntryFor, loadMeta, appendMeta,
  patchMeta, latestUnresolvedFingerprint, fingerprintForVersion,
} from "../../src/skillify/skillopt-meta.js";
import type { Edit } from "../../src/skillify/skill-edits.js";

const edits: Edit[] = [{ op: "append", content: "always flush" }, { op: "replace", target: "mock", content: "do not mock" }];

describe("fingerprintEdits", () => {
  it("is order-independent (same set → same fingerprint)", () => {
    expect(fingerprintEdits(edits)).toBe(fingerprintEdits([...edits].reverse()));
  });
  it("differs for different content", () => {
    expect(fingerprintEdits(edits)).not.toBe(fingerprintEdits([{ op: "append", content: "other" }]));
  });
});

describe("alreadyProposed / priorEditSummaries", () => {
  const meta = [metaEntryFor("posthog", "kamo", edits, "t1"), metaEntryFor("other", "x", [{ op: "append", content: "z" }], "t2")];
  it("matches a prior proposal by skill + fingerprint", () => {
    expect(alreadyProposed(meta, "posthog", "kamo", [...edits].reverse())).toBe(true);
    expect(alreadyProposed(meta, "posthog", "kamo", [{ op: "append", content: "new" }])).toBe(false);
    expect(alreadyProposed(meta, "nope", "kamo", edits)).toBe(false); // different skill
  });
  it("surfaces prior edit summaries only for the given skill", () => {
    const prior = priorEditSummaries(meta, "posthog", "kamo");
    expect(prior.length).toBe(2);
    expect(prior.join(" ")).toContain("append");
    expect(priorEditSummaries(meta, "posthog", "kamo").join(" ")).not.toContain('append: z'); // other skill's edit
  });

  it("summarizes a delete edit (target, NO content) and a targetless append (content, NO target)", () => {
    const m = [metaEntryFor("p", "k", [{ op: "delete", target: "old rule" }, { op: "append", content: "x" }], "t")];
    const prior = priorEditSummaries(m, "p", "k");
    // delete → target anchor + no content preview; append → content preview + no anchor (both ternary halves)
    expect(prior.join(" ")).toMatch(/delete @"old rule"/);
    expect(prior.join(" ")).toMatch(/append: x/);
  });

  it("annotates summaries with [proposed] status when no patch exists", () => {
    const m = [metaEntryFor("posthog", "kamo", edits, "t1")];
    const prior = priorEditSummaries(m, "posthog", "kamo");
    expect(prior.every((s) => s.startsWith("[proposed]"))).toBe(true);
  });

  it("annotates summaries with [applied] after a patch marks the entry applied", () => {
    const fp = fingerprintEdits(edits);
    const m = [
      metaEntryFor("posthog", "kamo", edits, "t1"),
      { skill: "posthog--kamo", ops: [], fingerprint: fp, proposedAt: "", status: "applied" as const, resolvedAt: "t2" },
    ];
    const prior = priorEditSummaries(m, "posthog", "kamo");
    // All ops from the original entry should now be annotated [applied]
    expect(prior.every((s) => s.startsWith("[applied]"))).toBe(true);
    expect(prior.length).toBe(2); // still both ops
  });

  it("annotates summaries with [reverted] after a patch marks the entry reverted", () => {
    const fp = fingerprintEdits(edits);
    const m = [
      metaEntryFor("posthog", "kamo", edits, "t1"),
      { skill: "posthog--kamo", ops: [], fingerprint: fp, proposedAt: "", status: "reverted" as const, resolvedAt: "t2" },
    ];
    const prior = priorEditSummaries(m, "posthog", "kamo");
    expect(prior.every((s) => s.startsWith("[reverted]"))).toBe(true);
  });

  it("handles multiple different edit sets with mixed statuses independently", () => {
    const edits2: Edit[] = [{ op: "insert_after", target: "## Rules", content: "new rule" }];
    const fp1 = fingerprintEdits(edits);
    const m = [
      metaEntryFor("posthog", "kamo", edits, "t1"),
      { skill: "posthog--kamo", ops: [], fingerprint: fp1, proposedAt: "", status: "applied" as const, resolvedAt: "t2" },
      metaEntryFor("posthog", "kamo", edits2, "t3"),
      // edits2 stays "proposed" (no patch)
    ];
    const prior = priorEditSummaries(m, "posthog", "kamo");
    const appliedOnes = prior.filter((s) => s.startsWith("[applied]"));
    const proposedOnes = prior.filter((s) => s.startsWith("[proposed]"));
    expect(appliedOnes.length).toBe(2); // edits has 2 ops
    expect(proposedOnes.length).toBe(1); // edits2 has 1 op
  });
});

describe("loadMeta / appendMeta", () => {
  let file: string;
  beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "meta-")), "meta.jsonl"); });
  afterEach(() => { fs.rmSync(path.dirname(file), { recursive: true, force: true }); });

  it("round-trips entries and skips malformed lines", () => {
    appendMeta(file, metaEntryFor("a", "b", edits, "t1"));
    appendMeta(file, metaEntryFor("c", "d", [{ op: "append", content: "x" }], "t2"));
    fs.appendFileSync(file, "{ not json }\n\n");
    const loaded = loadMeta(file);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].skill).toBe("a--b");
    expect(loaded[0].status).toBe("proposed");
  });

  it("returns [] for a missing file", () => {
    expect(loadMeta(path.join(os.tmpdir(), "does-not-exist-xyz.jsonl"))).toEqual([]);
  });
});

describe("patchMeta", () => {
  let file: string;
  beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "patch-")), "meta.jsonl"); });
  afterEach(() => { fs.rmSync(path.dirname(file), { recursive: true, force: true }); });

  it("appends a patch entry and loadMeta reads it back with resolvedAt", () => {
    const entry = metaEntryFor("skill", "auth", edits, "t1");
    appendMeta(file, entry);
    patchMeta(file, "skill--auth", entry.fingerprint, "applied", "t2");
    const loaded = loadMeta(file);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].status).toBe("proposed");
    expect(loaded[1].status).toBe("applied");
    expect(loaded[1].resolvedAt).toBe("t2");
    expect(loaded[1].ops).toEqual([]); // patch entries carry no ops (original does)
  });

  it("is a no-op when fingerprint is empty", () => {
    appendMeta(file, metaEntryFor("skill", "auth", edits, "t1"));
    patchMeta(file, "skill--auth", "", "applied", "t2");
    expect(loadMeta(file)).toHaveLength(1); // nothing appended
  });

  it("priorEditSummaries reflects the resolved status after patchMeta", () => {
    const entry = metaEntryFor("skill", "auth", edits, "t1");
    appendMeta(file, entry);
    patchMeta(file, "skill--auth", entry.fingerprint, "reverted", "t2");
    const meta = loadMeta(file);
    const prior = priorEditSummaries(meta, "skill", "auth");
    expect(prior.every((s) => s.startsWith("[reverted]"))).toBe(true);
  });
});

describe("latestUnresolvedFingerprint", () => {
  it("returns the fingerprint of the latest proposed entry", () => {
    const e1 = metaEntryFor("sk", "au", edits, "t1");
    const e2 = metaEntryFor("sk", "au", [{ op: "append", content: "x" }], "t2");
    expect(latestUnresolvedFingerprint([e1, e2], "sk", "au")).toBe(e2.fingerprint);
  });

  it("returns null when no entries exist for this skill", () => {
    expect(latestUnresolvedFingerprint([], "sk", "au")).toBeNull();
    const other = metaEntryFor("other", "au", edits, "t1");
    expect(latestUnresolvedFingerprint([other], "sk", "au")).toBeNull();
  });

  it("returns null when the latest entry has already been resolved (applied)", () => {
    const entry = metaEntryFor("sk", "au", edits, "t1");
    const patch = { ...entry, ops: [], status: "applied" as const, resolvedAt: "t2" };
    expect(latestUnresolvedFingerprint([entry, patch], "sk", "au")).toBeNull();
  });

  it("returns null when the latest entry has already been resolved (reverted)", () => {
    const entry = metaEntryFor("sk", "au", edits, "t1");
    const patch = { ...entry, ops: [], status: "reverted" as const, resolvedAt: "t2" };
    expect(latestUnresolvedFingerprint([entry, patch], "sk", "au")).toBeNull();
  });

  it("returns an earlier entry's fingerprint if the most recent one is resolved but an older proposed exists", () => {
    const e1 = metaEntryFor("sk", "au", edits, "t1");
    const e2 = metaEntryFor("sk", "au", [{ op: "append", content: "x" }], "t2");
    const patch2 = { ...e2, ops: [], status: "applied" as const, resolvedAt: "t3" };
    // e2 is resolved, e1 is still proposed
    expect(latestUnresolvedFingerprint([e1, e2, patch2], "sk", "au")).toBe(e1.fingerprint);
  });
});

describe("fingerprintForVersion", () => {
  it("returns the fingerprint of the entry that has the given publishedVersion", () => {
    const e = metaEntryFor("sk", "au", edits, "t1", 4);
    expect(fingerprintForVersion([e], "sk", "au", 4)).toBe(e.fingerprint);
  });

  it("returns null when no entry has the given publishedVersion", () => {
    const e = metaEntryFor("sk", "au", edits, "t1"); // no publishedVersion
    expect(fingerprintForVersion([e], "sk", "au", 4)).toBeNull();
    expect(fingerprintForVersion([], "sk", "au", 4)).toBeNull();
  });

  it("returns null for a different skill even if the version matches", () => {
    const e = metaEntryFor("other", "au", edits, "t1", 4);
    expect(fingerprintForVersion([e], "sk", "au", 4)).toBeNull();
  });

  it("metaEntryFor stores publishedVersion when provided", () => {
    const e = metaEntryFor("sk", "au", edits, "t1", 7);
    expect(e.publishedVersion).toBe(7);
    const e2 = metaEntryFor("sk", "au", edits, "t1"); // omitted
    expect(e2.publishedVersion).toBeUndefined();
  });

  it("anti-regression: delayed judgment for version N does not mark a later version's edit (cross-version race)", () => {
    // Simulate: Process A publishes E1 at v4; Process B starts after and sees E1 in its
    // metaCache. Process B's judgment is for v3 (pre-E1 window), so it should resolve
    // the v3 edit (which has no publishedVersion — nothing was published for v3 in meta)
    // and NOT mark E1 as reverted.
    const e1 = metaEntryFor("sk", "au", edits, "t1", 4); // E1 published at v4 by Process A
    // Process B calls resolveEdit("reverted", priorVersion=3): look up fingerprint for v3
    const fp = fingerprintForVersion([e1], "sk", "au", 3);
    expect(fp).toBeNull(); // v3 has no recorded meta entry → no-op, E1 is NOT marked reverted
    // E1's fingerprint is NOT returned:
    expect(fp).not.toBe(e1.fingerprint);
  });
});
