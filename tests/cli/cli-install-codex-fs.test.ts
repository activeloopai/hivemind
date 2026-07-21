import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, utimesSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";
import { HIVEMIND_BLOCK_START, HIVEMIND_BLOCK_END } from "../../src/cli/agents-md.js";

/**
 * Tests for the disk-side of src/cli/install-codex.ts.
 *
 * The pure helpers (`isHivemindHookEntry`, `mergeHooks`) already have
 * coverage in install-helpers.test.ts. Here we exercise installCodex /
 * uninstallCodex against a real (tmp) ~/.codex layout — copying the
 * fake bundle, writing hooks.json, dropping the agentskills symlink,
 * stamping the version, and the uninstall counterpart.
 *
 * To redirect HOME and pkgRoot to the tmp dir we:
 *   - stub process.env.HOME before importing util.js (so homedir() picks
 *     up the tmp path) and
 *   - vi.doMock util.js's pkgRoot() to return the tmp source root
 * (CLAUDE.md rule 5: mock at the boundary, not in the middle.)
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;
const execFileSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...a: unknown[]) => execFileSyncMock(...a),
}));

beforeEach(() => {
  // mkdtempSync creates a securely-unique temp dir (vs join(tmpdir(), predictable)),
  // satisfying CodeQL js/insecure-temporary-file for the writes underneath it.
  tmpRoot = mkdtempSync(join(tmpdir(), "hm-codex-"));
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");

  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(join(tmpHome, ".codex"), { recursive: true });

  // Mock package layout: pkgRoot/codex/{bundle,skills}/<files>
  mkdirSync(join(tmpPkg, "harnesses", "codex", "bundle"), { recursive: true });
  writeFileSync(join(tmpPkg, "harnesses", "codex", "bundle", "session-start.js"), "// fake bundle file");
  writeFileSync(join(tmpPkg, "harnesses", "codex", "bundle", "capture.js"), "// fake bundle file");
  mkdirSync(join(tmpPkg, "harnesses", "codex", "skills", "deeplake-memory"), { recursive: true });
  writeFileSync(join(tmpPkg, "harnesses", "codex", "skills", "deeplake-memory", "SKILL.md"), "fake skill body");
  // Mock package.json so getVersion() resolves to a known value.
  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "1.2.3" }));

  setFakeHome(tmpHome);
  execFileSyncMock.mockReset();
  // Silence stdout/stderr noise from the installer's log() calls.
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importInstaller(): Promise<typeof import("../../src/cli/install-codex.js")> {
  vi.resetModules();
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import("../../src/cli/install-codex.js");
}

describe("installCodex — happy path", () => {
  it("creates the plugin dir, copies the bundle, writes the skill symlink target, and stamps version", async () => {
    const { installCodex } = await importInstaller();
    installCodex();

    const pluginDir = join(tmpHome, ".codex", "hivemind");
    expect(existsSync(pluginDir)).toBe(true);
    expect(existsSync(join(pluginDir, "bundle", "session-start.js"))).toBe(true);
    expect(existsSync(join(pluginDir, "bundle", "capture.js"))).toBe(true);
    expect(existsSync(join(pluginDir, "skills", "deeplake-memory", "SKILL.md"))).toBe(true);
    expect(readFileSync(join(pluginDir, ".hivemind_version"), "utf-8")).toBe("1.2.3");
  });

  it("writes a hooks.json with exactly five hivemind events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop", async () => {
    const { installCodex } = await importInstaller();
    installCodex();

    const hooks = JSON.parse(readFileSync(join(tmpHome, ".codex", "hooks.json"), "utf-8"));
    expect(Object.keys(hooks.hooks).sort()).toEqual([
      "PostToolUse", "PreToolUse", "SessionStart", "Stop", "UserPromptSubmit",
    ]);
    // Each of our events ships exactly one entry on cold install.
    for (const event of Object.keys(hooks.hooks)) {
      expect(hooks.hooks[event]).toHaveLength(1);
    }
    expect(hooks.hooks.SessionStart[0].matcher).toBe("startup|resume");
    expect(hooks.hooks.SessionStart[0].hooks[0].timeout).toBe(10);
    // PreToolUse carries the Bash matcher.
    expect(hooks.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(hooks.hooks.PreToolUse[0].hooks[0].timeout).toBe(10);
    // G3: the single Stop block carries BOTH stop.js and graph-on-stop.js.
    const stopCmds = hooks.hooks.Stop[0].hooks.map((h: { command: string }) => h.command);
    expect(stopCmds.some((c: string) => c.includes("stop.js"))).toBe(true);
    expect(stopCmds.some((c: string) => c.includes("graph-on-stop.js"))).toBe(true);
  });

  it("is idempotent: a second install does NOT rewrite hooks.json (avoids Codex re-trust prompt)", async () => {
    const { installCodex } = await importInstaller();
    installCodex();
    const hooksPath = join(tmpHome, ".codex", "hooks.json");
    const content1 = readFileSync(hooksPath, "utf-8");

    // Pin mtime to the past — a real rewrite would bump it to ~now. This is
    // the regression guard: pre-fix, install() always rewrote the file, which
    // re-triggered Codex's "Hooks need review" prompt on every install/update.
    const past = new Date("2020-01-01T00:00:00Z");
    utimesSync(hooksPath, past, past);

    installCodex(); // re-install, same version/bundle → merged result identical

    expect(readFileSync(hooksPath, "utf-8")).toBe(content1); // content stable
    expect(statSync(hooksPath).mtimeMs).toBe(past.getTime()); // file NOT rewritten
  });

  it("DOES rewrite hooks.json when a stale/foreign entry must be merged out (write path still works)", async () => {
    const { installCodex } = await importInstaller();
    const hooksPath = join(tmpHome, ".codex", "hooks.json");
    // Pre-seed a hooks.json that differs from the canonical install result
    // (a user's own hook on an event we don't claim) so the merge changes it.
    writeFileSync(hooksPath, JSON.stringify({
      hooks: { Notification: [{ hooks: [{ type: "command", command: "/usr/local/bin/notify.sh" }] }] },
    }, null, 2) + "\n");
    const past = new Date("2020-01-01T00:00:00Z");
    utimesSync(hooksPath, past, past);

    installCodex();

    // It rewrote (mtime moved) and the user's hook survived alongside ours.
    expect(statSync(hooksPath).mtimeMs).not.toBe(past.getTime());
    const merged = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(merged.hooks.Notification).toHaveLength(1);
    expect(merged.hooks.PostToolUse).toHaveLength(1);
  });

  it("creates the agentskills symlink at ~/.agents/skills/hivemind-memory", async () => {
    const { installCodex } = await importInstaller();
    installCodex();

    const link = join(tmpHome, ".agents", "skills", "hivemind-memory");
    expect(existsSync(link)).toBe(true);
    // Validate it points at the real on-disk skill payload.
    expect(existsSync(join(link, "SKILL.md"))).toBe(true);
  });

  it("attempts to enable the renamed `hooks` codex feature (best-effort, no throw on failure)", async () => {
    execFileSyncMock.mockImplementation(() => { throw new Error("codex not installed"); });
    const { installCodex } = await importInstaller();
    expect(() => installCodex()).not.toThrow();
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "codex",
      ["features", "enable", "hooks"],
      expect.any(Object),
    );
    // Defends against accidentally regressing to the deprecated flag name.
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      "codex",
      ["features", "enable", "codex_hooks"],
      expect.any(Object),
    );
  });

  it("does NOT strip the legacy `codex_hooks` key when `codex features enable hooks` fails", async () => {
    // Regression guard: on pre-0.130 codex (or when the codex CLI isn't on
    // PATH at all) the enable call throws. Stripping the legacy key in that
    // case would silently disable hooks for users whose only working entry is
    // `codex_hooks = true`.
    execFileSyncMock.mockImplementation(() => { throw new Error("codex not installed"); });
    const cfgPath = join(tmpHome, ".codex", "config.toml");
    const body = ["[features]", "codex_hooks = true", ""].join("\n");
    writeFileSync(cfgPath, body);
    const { installCodex } = await importInstaller();
    installCodex();
    expect(readFileSync(cfgPath, "utf-8")).toBe(body);
  });

  it("strips a legacy `codex_hooks = ...` line from ~/.codex/config.toml on install", async () => {
    const cfgPath = join(tmpHome, ".codex", "config.toml");
    writeFileSync(
      cfgPath,
      [
        "model = \"gpt-5\"",
        "",
        "[features]",
        "codex_hooks = true",
        "hooks = true",
        "some_other = true",
        "",
      ].join("\n"),
    );
    const { installCodex } = await importInstaller();
    installCodex();
    const cleaned = readFileSync(cfgPath, "utf-8");
    expect(cleaned).not.toMatch(/^[ \t]*codex_hooks[ \t]*=/m);
    // Everything else is preserved.
    expect(cleaned).toMatch(/^hooks = true$/m);
    expect(cleaned).toMatch(/^some_other = true$/m);
    expect(cleaned).toMatch(/^\[features\]$/m);
    expect(cleaned).toMatch(/^model = "gpt-5"$/m);
  });

  it("leaves config.toml untouched when no legacy `codex_hooks` line is present", async () => {
    const cfgPath = join(tmpHome, ".codex", "config.toml");
    const body = ["[features]", "hooks = true", ""].join("\n");
    writeFileSync(cfgPath, body);
    const { installCodex } = await importInstaller();
    installCodex();
    expect(readFileSync(cfgPath, "utf-8")).toBe(body);
  });

  it("does not match keys that merely share a `codex_hooks` prefix or appear in table headers", async () => {
    const cfgPath = join(tmpHome, ".codex", "config.toml");
    const body = [
      "[features]",
      "codex_hooks_other = true",
      "",
      "[features.codex_hooks]",
      "nested = 1",
      "",
    ].join("\n");
    writeFileSync(cfgPath, body);
    const { installCodex } = await importInstaller();
    installCodex();
    // Whole body should survive — neither line is the deprecated top-level key.
    expect(readFileSync(cfgPath, "utf-8")).toBe(body);
  });

  it("does not crash when config.toml does not exist", async () => {
    // tmpHome/.codex exists but config.toml does not (default test setup).
    const { installCodex } = await importInstaller();
    expect(() => installCodex()).not.toThrow();
    expect(existsSync(join(tmpHome, ".codex", "config.toml"))).toBe(false);
  });

  it("preserves a user-defined hook on a non-hivemind event when re-installing over an existing config", async () => {
    // CLAUDE.md rule 12: failure case before the fix surface — write the
    // shape of an existing hooks.json that the bug would clobber.
    const userHook = {
      hooks: [{ type: "command", command: "/usr/local/bin/audit.sh", timeout: 5 }],
    };
    writeFileSync(
      join(tmpHome, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { Notification: [userHook] }, version: 7 }),
    );

    const { installCodex } = await importInstaller();
    installCodex();

    const hooks = JSON.parse(readFileSync(join(tmpHome, ".codex", "hooks.json"), "utf-8"));
    expect(hooks.hooks.Notification).toHaveLength(1);
    expect(hooks.hooks.Notification[0]).toEqual(userHook);
    // Top-level metadata survives.
    expect(hooks.version).toBe(7);
  });

  it("re-install over a malformed hooks.json does not throw and writes a fresh one", async () => {
    writeFileSync(join(tmpHome, ".codex", "hooks.json"), "{ not json");
    const { installCodex } = await importInstaller();
    expect(() => installCodex()).not.toThrow();
    const hooks = JSON.parse(readFileSync(join(tmpHome, ".codex", "hooks.json"), "utf-8"));
    expect(hooks.hooks.SessionStart).toBeDefined();
  });

  it("warns and skips the symlink (without throwing) when the skill source is missing", async () => {
    rmSync(join(tmpPkg, "harnesses", "codex", "skills", "deeplake-memory"), { recursive: true, force: true });
    const { installCodex } = await importInstaller();
    expect(() => installCodex()).not.toThrow();
    expect(existsSync(join(tmpHome, ".agents", "skills", "hivemind-memory"))).toBe(false);
  });

  it("throws when the bundle source is missing (build hasn't run)", async () => {
    rmSync(join(tmpPkg, "harnesses", "codex", "bundle"), { recursive: true, force: true });
    const { installCodex } = await importInstaller();
    expect(() => installCodex()).toThrow(/Codex bundle missing/);
  });

  it("strips a non-canonical hivemind hook entry (sibling dev-clone leftover) and warns about it", async () => {
    // Realistic dual-install fixture: a previous `npm link` of a hivemind dev
    // clone left a SessionStart hook pointing at /tmp/old-clone instead of
    // the canonical ~/.codex/hivemind. installCodex must recognise that as
    // ours-but-foreign, strip it, and surface what it stripped to stderr.
    const foreignCmd = `node "/tmp/old-clone/codex/bundle/session-start.js"`;
    writeFileSync(
      join(tmpHome, ".codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: foreignCmd, timeout: 10 }] }],
        },
      }),
    );

    const stderrCalls: string[] = [];
    // Re-spy so we can read what reportForeignHivemindHooks wrote.
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrCalls.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });

    const { installCodex } = await importInstaller();
    installCodex();

    const hooks = JSON.parse(readFileSync(join(tmpHome, ".codex", "hooks.json"), "utf-8"));
    // SessionStart has exactly one entry — the canonical one — and the
    // foreign /tmp/old-clone path is gone.
    expect(hooks.hooks.SessionStart).toHaveLength(1);
    // Normalize separators: on Windows the command is written with backslashes
    // (join()), so compare against a join()-built path with both sides slashed.
    const cmd = hooks.hooks.SessionStart[0].hooks[0].command.replace(/\\/g, "/");
    const canonical = join(tmpHome, ".codex", "hivemind", "bundle", "session-start.js").replace(/\\/g, "/");
    expect(cmd).toContain(canonical);
    expect(cmd).not.toContain("/tmp/old-clone");

    const warns = stderrCalls.join("");
    expect(warns).toContain("non-canonical path");
    expect(warns).toContain(foreignCmd);
  });

  it("does NOT classify an entry as foreign when its hooks[] contains a malformed sibling element", async () => {
    // Edge case: an entry whose hooks[] mixes one canonical hivemind hook
    // with garbage (a null entry, a hook with a non-string command). The
    // canonical hook is recognised — so the entry is hivemind and gets
    // stripped — but the malformed siblings short-circuit the "is foreign"
    // check, so we must NOT report this entry as a non-canonical dev clone.
    const canonicalForeignCmd = `node "/opt/other-install/codex/bundle/capture.js"`;
    const otherForeignCmd     = `node "/opt/other-install/codex/bundle/pre-tool-use.js"`;
    writeFileSync(
      join(tmpHome, ".codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          // Order matters: `.every()` short-circuits on the first false, so
          // we need two events to reach BOTH malformed branches —
          // PostToolUse exercises the null guard (h is null), PreToolUse
          // exercises the non-string command guard (typeof cmd !== "string").
          PostToolUse: [{
            hooks: [
              { type: "command", command: canonicalForeignCmd, timeout: 15 },
              null,
            ],
          }],
          PreToolUse: [{
            hooks: [
              { type: "command", command: otherForeignCmd, timeout: 15 },
              { type: "command", command: 12345 },
            ],
          }],
        },
      }),
    );

    const stderrCalls: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrCalls.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });

    const { installCodex } = await importInstaller();
    installCodex();

    const hooks = JSON.parse(readFileSync(join(tmpHome, ".codex", "hooks.json"), "utf-8"));
    // Stripped from both events — only our canonical entries remain.
    expect(hooks.hooks.PostToolUse).toHaveLength(1);
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
    // Normalize separators (Windows join() writes backslashes).
    const slash = (s: string): string => s.replace(/\\/g, "/");
    expect(slash(hooks.hooks.PostToolUse[0].hooks[0].command))
      .toContain(slash(join(tmpHome, ".codex", "hivemind", "bundle", "capture.js")));
    expect(slash(hooks.hooks.PreToolUse[0].hooks[0].command))
      .toContain(slash(join(tmpHome, ".codex", "hivemind", "bundle", "pre-tool-use.js")));

    // And: no foreign warning, because neither entry passed isForeign (the
    // malformed siblings made `.every()` return false in both).
    const warns = stderrCalls.join("");
    expect(warns).not.toContain("non-canonical path");
    expect(warns).not.toContain(canonicalForeignCmd);
    expect(warns).not.toContain(otherForeignCmd);
  });
});

// Reuse the source-of-truth markers so the test tracks any format change.
const BEGIN = HIVEMIND_BLOCK_START;
const END = HIVEMIND_BLOCK_END;

describe("installCodex — AGENTS.md memory block", () => {
  const agentsPath = (): string => join(tmpHome, ".codex", "AGENTS.md");

  it("creates ~/.codex/AGENTS.md with exactly one hivemind block carrying the proactive instruction", async () => {
    const { installCodex } = await importInstaller();
    installCodex();
    const md = readFileSync(agentsPath(), "utf-8");
    expect((md.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
    expect(md).toContain(END);
    // The whole point: proactive memory + rules/goals guidance is injected
    // here (silent model context), not in the user-visible session-start hook.
    expect(md).toContain("Proactively consult");
    expect(md).toContain("hivemind rules list");
    expect(md).toContain("hivemind goal list --mine");
  });

  it("preserves a user's pre-existing AGENTS.md content; appends the block once", async () => {
    writeFileSync(agentsPath(), "# My Codex notes\nUser content here.\n");
    const { installCodex } = await importInstaller();
    installCodex();
    const md = readFileSync(agentsPath(), "utf-8");
    expect(md).toContain("# My Codex notes");
    expect(md).toContain("User content here.");
    expect((md.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
  });

  it("is idempotent: re-running installCodex 5x leaves exactly one block", async () => {
    const { installCodex } = await importInstaller();
    for (let i = 0; i < 5; i++) installCodex();
    const md = readFileSync(agentsPath(), "utf-8");
    expect((md.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
    expect((md.match(new RegExp(END, "g")) ?? []).length).toBe(1);
  });
});

describe("uninstallCodex", () => {
  it("strips the hivemind block from AGENTS.md while preserving user content", async () => {
    const agentsPath = join(tmpHome, ".codex", "AGENTS.md");
    writeFileSync(agentsPath, `# Header\nuser line\n\n${BEGIN}\nstale\n${END}\n\n## After\nmore user\n`);
    const { uninstallCodex } = await importInstaller();
    uninstallCodex();
    const md = readFileSync(agentsPath, "utf-8");
    expect(md).not.toContain(BEGIN);
    expect(md).toContain("# Header");
    expect(md).toContain("more user");
  });

  it("removes AGENTS.md entirely when only our block existed", async () => {
    const { installCodex, uninstallCodex } = await importInstaller();
    installCodex();
    expect(existsSync(join(tmpHome, ".codex", "AGENTS.md"))).toBe(true);
    uninstallCodex();
    expect(existsSync(join(tmpHome, ".codex", "AGENTS.md"))).toBe(false);
  });

  it("removes hooks.json and the agentskills symlink, but keeps the plugin payload", async () => {
    const { installCodex, uninstallCodex } = await importInstaller();
    installCodex();
    expect(existsSync(join(tmpHome, ".codex", "hooks.json"))).toBe(true);
    expect(existsSync(join(tmpHome, ".agents", "skills", "hivemind-memory"))).toBe(true);

    uninstallCodex();
    expect(existsSync(join(tmpHome, ".codex", "hooks.json"))).toBe(false);
    expect(existsSync(join(tmpHome, ".agents", "skills", "hivemind-memory"))).toBe(false);
    // Plugin payload is intentionally preserved (lets the user re-install
    // without re-downloading) — assert the bundle is still there.
    expect(existsSync(join(tmpHome, ".codex", "hivemind", "bundle", "session-start.js"))).toBe(true);
  });

  it("is a no-op when there's nothing to remove (cold uninstall)", async () => {
    const { uninstallCodex } = await importInstaller();
    expect(() => uninstallCodex()).not.toThrow();
  });

  it("preserves a non-hivemind hook during uninstall: rewrites hooks.json instead of deleting it", async () => {
    // Install hivemind, then mix in a user-owned hook that shares an event
    // with us. Uninstall must strip our entries but keep the user's, which
    // exercises the writeJson branch (hooks.json survives) rather than the
    // unlinkSync branch (hooks.json deleted because nothing else is left).
    const { installCodex, uninstallCodex } = await importInstaller();
    installCodex();
    const hooksPath = join(tmpHome, ".codex", "hooks.json");
    const cfg = JSON.parse(readFileSync(hooksPath, "utf-8"));
    const userHook = { hooks: [{ type: "command", command: "/usr/local/bin/audit.sh", timeout: 5 }] };
    cfg.hooks.PostToolUse.push(userHook);
    cfg.version = 9;
    writeFileSync(hooksPath, JSON.stringify(cfg));

    uninstallCodex();

    expect(existsSync(hooksPath)).toBe(true);
    const after = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(after.hooks.PostToolUse).toHaveLength(1);
    expect(after.hooks.PostToolUse[0]).toEqual(userHook);
    // Top-level metadata is preserved through the rewrite.
    expect(after.version).toBe(9);
    // Hivemind-only events lose their entries entirely.
    expect(after.hooks.SessionStart ?? []).toHaveLength(0);
  });

  it("uninstall on a malformed hooks.json deletes the file rather than crashing", async () => {
    // Lock the catch path inside uninstallCodex that handles unparseable
    // JSON: we'd rather drop the file than guess at intent (the user can
    // re-install cleanly).
    const { uninstallCodex } = await importInstaller();
    const hooksPath = join(tmpHome, ".codex", "hooks.json");
    writeFileSync(hooksPath, "{ this is not valid json");
    expect(() => uninstallCodex()).not.toThrow();
    expect(existsSync(hooksPath)).toBe(false);
  });
});
