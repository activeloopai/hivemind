import { describe, expect, it } from "vitest";
import { wikiFreshnessHint } from "../../src/commands/docs.js";

// The hint is the passive fallback shown after `docs wiki` when the user
// declines (or can't be asked about) auto refresh. Each of the four
// (autoEnabled, hookInstalled) states must yield the RIGHT message — the bug
// this guards is "correct text for the wrong state", so we assert both what
// each message says and what it must NOT say.
describe("wikiFreshnessHint", () => {
  it("stays silent when fully wired (auto on + hook)", () => {
    expect(wikiFreshnessHint({ autoEnabled: true, hookInstalled: true, subject: "This wiki" })).toBeNull();
  });

  it("auto ON, no hook → offers per-commit upgrade, never claims it's stale", () => {
    const h = wikiFreshnessHint({ autoEnabled: true, hookInstalled: false, subject: "This wiki" });
    expect(h).not.toBeNull();
    expect(h!).toContain("graph init");
    expect(h!).not.toMatch(/NOT stay fresh/);
    expect(h!).not.toContain("docs auto on");
  });

  it("auto OFF, hook present → warns it won't refresh, names docs auto on, NOT graph init", () => {
    const h = wikiFreshnessHint({ autoEnabled: false, hookInstalled: true, subject: "This wiki" });
    expect(h).not.toBeNull();
    expect(h!).toMatch(/NOT stay fresh/);
    expect(h!).toContain("docs auto on");
    expect(h!).not.toContain("graph init");
  });

  it("auto OFF, no hook → names BOTH remedies", () => {
    const h = wikiFreshnessHint({ autoEnabled: false, hookInstalled: false, subject: "This wiki" });
    expect(h).not.toBeNull();
    expect(h!).toMatch(/NOT stay fresh/);
    expect(h!).toContain("docs auto on");
    expect(h!).toContain("graph init");
  });

  it("subject drives the noun — per-file path must not say 'wiki'", () => {
    const wiki = wikiFreshnessHint({ autoEnabled: false, hookInstalled: false, subject: "This wiki" });
    const perFile = wikiFreshnessHint({ autoEnabled: false, hookInstalled: false, subject: "These docs" });
    expect(wiki!).toContain("This wiki will NOT stay fresh");
    expect(perFile!).toContain("These docs will NOT stay fresh");
    expect(perFile!).not.toContain("wiki");
  });
});
