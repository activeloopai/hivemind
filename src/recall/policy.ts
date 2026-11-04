/**
 * Local proactive recall — modes and relevance gate.
 *
 * Two triggers, each independently `off | shadow | on`:
 *   - failure — a Bash / MCP tool call failed (PostToolUseFailure)
 *   - prompt  — the user submitted a recall-worthy prompt (UserPromptSubmit)
 * `shadow` runs the full lookup and records what it WOULD have injected to
 * ~/.deeplake/recall-events.jsonl, but injects nothing.
 *
 * Defaults: failure = on (a failed command is a precise trigger and the gate
 * is strict, so a fresh install gets the benefit with no setup), prompt =
 * shadow (prompts are noisier; enable with `hivemind recall mode on --prompt`
 * once its shadow data looks good).
 *
 * Resolution order (first match wins):
 *   1. HIVEMIND_PROACTIVE_RECALL_DISABLED=1 or HIVEMIND_PROACTIVE_RECALL=off → off
 *   2. HIVEMIND_RECALL_FAILURE / HIVEMIND_RECALL_PROMPT (per trigger)
 *   3. HIVEMIND_PROACTIVE_RECALL=shadow|on (both triggers)
 *   4. ~/.deeplake/state/recall/config.json  { failure, prompt }
 *   5. default: failure = on, prompt = shadow
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SearchHit } from "./lexical-index.js";

export type RecallTrigger = "failure" | "prompt";
export type RecallMode = "off" | "shadow" | "on";

const MODES: readonly RecallMode[] = ["off", "shadow", "on"];
const DEFAULT_MODE: Record<RecallTrigger, RecallMode> = { failure: "on", prompt: "shadow" };

export function recallConfigPath(): string {
  return join(homedir(), ".deeplake", "state", "recall", "config.json");
}

function parseMode(raw: unknown): RecallMode | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (MODES.includes(v as RecallMode)) return v as RecallMode;
  if (/^(0|false|no|disabled?)$/.test(v)) return "off";
  if (/^(1|true|yes|enabled?)$/.test(v)) return "on";
  return null;
}

export type RecallModeConfig = Partial<Record<RecallTrigger, RecallMode>>;

export function loadModeConfig(path: string = recallConfigPath()): RecallModeConfig {
  try {
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const out: RecallModeConfig = {};
    for (const t of ["failure", "prompt"] as const) {
      const m = parseMode(raw[t]);
      if (m) out[t] = m;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveModeConfig(cfg: RecallModeConfig, path: string = recallConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...loadModeConfig(path), ...cfg }, null, 2) + "\n");
}

export function recallMode(
  trigger: RecallTrigger,
  env: NodeJS.ProcessEnv = process.env,
  configPath: string = recallConfigPath(),
): RecallMode {
  if (/^(1|true|yes|on)$/i.test((env.HIVEMIND_PROACTIVE_RECALL_DISABLED ?? "").trim())) return "off";
  const global = parseMode(env.HIVEMIND_PROACTIVE_RECALL);
  if (global === "off") return "off";
  const perTrigger = parseMode(trigger === "failure" ? env.HIVEMIND_RECALL_FAILURE : env.HIVEMIND_RECALL_PROMPT);
  if (perTrigger) return perTrigger;
  if (global) return global;
  return loadModeConfig(configPath)[trigger] ?? DEFAULT_MODE[trigger];
}

// ── Relevance gate ──────────────────────────────────────────────────────────

export interface Thresholds {
  /** Distinct query terms the summary must contain. */
  minMatched: number;
  /** idf-weighted share of query terms the summary must contain (0..1). */
  minCoverage: number;
  /** The rarest matched term must appear in at most this share of summaries. */
  maxRarestDf: number;
  /** Adjacent word pairs the summary must share with the query. */
  minPhrases: number;
}

function envNum(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}

/**
 * Starting thresholds, to be tuned against shadow-mode data. Prompts are
 * noisier than error text, so they need a stricter bar.
 */
export function thresholds(trigger: RecallTrigger, env: NodeJS.ProcessEnv = process.env): Thresholds {
  if (trigger === "failure") {
    return {
      minMatched: envNum(env.HIVEMIND_RECALL_FAILURE_MIN_MATCHED, 3, 1, 50),
      minCoverage: envNum(env.HIVEMIND_RECALL_FAILURE_MIN_COVERAGE, 0.45, 0, 1),
      maxRarestDf: envNum(env.HIVEMIND_RECALL_MAX_RAREST_DF, 0.05, 0, 1),
      minPhrases: envNum(env.HIVEMIND_RECALL_FAILURE_MIN_PHRASES, 2, 0, 50),
    };
  }
  return {
    minMatched: envNum(env.HIVEMIND_RECALL_PROMPT_MIN_MATCHED, 4, 1, 50),
    minCoverage: envNum(env.HIVEMIND_RECALL_PROMPT_MIN_COVERAGE, 0.55, 0, 1),
    maxRarestDf: envNum(env.HIVEMIND_RECALL_MAX_RAREST_DF, 0.05, 0, 1),
    minPhrases: envNum(env.HIVEMIND_RECALL_PROMPT_MIN_PHRASES, 2, 0, 50),
  };
}

export type GateVerdict =
  | { pass: true }
  | { pass: false; reason: "matched" | "coverage" | "common" | "phrase" | "anchor" };

export function passesGate(hit: SearchHit, t: Thresholds): GateVerdict {
  // Different port / error code ⇒ different problem, however similar the words.
  if (hit.anchorMiss) return { pass: false, reason: "anchor" };
  if (hit.matched < t.minMatched) return { pass: false, reason: "matched" };
  if (hit.coverage < t.minCoverage) return { pass: false, reason: "coverage" };
  if (hit.rarestDf > t.maxRarestDf) return { pass: false, reason: "common" };
  if (hit.phrases < t.minPhrases) return { pass: false, reason: "phrase" };
  return { pass: true };
}
