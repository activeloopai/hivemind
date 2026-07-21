/**
 * Shared per-directory capture gate for all agent capture hooks
 * (claude-code / codex / cursor / hermes).
 *
 * Loads the global config and overlays the nearest `.hivemind` for `cwd`
 * (see src/dir-config.ts). Returns the Config to capture with, or `null` when
 * capture should be skipped — either because there's no auth, or the directory
 * opted out via `collect: false`. The skip reason is logged.
 */

import { loadConfig, type Config } from "../../config.js";
import { resolveDirConfig } from "../../dir-config.js";

export function resolveCaptureConfig(cwd: string, log: (msg: string) => void): Config | null {
  const base = loadConfig();
  if (!base) {
    log("no config");
    return null;
  }
  const effCwd = cwd || process.cwd();
  const resolved = resolveDirConfig(base, effCwd);
  if (!resolved.collect) {
    log(`capture disabled for cwd=${effCwd} via ${resolved.found?.path}`);
    return null;
  }
  return resolved.config;
}
