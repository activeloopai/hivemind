// Persistent user preferences for the plugin, stored at
// `~/.deeplake/config.json`. Separate from `~/.deeplake/credentials.json`
// (auth) — this file holds opt-in/out flags and other settings that survive
// across sessions, agents, and machines.
//
// Currently the only setting is `embeddings.enabled`, which gates whether
// capture / wiki / grep paths invoke the embed daemon. The previous
// `HIVEMIND_EMBEDDINGS=false` env var is read EXACTLY ONCE — during the
// first run of the new code on a machine that has no `embeddings.enabled`
// key yet — to seed the config, then never consulted again.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UserConfig {
  embeddings?: {
    enabled?: boolean;
  };
  docs?: {
    /** Which host CLI authors the docs (claude | codex | pi | cursor). */
    llmAgent?: string;
  };
}

let _configPath: () => string = () =>
  process.env.HIVEMIND_CONFIG_PATH ?? join(homedir(), ".deeplake", "config.json");

type ConfigState = "unloaded" | "missing" | "valid" | "invalid" | "unreadable";

// In-memory cache so the migration's env-var read and resulting write happen
// at most once per process. The file on disk is the source of truth; the
// cache only avoids re-parsing JSON on every call.
let _cache: UserConfig | null = null;
let _configState: ConfigState = "unloaded";
let _configReadError: Error | null = null;
let _migrationFallback: boolean | null = null;

export function readUserConfig(): UserConfig {
  if (_cache !== null) return _cache;
  const path = _configPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if (isMissingFileError(err)) {
      _configState = "missing";
      _cache = {};
      return _cache;
    }
    // Passive consumers include capture/startup hooks, so reads remain
    // non-throwing. Keep I/O failure distinct from malformed JSON so no
    // migration or explicit setter can mistake it for a missing config.
    _configState = "unreadable";
    _configReadError = err instanceof Error ? err : new Error(String(err));
    _cache = {};
    return _cache;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      _configState = "invalid";
      _cache = {};
    } else {
      _configState = "valid";
      _cache = parsed as UserConfig;
    }
  } catch {
    // Corrupt JSON remains a non-throwing empty view for passive callers, but
    // mutation paths refuse to overwrite the bytes the user may want to fix.
    _configState = "invalid";
    _cache = {};
  }
  return _cache;
}

function isMissingFileError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

export function writeUserConfig(patch: Partial<UserConfig>): UserConfig {
  const current = readUserConfig();
  assertConfigWritable();
  const merged = deepMerge(current, patch);
  const path = _configPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  renameSync(tmp, path);
  _cache = merged;
  return merged;
}

/**
 * Validate the current config for a mutation without writing it. Heavy CLI
 * operations use this before provisioning or deleting shared resources so a
 * malformed or unreadable file cannot fail only after those mutations.
 */
export function assertUserConfigWritable(): void {
  readUserConfig();
  assertConfigWritable();
}

// Reads the embeddings-enabled flag, performing the one-shot env-var
// migration if no value has ever been persisted. Returns the final boolean.
//
// Migration rule (per design):
//   HIVEMIND_EMBEDDINGS=false OR unset → enabled: false
//   HIVEMIND_EMBEDDINGS=true (or any other truthy) → enabled: true
//
// Subsequent calls read straight from config; the env var is never touched
// again. `hivemind embeddings install/enable/disable/uninstall` mutate the
// config via writeUserConfig().
export function getEmbeddingsEnabled(): boolean {
  const cfg = readUserConfig();
  if (cfg.embeddings && typeof cfg.embeddings.enabled === "boolean") {
    return cfg.embeddings.enabled;
  }
  if (_migrationFallback !== null) return _migrationFallback;

  const enabled = migrationValueFromEnv();
  if (_configState === "invalid" || _configState === "unreadable") {
    // Hooks must keep running, but an invalid or unreadable file is not an
    // empty file: do not migrate over it or infer a merge base from it.
    _migrationFallback = enabled;
    return enabled;
  }
  try {
    writeUserConfig({ embeddings: { enabled } });
  } catch {
    // Persist failed (permissions, full disk, etc.). Preserve the passive
    // getter contract and cache only the fallback value, not a guessed config.
    _migrationFallback = enabled;
  }
  return enabled;
}

function assertConfigWritable(): void {
  const path = _configPath();
  if (_configState === "invalid") {
    throw new Error(`Hivemind user config at ${path} is not valid JSON; fix or remove it, then rerun.`);
  }
  if (_configState === "unreadable") {
    const detail = _configReadError?.message ? `: ${_configReadError.message}` : "";
    throw new Error(`Hivemind user config at ${path} could not be read${detail}`);
  }
}

function migrationValueFromEnv(): boolean {
  const raw = process.env.HIVEMIND_EMBEDDINGS;
  if (raw === undefined) return false;
  if (raw === "false") return false;
  // Anything else (including "true", "1", etc.) → enabled.
  return true;
}

export function setEmbeddingsEnabled(enabled: boolean): void {
  writeUserConfig({ embeddings: { enabled } });
}

/**
 * The persisted host agent for doc generation, or undefined when unset (the
 * resolver then falls back to auto-detection). No env-var migration: the env
 * override `HIVEMIND_DOCS_LLM_AGENT` stays a separate, higher-priority knob.
 */
export function getDocsLlmAgent(): string | undefined {
  const v = readUserConfig().docs?.llmAgent;
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function setDocsLlmAgent(agent: string): void {
  writeUserConfig({ docs: { llmAgent: agent } });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: UserConfig, patch: Partial<UserConfig>): UserConfig {
  const out: UserConfig = { ...base };
  for (const key of Object.keys(patch) as Array<keyof UserConfig>) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (isPlainObject(patchVal) && isPlainObject(baseVal)) {
      (out as any)[key] = { ...(baseVal as object), ...(patchVal as object) };
    } else if (patchVal !== undefined) {
      (out as any)[key] = patchVal;
    }
  }
  return out;
}

// ── Test helpers ────────────────────────────────────────────────────────────

export function _setConfigPathForTesting(fn: () => string): void {
  _configPath = fn;
  _cache = null;
  _configState = "unloaded";
  _configReadError = null;
  _migrationFallback = null;
}

export function _resetUserConfigForTesting(): void {
  _configPath = () =>
    process.env.HIVEMIND_CONFIG_PATH ?? join(homedir(), ".deeplake", "config.json");
  _cache = null;
  _configState = "unloaded";
  _configReadError = null;
  _migrationFallback = null;
}
