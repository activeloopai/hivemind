import { afterEach, describe, expect, it } from "vitest";

/**
 * Contract for the explicit permission grants that replaced the blanket
 * `--permission-mode bypassPermissions` on the summarizer's `claude -p` calls.
 *
 * Why the swap: an enterprise policy can set
 * `"disableBypassPermissionsMode": "disable"`, after which the child ignores
 * the bypass, falls back to normal permissioning, refuses every path outside
 * the session cwd — which is exactly where the wiki worker's scratch dir and
 * the backfill's transcript/staging dirs live — and, because print mode cannot
 * prompt, exits 0 having written nothing. Naming the dirs and tools is both
 * policy-proof and least-privilege.
 *
 * Two halves matter equally: grants must REPLACE the bypass when supplied, and
 * the bypass must survive untouched for every caller that supplies none.
 */

import {
  buildClaudeInvocation,
  buildClaudeStdinInvocation,
  permissionFlags,
} from "../../src/hooks/wiki-worker-spawn.js";

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
});

describe("permissionFlags", () => {
  it("falls back to the blanket bypass when no grants are named", () => {
    expect(permissionFlags(undefined)).toEqual(["--permission-mode", "bypassPermissions"]);
  });

  it("emits one --add-dir per granted dir, then the allowed tools", () => {
    expect(permissionFlags({ addDirs: ["/a", "/b"], allowedTools: ["Read", "Write"] }))
      .toEqual(["--add-dir", "/a", "--add-dir", "/b", "--allowedTools", "Read", "Write"]);
  });

  it("accepts dirs without tools, and tools without dirs", () => {
    expect(permissionFlags({ addDirs: ["/a"] })).toEqual(["--add-dir", "/a"]);
    expect(permissionFlags({ allowedTools: ["Read"] })).toEqual(["--allowedTools", "Read"]);
  });

  it("falls back to the bypass rather than leaving the child with no grant at all", () => {
    // An empty grants object is a caller bug; degrading to today's behaviour
    // beats silently spawning a child that can reach nothing.
    expect(permissionFlags({})).toEqual(["--permission-mode", "bypassPermissions"]);
    expect(permissionFlags({ addDirs: [], allowedTools: [] })).toEqual(["--permission-mode", "bypassPermissions"]);
  });

  it("quotes granted paths only when asked (the Windows shell branch)", () => {
    const dir = "C:\\Users\\First Last\\AppData\\Local\\Temp\\deeplake-wiki-1";
    expect(permissionFlags({ addDirs: [dir] }, false)).toEqual(["--add-dir", dir]);
    expect(permissionFlags({ addDirs: [dir] }, true)).toEqual(["--add-dir", `"${dir}"`]);
  });
});

describe("buildClaudeInvocation — grants vs bypass", () => {
  it("replaces the bypass with the grants on the POSIX argv path", () => {
    setPlatform("linux");
    const inv = buildClaudeInvocation("/usr/local/bin/claude", "PROMPT", {
      addDirs: ["/tmp/deeplake-wiki-1"],
      allowedTools: ["Read", "Write"],
    });
    expect(inv.args).toEqual([
      "-p", "PROMPT",
      "--no-session-persistence",
      "--model", "haiku",
      "--add-dir", "/tmp/deeplake-wiki-1",
      "--allowedTools", "Read", "Write",
    ]);
    expect(inv.args).not.toContain("bypassPermissions");
  });

  it("leaves the bypass in place for a caller that names no grants", () => {
    setPlatform("linux");
    const inv = buildClaudeInvocation("/usr/local/bin/claude", "PROMPT");
    expect(inv.args).toEqual([
      "-p", "PROMPT",
      "--no-session-persistence",
      "--model", "haiku",
      "--permission-mode", "bypassPermissions",
    ]);
  });

  it("quotes the granted dir on the Windows .cmd branch, where args are re-joined into a command line", () => {
    // A Windows temp dir routinely contains spaces; unquoted it would split
    // into two args and the grant would silently name the wrong directory.
    setPlatform("win32");
    const dir = "C:\\Users\\First Last\\AppData\\Local\\Temp\\deeplake-wiki-1";
    const inv = buildClaudeInvocation("C:\\npm\\claude.cmd", "PROMPT", {
      addDirs: [dir],
      allowedTools: ["Read", "Write"],
    });
    expect(inv.args).toEqual([
      "-p",
      "--no-session-persistence",
      "--model", "haiku",
      "--add-dir", `"${dir}"`,
      "--allowedTools", "Read", "Write",
    ]);
    // The prompt still rides stdin, never the command line.
    expect(inv.args).not.toContain("PROMPT");
    expect(inv.options.input).toBe("PROMPT");
  });

  it("keeps the bypass on the Windows .cmd branch when no grants are named", () => {
    setPlatform("win32");
    const inv = buildClaudeInvocation("C:\\npm\\claude.cmd", "PROMPT");
    expect(inv.args).toEqual([
      "-p",
      "--no-session-persistence",
      "--model", "haiku",
      "--permission-mode", "bypassPermissions",
    ]);
  });
});

describe("buildClaudeStdinInvocation — grants vs bypass", () => {
  it("carries the grants through the stdin variant", () => {
    setPlatform("linux");
    const inv = buildClaudeStdinInvocation("/usr/local/bin/claude", "PROMPT", {
      addDirs: ["/tmp/staging"],
      allowedTools: ["Read", "Write"],
    });
    expect(inv.args).toEqual([
      "-p",
      "--no-session-persistence",
      "--model", "haiku",
      "--add-dir", "/tmp/staging",
      "--allowedTools", "Read", "Write",
    ]);
    expect(inv.options.input).toBe("PROMPT");
  });

  it("keeps the bypass in the stdin variant when no grants are named", () => {
    setPlatform("linux");
    const inv = buildClaudeStdinInvocation("/usr/local/bin/claude", "PROMPT");
    expect(inv.args).toContain("bypassPermissions");
  });
});
