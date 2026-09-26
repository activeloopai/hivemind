/**
 * Activation gate — decides whether Hivemind does ANYTHING for a session
 * rooted at `cwd`: context injection, memory recall, notifications,
 * autoupdate, skill auto-pull, graph workers, and capture.
 *
 * This is deliberately a separate, stronger switch than `.hivemind`'s
 * `collect` field, which only turns off capture (writes) while reads, rules
 * and the session-start context keep working.
 *
 * Two inputs:
 *
 *   1. The global mode, from `~/.deeplake/config.json` →
 *      `{ "activation": { "mode": "opt-in" | "always" } }`
 *      (overridable per-process with `HIVEMIND_ACTIVATION=opt-in|always`).
 *      Default `always` — today's behavior, so nothing changes for existing
 *      installs.
 *
 *   2. The nearest `.hivemind.local` / `.hivemind` (same nearest-wins walk as
 *      routing, see src/dir-config.ts) and its `enabled` field:
 *        { "enabled": true }   → opt this tree IN
 *        { "enabled": false }  → turn Hivemind fully off for this tree
 *
 * Resolution:
 *   - nearest file says `enabled: false`           → inactive (any mode)
 *   - mode `opt-in` and nearest file `enabled: true` → active
 *   - mode `opt-in` otherwise                       → inactive
 *   - mode `always`                                 → active
 *
 * Fail direction: a corrupt `config.json` reads as the default mode; an
 * unrecognized mode string also reads as the default. An unparseable
 * `.hivemind` is skipped by the walk (same as routing).
 */

import { findDirConfig, type FoundDirConfig } from "./dir-config.js";
import { readUserConfig, writeUserConfig } from "./user-config.js";

export type ActivationMode = "always" | "opt-in";

export const ACTIVATION_MODES: readonly ActivationMode[] = ["always", "opt-in"] as const;

export interface ActivationResult {
  active: boolean;
  mode: ActivationMode;
  /** Where the mode came from, for `hivemind activation` / debug logs. */
  modeSource: "env" | "config" | "default";
  /** The `.hivemind` file that decided (if any). */
  found: FoundDirConfig | null;
  /** Human-readable one-liner explaining the decision. */
  reason: string;
}

export function parseActivationMode(v: unknown): ActivationMode | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "opt-in" || s === "optin" || s === "opt_in") return "opt-in";
  if (s === "always" || s === "on" || s === "default") return "always";
  return null;
}

export function getActivationMode(): { mode: ActivationMode; source: ActivationResult["modeSource"] } {
  const fromEnv = parseActivationMode(process.env.HIVEMIND_ACTIVATION);
  if (fromEnv) return { mode: fromEnv, source: "env" };
  let fromCfg: ActivationMode | null = null;
  try {
    fromCfg = parseActivationMode(readUserConfig().activation?.mode);
  } catch {
    /* unreadable config → default */
  }
  if (fromCfg) return { mode: fromCfg, source: "config" };
  return { mode: "always", source: "default" };
}

export function setActivationMode(mode: ActivationMode): void {
  writeUserConfig({ activation: { mode } });
}

export function resolveActivation(cwd: string): ActivationResult {
  const { mode, source } = getActivationMode();
  const found = cwd ? findDirConfig(cwd) : null;
  const enabled = found?.raw.enabled;

  if (enabled === false) {
    return { active: false, mode, modeSource: source, found, reason: `disabled by ${found!.path}` };
  }
  if (mode === "opt-in") {
    if (enabled === true) {
      return { active: true, mode, modeSource: source, found, reason: `opted in by ${found!.path}` };
    }
    return {
      active: false,
      mode,
      modeSource: source,
      found,
      reason: found
        ? `opt-in mode; nearest ${found.path} has no "enabled": true`
        : "opt-in mode; no .hivemind / .hivemind.local with \"enabled\": true found",
    };
  }
  return { active: true, mode, modeSource: source, found, reason: "activation mode is always" };
}

/**
 * Hook-side convenience: resolve + log. Returns true when the hook should run.
 * Never throws — any unexpected failure fails OPEN in `always` mode and
 * CLOSED in `opt-in` mode (a user who asked for opt-in expects silence).
 */
export function isHivemindActive(cwd: string, log?: (msg: string) => void): boolean {
  try {
    const r = resolveActivation(cwd);
    if (!r.active) log?.(`hivemind inactive for cwd=${cwd || "?"}: ${r.reason}`);
    return r.active;
  } catch (e) {
    let mode: ActivationMode = "always";
    try { mode = getActivationMode().mode; } catch { /* default */ }
    log?.(`activation check failed (${(e as Error).message}); mode=${mode}`);
    return mode !== "opt-in";
  }
}
