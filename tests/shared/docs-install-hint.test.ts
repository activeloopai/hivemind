import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  docsHintShown,
  docsInstallLines,
  markDocsHintShown,
  shouldPromptDocsSetup,
  isHomeRoot,
} from "../../src/docs/install-hint.js";

describe("docsInstallLines (install-time docs onboarding)", () => {
  it("explains both enabling and disabling in one block", () => {
    const text = docsInstallLines().join("\n");
    // Enable path.
    expect(text).toContain("hivemind docs sync");
    // Disable path — the user must never be stuck after opting in.
    expect(text).toContain("hivemind docs auto off");
    // Status is discoverable.
    expect(text).toContain("hivemind docs list");
  });

  it("is a non-empty list of plain strings (safe to feed line-by-line to log)", () => {
    const lines = docsInstallLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });
});

describe("shouldPromptDocsSetup (ask in-repo, else fall back to the hint)", () => {
  it("prompts only when interactive AND in a git repo AND signed in", () => {
    expect(shouldPromptDocsSetup({ interactive: true, inGitRepo: true, loggedIn: true })).toBe(true);
  });

  it("does not prompt when any precondition is missing", () => {
    expect(shouldPromptDocsSetup({ interactive: false, inGitRepo: true, loggedIn: true })).toBe(false);
    expect(shouldPromptDocsSetup({ interactive: true, inGitRepo: false, loggedIn: true })).toBe(false);
    expect(shouldPromptDocsSetup({ interactive: true, inGitRepo: true, loggedIn: false })).toBe(false);
  });

  it("does not prompt when the git root is the user's home (dotfiles repo)", () => {
    expect(shouldPromptDocsSetup({ interactive: true, inGitRepo: true, loggedIn: true, atHome: true })).toBe(false);
    // atHome omitted/false keeps the normal behavior.
    expect(shouldPromptDocsSetup({ interactive: true, inGitRepo: true, loggedIn: true, atHome: false })).toBe(true);
  });
});

describe("isHomeRoot (cross-platform home comparison)", () => {
  it("matches equivalent paths through path.resolve (trailing slash, .., etc.)", () => {
    expect(isHomeRoot("/home/x", "/home/x")).toBe(true);
    expect(isHomeRoot("/home/x/", "/home/x")).toBe(true);
    expect(isHomeRoot("/home/y/../x", "/home/x")).toBe(true);
  });
  it("does not match a subdirectory of home", () => {
    expect(isHomeRoot("/home/x/project", "/home/x")).toBe(false);
  });
});

describe("first-install sentinel (show the hint once)", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-hint-"));
    file = join(dir, ".docs-hint-shown");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is not shown before the first install, shown after marking", () => {
    expect(docsHintShown(file)).toBe(false); // first install → show
    markDocsHintShown(file);
    expect(docsHintShown(file)).toBe(true); // subsequent installs → quiet
  });

  it("markDocsHintShown never throws when the path is unwritable (best-effort)", () => {
    // Point at a path whose parent is a FILE, not a directory: mkdirSync
    // fails fast with ENOTDIR and the best-effort catch must swallow it.
    // (Do NOT use a /proc/<missing> path — recursive mkdirSync walks up a
    // non-existent procfs chain and hangs, which once froze the whole suite.)
    const blocker = join(dir, "not-a-dir");
    writeFileSync(blocker, "x");
    expect(() => markDocsHintShown(join(blocker, "child", ".docs-hint-shown"))).not.toThrow();
  });
});
