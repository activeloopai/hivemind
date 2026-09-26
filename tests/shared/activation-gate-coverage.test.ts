import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * COVERAGE GUARD for the activation gate (src/activation.ts).
 *
 * "Opt-in" only means something if EVERY agent hook that can inject context,
 * hit the network, or capture checks it. A single ungated hook (e.g. a new
 * session-start variant) silently breaks the promise to users who asked for
 * Hivemind to be inactive outside opted-in repos. This test lists every hook
 * entrypoint the harness installers register and requires an
 * `isHivemindActive(` call in each.
 */

const __dir = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(__dir, "..", "..", "src");

const GATED_HOOKS = [
  // Claude Code
  "hooks/session-start.ts",
  "hooks/session-start-setup.ts",
  "hooks/session-notifications.ts",
  "hooks/pre-tool-use.ts",
  "hooks/capture.ts",
  "hooks/session-end.ts",
  "hooks/graph-on-stop.ts",
  // Codex
  "hooks/codex/session-start.ts",
  "hooks/codex/session-start-setup.ts",
  "hooks/codex/capture.ts",
  "hooks/codex/pre-tool-use.ts",
  "hooks/codex/stop.ts",
  // Cursor
  "hooks/cursor/session-start.ts",
  "hooks/cursor/capture.ts",
  "hooks/cursor/pre-tool-use.ts",
  "hooks/cursor/session-end.ts",
  // Hermes
  "hooks/hermes/session-start.ts",
  "hooks/hermes/capture.ts",
  "hooks/hermes/pre-tool-use.ts",
  "hooks/hermes/session-end.ts",
];

describe("activation gate coverage", () => {
  for (const rel of GATED_HOOKS) {
    it(`${rel} calls isHivemindActive`, () => {
      expect(readFileSync(join(SRC, rel), "utf-8")).toMatch(/isHivemindActive\(/);
    });
  }

  it("cursor hooks never resolve .hivemind from a bare process.cwd()", () => {
    for (const f of ["session-end.ts", "pre-tool-use.ts", "session-start.ts"]) {
      const body = readFileSync(join(SRC, "hooks", "cursor", f), "utf-8");
      expect(body, f).not.toMatch(/resolveDirConfig\([^)]*process\.cwd\(\)/);
      expect(body, f).not.toMatch(/loadRoutedConfig\([^)]*process\.cwd\(\)/);
    }
  });

  it("pi extension gates every lifecycle handler and tool", () => {
    const body = readFileSync(join(__dir, "..", "..", "harnesses", "pi", "extension-source", "hivemind.ts"), "utf-8");
    for (const ev of ["session_start", "input", "tool_result", "message_end", "session_shutdown"]) {
      const i = body.indexOf(`pi.on("${ev}"`);
      expect(i, ev).toBeGreaterThan(-1);
      expect(body.slice(i, i + 300), ev).toMatch(/piIsActive\(/);
    }
    expect(body.match(/if \(!piIsActive\(process\.cwd\(\)\)\) return textResult/g)?.length).toBe(3);
  });
});
