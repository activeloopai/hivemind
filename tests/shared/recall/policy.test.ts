import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recallMode, saveModeConfig, loadModeConfig, thresholds } from "../../../src/recall/policy.js";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ""; });
const cfgPath = () => { dir = mkdtempSync(join(tmpdir(), "recall-policy-")); return join(dir, "config.json"); };

describe("recallMode", () => {
  it("defaults: failure on (works on a fresh install), prompt shadow", () => {
    const p = cfgPath();
    expect(recallMode("failure", {}, p)).toBe("on");
    expect(recallMode("prompt", {}, p)).toBe("shadow");
  });

  it("reads the saved config per trigger", () => {
    const p = cfgPath();
    saveModeConfig({ failure: "on" }, p);
    saveModeConfig({ prompt: "off" }, p);
    expect(loadModeConfig(p)).toEqual({ failure: "on", prompt: "off" });
    expect(recallMode("failure", {}, p)).toBe("on");
    expect(recallMode("prompt", {}, p)).toBe("off");
  });

  it("env beats config; per-trigger env beats the global one; disable beats everything", () => {
    const p = cfgPath();
    saveModeConfig({ failure: "off", prompt: "off" }, p);
    expect(recallMode("failure", { HIVEMIND_PROACTIVE_RECALL: "on" }, p)).toBe("on");
    expect(recallMode("prompt", { HIVEMIND_PROACTIVE_RECALL: "on", HIVEMIND_RECALL_PROMPT: "shadow" }, p)).toBe("shadow");
    expect(recallMode("failure", { HIVEMIND_PROACTIVE_RECALL: "off", HIVEMIND_RECALL_FAILURE: "on" }, p)).toBe("off");
    expect(recallMode("failure", { HIVEMIND_PROACTIVE_RECALL_DISABLED: "1", HIVEMIND_RECALL_FAILURE: "on" }, p)).toBe("off");
  });

  it("accepts boolean-ish values and ignores garbage", () => {
    const p = cfgPath();
    expect(recallMode("failure", { HIVEMIND_RECALL_FAILURE: "true" }, p)).toBe("on");
    expect(recallMode("failure", { HIVEMIND_RECALL_FAILURE: "0" }, p)).toBe("off");
    expect(recallMode("failure", { HIVEMIND_RECALL_FAILURE: "banana" }, p)).toBe("on");
  });

  it("survives a corrupt config file", () => {
    const p = cfgPath();
    writeFileSync(p, "{not json");
    expect(recallMode("failure", {}, p)).toBe("on");
    expect(recallMode("prompt", {}, p)).toBe("shadow");
    saveModeConfig({ failure: "on" }, p);
    expect(JSON.parse(readFileSync(p, "utf-8"))).toEqual({ failure: "on" });
  });
});

describe("thresholds", () => {
  it("prompt is stricter than failure", () => {
    const f = thresholds("failure", {});
    const p = thresholds("prompt", {});
    expect(p.minMatched).toBeGreaterThan(f.minMatched);
    expect(p.minCoverage).toBeGreaterThan(f.minCoverage);
  });

  it("honors sane env overrides and rejects out-of-range ones", () => {
    expect(thresholds("failure", { HIVEMIND_RECALL_FAILURE_MIN_COVERAGE: "0.7" }).minCoverage).toBe(0.7);
    expect(thresholds("failure", { HIVEMIND_RECALL_FAILURE_MIN_COVERAGE: "7" }).minCoverage).toBe(0.45);
    expect(thresholds("prompt", { HIVEMIND_RECALL_PROMPT_MIN_PHRASES: "0" }).minPhrases).toBe(0);
  });
});
