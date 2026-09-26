/**
 * `hivemind activation` — where Hivemind is allowed to run at all.
 *
 *   hivemind activation [status]            show mode + decision for this dir
 *   hivemind activation opt-in              inactive everywhere except opted-in trees
 *   hivemind activation always              active everywhere (default)
 *   hivemind activation enable  [--shared] [--dir <path>]
 *   hivemind activation disable [--shared] [--dir <path>]
 *
 * `enable` / `disable` write `"enabled": true|false` into `.hivemind.local`
 * (personal, gitignored) in the target dir, or `.hivemind` (committed, team)
 * with `--shared`. Existing fields in that file are preserved. See
 * src/activation.ts for the resolution rules.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ACTIVATION_MODES,
  parseActivationMode,
  resolveActivation,
  setActivationMode,
  type ActivationResult,
} from "../activation.js";
import { parseDirConfig, type DirConfigFile } from "../dir-config.js";

export const ACTIVATION_USAGE = `Usage:
  hivemind activation [status] [--dir <path>]   Show whether Hivemind is active here, and why
  hivemind activation opt-in                    Only run in trees that opted in (enabled: true)
  hivemind activation always                    Run everywhere (default); enabled:false still opts out
  hivemind activation enable  [--shared] [--dir <path>]
                                                Opt this directory tree in ("enabled": true)
  hivemind activation disable [--shared] [--dir <path>]
                                                Turn Hivemind fully off for this tree ("enabled": false)

  enable/disable write .hivemind.local (personal — add it to .gitignore);
  --shared writes .hivemind instead (commit it to apply to the whole team).`;

export interface ActivationIo {
  log: (s: string) => void;
  warn: (s: string) => void;
  cwd: string;
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export function renderActivationStatus(r: ActivationResult, dir: string): string {
  const lines = [
    `Activation mode: ${r.mode}${r.modeSource === "env" ? " (from HIVEMIND_ACTIVATION)" : r.modeSource === "default" ? " (default)" : " (~/.deeplake/config.json)"}`,
    `Directory:       ${dir}`,
    `Hivemind here:   ${r.active ? "ACTIVE" : "INACTIVE"} — ${r.reason}`,
  ];
  if (r.found) lines.push(`Nearest config:  ${r.found.path} ${JSON.stringify(r.found.raw)}`);
  return lines.join("\n");
}

/** Merge `patch` into the dir-config file at `path`, keeping its other fields. */
export function writeDirConfigField(path: string, patch: DirConfigFile, seedFrom?: string): DirConfigFile {
  let current: DirConfigFile = {};
  let source = existsSync(path) ? path : (seedFrom && existsSync(seedFrom) ? seedFrom : null);
  if (source) {
    const parsed = parseDirConfig(readFileSync(source, "utf-8"));
    if (parsed === null && source === path) {
      throw new Error(`${path} exists but is not a JSON object — fix or remove it first`);
    }
    current = parsed ?? {};
  }
  const next = { ...current, ...patch };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}

export function runActivationCommand(args: string[], io: ActivationIo): number {
  const sub = args[0] && !args[0].startsWith("--") ? args[0] : "status";
  const dir = resolve(flagValue(args, "--dir") ?? io.cwd);

  if (sub === "status") {
    io.log(renderActivationStatus(resolveActivation(dir), dir));
    return 0;
  }

  const mode = parseActivationMode(sub);
  if (mode) {
    setActivationMode(mode);
    io.log(`Activation mode set to "${mode}" in ~/.deeplake/config.json.`);
    if (process.env.HIVEMIND_ACTIVATION && parseActivationMode(process.env.HIVEMIND_ACTIVATION) !== mode) {
      io.warn(`Note: HIVEMIND_ACTIVATION=${process.env.HIVEMIND_ACTIVATION} is set in this environment and overrides the file.`);
    }
    if (mode === "opt-in") {
      io.log("Hivemind is now inactive in every directory tree that has not opted in.");
      io.log("Opt a repo in with:  cd <repo> && hivemind activation enable");
    }
    io.log("Takes effect on the next agent session (restart Cursor / start a new chat).");
    io.log("");
    io.log(renderActivationStatus(resolveActivation(dir), dir));
    return 0;
  }

  if (sub === "enable" || sub === "disable") {
    const shared = args.includes("--shared");
    const name = shared ? ".hivemind" : ".hivemind.local";
    const path = join(dir, name);
    // A new .hivemind.local shadows a sibling .hivemind entirely (nearest file
    // wins, no merge), so seed it from the committed file to keep its routing.
    const seed = shared ? undefined : join(dir, ".hivemind");
    let written: DirConfigFile;
    try {
      written = writeDirConfigField(path, { enabled: sub === "enable" }, seed);
    } catch (e) {
      io.warn((e as Error).message);
      return 1;
    }
    io.log(`Wrote ${path}: ${JSON.stringify(written)}`);
    if (!shared) io.log(`Tip: add ".hivemind.local" to this repo's .gitignore — it's a personal setting.`);
    const r = resolveActivation(dir);
    io.log("");
    io.log(renderActivationStatus(r, dir));
    return 0;
  }

  io.warn(`Unknown activation subcommand: ${sub} (expected: status | ${ACTIVATION_MODES.join(" | ")} | enable | disable)`);
  io.log(ACTIVATION_USAGE);
  return 1;
}
