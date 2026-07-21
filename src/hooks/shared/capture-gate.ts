/**
 * Allowlist gate for HIVEMIND_CAPTURE_ONLY_CLI.
 *
 * When the env var is "true", only capture sessions launched from the
 * interactive terminal CLI, whose CLAUDE_CODE_ENTRYPOINT is EXACTLY "cli".
 * Everything else is skipped:
 *   - "sdk-py" / "sdk-ts"  — Claude Agent SDK (Python / TypeScript)
 *   - "sdk-cli"            — headless `claude -p` print mode
 * Matching must be exact equality, NOT a substring test: `claude -p` reports
 * "sdk-cli", which *contains* "cli", so an `includes("cli")` check would let
 * print-mode sessions slip through and create stray capture rows even with
 * the gate on. Interactive terminal sessions are the only ones that report a
 * bare "cli".
 *
 * Returns true when the gate PASSES (capture should proceed), false when
 * the caller should skip. With the gate disabled (env var unset or != "true")
 * this always returns true.
 *
 * Accepts an optional env map to keep the function pure and trivially
 * unit-testable; defaults to process.env.
 */
export function entrypointPassesOnlyCliGate(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const onlyCli = env.HIVEMIND_CAPTURE_ONLY_CLI === "true";
  if (!onlyCli) return true;
  const entrypoint = env.CLAUDE_CODE_ENTRYPOINT ?? "";
  return entrypoint === "cli";
}
