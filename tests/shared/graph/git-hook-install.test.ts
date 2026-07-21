import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync, chmodSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * CodeRabbit P1: install tests must not depend on a globally-installed
 * `hivemind` binary (CI fails otherwise — `which hivemind` returns
 * nothing). Stub it by prepending a tempdir to PATH with an executable
 * `hivemind` shim that just echoes its argv (the install path never
 * runs it — it only resolves the absolute path via `which`).
 */
function withFakeHivemindOnPath(): { restore: () => void; binDir: string } {
  const binDir = mkdtempSync(join(tmpdir(), "fake-hivemind-bin-"));
  const shim = join(binDir, "hivemind");
  writeFileSync(shim, "#!/bin/sh\necho fake hivemind\n");
  chmodSync(shim, 0o755);
  const prev = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${prev}`;
  return {
    binDir,
    restore: () => {
      process.env.PATH = prev;
      try { rmSync(binDir, { recursive: true, force: true }); } catch {}
    },
  };
}

import {
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
  buildHookFile,
  containsOurMarkers,
  gitHooksDir,
  installPostCommitHook,
  postCommitHookPath,
  uninstallPostCommitHook,
} from "../../../src/graph/git-hook-install.js";

function initGitRepo(dir: string): void {
  execSync("git init -q -b main", { cwd: dir });
  execSync('git config user.email "t@t.com"', { cwd: dir });
  execSync('git config user.name "t"', { cwd: dir });
}

describe("git-hook-install — discovery", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hook-disc-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("gitHooksDir returns null when not in a git repo", () => {
    expect(gitHooksDir(dir)).toBeNull();
  });

  it("gitHooksDir resolves .git/hooks for a real repo", () => {
    initGitRepo(dir);
    const hooks = gitHooksDir(dir);
    expect(hooks).not.toBeNull();
    expect(hooks).toMatch(/[/\\]hooks$/);
    expect(existsSync(hooks!)).toBe(true);
  });

  it("postCommitHookPath returns null outside git", () => {
    expect(postCommitHookPath(dir)).toBeNull();
  });

  it("postCommitHookPath returns expected path inside git", () => {
    initGitRepo(dir);
    expect(postCommitHookPath(dir)).toMatch(/[/\\]post-commit$/);
  });
});

describe("git-hook-install — install/uninstall lifecycle", () => {
  let dir: string;
  let pathStub: ReturnType<typeof withFakeHivemindOnPath>;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hook-life-"));
    initGitRepo(dir);
    pathStub = withFakeHivemindOnPath();
  });
  afterEach(() => {
    pathStub.restore();
    rmSync(dir, { recursive: true, force: true });
  });

  // Unix file-mode bits: asserts the hook's executable bit (mode & 0o100).
  // Windows has no POSIX permission bits, so the executable-bit assertion
  // doesn't hold there — skipped on Windows.
  it.skipIf(process.platform === "win32")("install on fresh repo writes a hook with both markers + executable bit", () => {
    const r = installPostCommitHook(dir);
    expect(r.kind).toBe("installed");
    if (r.kind !== "installed") return;
    expect(existsSync(r.path)).toBe(true);
    const content = readFileSync(r.path, "utf8");
    expect(content).toContain(HOOK_BEGIN_MARKER);
    expect(content).toContain(HOOK_END_MARKER);
    expect(content).toContain("#!/bin/sh");
    // Hook embeds an absolute path to hivemind in single quotes — codex P1 fix
    expect(content).toMatch(/'\S+' graph build --trigger post-commit/);
    // executable bit on POSIX; on Windows this is moot but mode is still set
    const mode = statSync(r.path).mode & 0o777;
    expect(mode & 0o100).toBe(0o100);
  });

  it("install on already-managed hook is idempotent (no rewrite needed)", () => {
    const r1 = installPostCommitHook(dir);
    expect(r1.kind).toBe("installed");
    const r2 = installPostCommitHook(dir);
    expect(r2.kind).toBe("already-ours");
  });

  it("install refuses to clobber a foreign hook unless --force", () => {
    const path = postCommitHookPath(dir)!;
    writeFileSync(path, "#!/bin/sh\n# user wrote this themselves\necho hi\n");
    const r = installPostCommitHook(dir);
    expect(r.kind).toBe("foreign-hook");
    if (r.kind !== "foreign-hook") return;
    expect(r.hint).toContain("--force");
    // the file is untouched
    expect(readFileSync(path, "utf8")).toContain("user wrote this");
  });

  it("install with force overwrites a foreign hook", () => {
    const path = postCommitHookPath(dir)!;
    writeFileSync(path, "#!/bin/sh\necho user\n");
    const r = installPostCommitHook(dir, { force: true });
    expect(r.kind).toBe("installed");
    const content = readFileSync(path, "utf8");
    expect(content).toContain(HOOK_BEGIN_MARKER);
    expect(content).not.toContain("echo user");
  });

  it("uninstall: no hook → no-op", () => {
    const r = uninstallPostCommitHook(dir);
    expect(r.kind).toBe("no-hook");
  });

  it("uninstall: hook is ours-only → file deleted", () => {
    installPostCommitHook(dir);
    const path = postCommitHookPath(dir)!;
    expect(existsSync(path)).toBe(true);
    const r = uninstallPostCommitHook(dir);
    expect(r.kind).toBe("removed");
    if (r.kind === "removed") expect(r.wholeFileDeleted).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it("uninstall: hook has our block + user content → only our block stripped", () => {
    const path = postCommitHookPath(dir)!;
    // Write a hook where our block is sandwiched between user lines.
    const before = "#!/bin/sh\necho 'user prelude'\n";
    const ours = buildHookFile("/usr/local/bin/hivemind").split("\n").slice(1).join("\n"); // drop the shebang
    const after = "\necho 'user postlude'\n";
    writeFileSync(path, before + ours + after);
    const r = uninstallPostCommitHook(dir);
    expect(r.kind).toBe("removed");
    if (r.kind === "removed") expect(r.wholeFileDeleted).toBe(false);
    const content = readFileSync(path, "utf8");
    expect(content).toContain("user prelude");
    expect(content).toContain("user postlude");
    expect(content).not.toContain(HOOK_BEGIN_MARKER);
    expect(content).not.toContain(HOOK_END_MARKER);
  });

  it("uninstall: foreign hook (no markers) → refuse", () => {
    const path = postCommitHookPath(dir)!;
    writeFileSync(path, "#!/bin/sh\necho not ours\n");
    const r = uninstallPostCommitHook(dir);
    expect(r.kind).toBe("not-ours");
    if (r.kind === "not-ours") expect(r.hint).toContain("not managed by hivemind");
    // file untouched
    expect(readFileSync(path, "utf8")).toContain("not ours");
  });

  it("uninstall: outside a git repo → no-hook with empty path", () => {
    const nonGit = mkdtempSync(join(tmpdir(), "no-git-"));
    try {
      const r = uninstallPostCommitHook(nonGit);
      expect(r.kind).toBe("no-hook");
      if (r.kind === "no-hook") expect(r.path).toBe("");
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it("install: outside a git repo → foreign-hook with hint", () => {
    const nonGit = mkdtempSync(join(tmpdir(), "no-git-"));
    try {
      const r = installPostCommitHook(nonGit);
      expect(r.kind).toBe("foreign-hook");
      if (r.kind === "foreign-hook") expect(r.hint).toContain("not in a git repo");
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe("git-hook-install — helpers", () => {
  it("containsOurMarkers true when both markers present", () => {
    expect(containsOurMarkers(buildHookFile("/usr/local/bin/hivemind"))).toBe(true);
  });
  it("containsOurMarkers false when only one marker present", () => {
    expect(containsOurMarkers("#!/bin/sh\n" + HOOK_BEGIN_MARKER + "\n")).toBe(false);
    expect(containsOurMarkers("#!/bin/sh\n" + HOOK_END_MARKER + "\n")).toBe(false);
  });
  it("buildHookFile embeds the resolved hivemind path", () => {
    const body = buildHookFile("/opt/hivemind/bin/hivemind");
    expect(body).toContain("'/opt/hivemind/bin/hivemind' graph build --trigger post-commit");
  });
  it("buildHookFile single-quotes a path containing spaces", () => {
    const body = buildHookFile("/Users/Mario Rossi/bin/hivemind");
    // Shell single-quote wrapping
    expect(body).toContain("'/Users/Mario Rossi/bin/hivemind'");
  });
  it("buildHookFile includes mkdir -p safety line (codex P1 fix)", () => {
    const body = buildHookFile("/usr/local/bin/hivemind");
    expect(body).toContain('mkdir -p "$HOME/.hivemind"');
  });
});

describe("git-hook-install — codex P1 followups", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hook-p1-"));
    initGitRepo(dir);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("honors core.hooksPath when set (codex P1)", () => {
    const customHooks = join(dir, "custom-hooks");
    mkdirSync(customHooks, { recursive: true });
    execSync(`git config core.hooksPath "${customHooks}"`, { cwd: dir });
    const resolved = gitHooksDir(dir);
    expect(resolved).toBe(customHooks);
    // postCommitHookPath should follow
    expect(postCommitHookPath(dir)).toBe(join(customHooks, "post-commit"));
  });

  it("strips ONLY our block, preserves user blank lines + heredoc-like content (codex P1)", () => {
    const path = postCommitHookPath(dir)!;
    // User content with intentional blank lines and a heredoc
    const userBefore = [
      "#!/bin/sh",
      "",
      "",  // intentional triple blank line user might rely on
      "cat <<'EOF'",
      "line1",
      "",
      "line3 with blank above",
      "EOF",
      "",
    ].join("\n");
    const ours = [
      HOOK_BEGIN_MARKER,
      "mkdir -p \"$HOME/.hivemind\" 2>/dev/null || true",
      "nohup '/usr/bin/hivemind' graph build --trigger post-commit &",
      HOOK_END_MARKER,
    ].join("\n");
    const userAfter = "\n\necho after\n";
    writeFileSync(path, userBefore + ours + userAfter);
    const r = uninstallPostCommitHook(dir);
    expect(r.kind).toBe("removed");
    if (r.kind === "removed") expect(r.wholeFileDeleted).toBe(false);
    const content = readFileSync(path, "utf8");
    // User content preserved byte-for-byte except the marker block:
    expect(content).toBe(userBefore + userAfter);
  });
});
