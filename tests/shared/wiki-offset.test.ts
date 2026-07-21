import { describe, it, expect } from "vitest";
import { stampOffset, parseOffset, capLinesByBytes, WIKI_JSONL_MAX_BYTES } from "../../src/hooks/wiki-offset.js";

describe("stampOffset", () => {
  it("replaces an existing offset line, preserving the bullet, and round-trips via parseOffset", () => {
    const summary = "# Session x\n- **Project**: p\n- **JSONL offset**: 7\n\n## What Happened\nstuff";
    const out = stampOffset(summary, 42);
    expect(out).toContain("- **JSONL offset**: 42");
    expect(out).not.toContain("offset**: 7");
    expect(parseOffset(out)).toBe(42);
  });

  it("inserts an offset line after the title when none exists", () => {
    const summary = "# Session x\n\n## What Happened\nstuff";
    const out = stampOffset(summary, 5);
    expect(parseOffset(out)).toBe(5);
    // inserted right after the first line, not appended at the end
    expect(out.split("\n")[1]).toBe("- **JSONL offset**: 5");
  });

  it("does not depend on the LLM's exact formatting — a reformatted bullet is still overwritten", () => {
    // LLM wrote it as a bold line without a bullet; stamping still normalizes it.
    const summary = "# S\n**JSONL offset**:   999\ntail";
    expect(parseOffset(stampOffset(summary, 3))).toBe(3);
  });
});

describe("capLinesByBytes", () => {
  it("keeps the NEWEST lines (tail), not the oldest, and reports the drop count", () => {
    const lines = ["oldest", "mid", "newest"];
    // budget fits only the last two ("mid\nnewest" = 3+1+6 = 10 bytes)
    const { kept, dropped } = capLinesByBytes(lines, 10);
    expect(kept).toEqual(["mid", "newest"]);
    expect(dropped).toBe(1);
  });

  it("keeps everything when under budget (no drop)", () => {
    const lines = ["a", "b", "c"];
    const { kept, dropped } = capLinesByBytes(lines, WIKI_JSONL_MAX_BYTES);
    expect(kept).toEqual(lines);
    expect(dropped).toBe(0);
  });

  it("keeps only the last line but truncates it when it alone exceeds the budget", () => {
    const lines = ["x", "y".repeat(100)];
    const { kept, dropped, truncated } = capLinesByBytes(lines, 10);
    expect(dropped).toBe(1);
    expect(truncated).toBe(true);
    expect(kept).toHaveLength(1);
    expect(Buffer.byteLength(kept[0], "utf8")).toBeLessThanOrEqual(10);
  });

  it("handles an empty input", () => {
    expect(capLinesByBytes([], 10)).toEqual({ kept: [], dropped: 0, truncated: false });
  });

  it("truncates a lone oversized line so the output stays within the budget", () => {
    const line = "z".repeat(100);
    const { kept, dropped, truncated } = capLinesByBytes([line], 10);
    expect(dropped).toBe(0);
    expect(truncated).toBe(true);
    expect(kept).toHaveLength(1);
    expect(Buffer.byteLength(kept[0], "utf8")).toBeLessThanOrEqual(10);
  });

  it("does not report truncation when the retained line fits", () => {
    const { truncated } = capLinesByBytes(["ok"], 10);
    expect(truncated).toBe(false);
  });
});
