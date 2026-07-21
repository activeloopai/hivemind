import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

import { safeEchoCommand } from "../../src/hooks/pre-tool-use.js";

/** Run a generated decision command through a real shell, return its stdout. */
function runVia(shell: string, cmd: string): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(shell, ["-c", cmd], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, stderr: "" };
  } catch (e) {
    // execFileSync throws on non-zero exit; we still want stdout/stderr.
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return { stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

// POSIX-only: every case shells out to /bin/bash and /bin/sh to verify the
// body is echoed verbatim (shell-injection-safety semantics). Windows has no
// /bin/bash or /bin/sh and no equivalent quoting model, so the suite is skipped.
describe.skipIf(process.platform === "win32")("safeEchoCommand — body emitted verbatim, no shell interpretation", () => {
  // The exact text that broke production: backtick-wrapped find/ inside index.md
  // caused `echo "...\`find/\`..."` to run `find/` as a command (stderr noise)
  // AND eat the content. safeEchoCommand must emit it literally with no stderr.
  const cases: Array<[string, string]> = [
    ["backticks (the real bug)", "a digit from a prior `find/` (e.g. 3)."],
    ["dollar var", "cost is $PATH and ${HOME} literally"],
    ["double quotes", 'a node showing "Incoming (0)" is not dead code'],
    ["single quotes", "it's a teammate's snapshot"],
    ["percent (printf format)", "100% done, %s and %d are literal"],
    ["backslashes", "path\\to\\thing and a \\n that is two chars"],
    ["multi-line", "# Title\n\nline 2\n  indented\nlast"],
    ["mixed nasties", "`cmd` $x \"q\" 'a' 100% \\z\nsecond line"],
    ["empty string", ""],
    ["trailing newline", "ends with a newline\n"],
    ["leading dash (not a printf flag)", "-n is just text, --help too"],
  ];

  for (const shell of ["/bin/bash", "/bin/sh"]) {
    describe(shell, () => {
      for (const [name, body] of cases) {
        it(`emits ${name} verbatim (+ trailing newline), no stderr`, () => {
          const { stdout, stderr } = runVia(shell, safeEchoCommand(body));
          expect(stdout).toBe(body + "\n");
          expect(stderr).toBe("");
        });
      }
    });
  }

  it("a backtick body produces NO 'No such file or directory' (the prod symptom)", () => {
    const { stdout, stderr } = runVia("/bin/bash", safeEchoCommand("see `query/` and `find/` below"));
    expect(stdout).toContain("`query/`");
    expect(stdout).toContain("`find/`");
    expect(stderr).not.toMatch(/No such file or directory/);
  });

  // Security: a body crafted to break out of the single quotes and inject a
  // command must NOT execute. If the `'\''` escaping ever regresses, the
  // injected `touch` would create the canary file and this test fails.
  for (const shell of ["/bin/bash", "/bin/sh"]) {
    it(`does not execute an injected command via quote breakout (${shell})`, () => {
      const canary = `/tmp/safe-echo-canary-${shell.replace(/\W/g, "_")}.flag`;
      // First make sure no stale canary exists.
      runVia(shell, `rm -f '${canary}'`);
      const payload = `x'; touch '${canary}'; echo 'pwned`;
      const { stdout } = runVia(shell, safeEchoCommand(payload));
      // The payload is emitted verbatim...
      expect(stdout).toBe(payload + "\n");
      // ...and the injected `touch` never ran.
      const { stdout: lsOut, stderr: lsErr } = runVia(shell, `ls '${canary}' 2>&1 || true`);
      expect(lsOut + lsErr).toMatch(/No such file or directory/);
    });
  }
});
