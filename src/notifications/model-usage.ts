/**
 * Model + token-usage extraction from agent transcripts.
 *
 * The capture hooks record one trace row per session event (user prompt, tool
 * call, assistant turn). Neither Claude Code nor Codex passes model / reasoning
 * effort / token counts in the hook payload, but both write them to the
 * on-disk transcript the hook receives a path to:
 *
 *   Claude Code — `~/.claude/projects/<enc-cwd>/<session>.jsonl`. Each assistant
 *     line is `{ type:"assistant", message:{ model, stop_reason, usage:{...} } }`.
 *     Reasoning effort is not in the message — it's the user's `effortLevel`
 *     setting, read from settings at capture time (see readClaudeEffortLevel).
 *
 *   Codex — `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. A `turn_context`
 *     line carries `payload.model` + `payload.effort`; `event_msg` lines with
 *     `payload.type === "token_count"` carry `payload.info.last_token_usage`
 *     (this turn) and `payload.info.total_token_usage` (cumulative), each with
 *     `{ input_tokens, cached_input_tokens, output_tokens,
 *     reasoning_output_tokens, total_tokens }`.
 *
 * Both parsers normalize onto {@link NormalizedUsage} so a per-model rollup is a
 * single `GROUP BY message->>'model'` over the sessions table. They are
 * best-effort: any read/parse failure returns null and capture proceeds without
 * the enrichment (never throws, never blocks a trace write).
 */

import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("model-usage", msg);

/** Money cost of a turn, in the agent's billing currency (Pi / OpenClaw). */
export interface CostBreakdown {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
  total?: number;
}

/** Token counts normalized across agents. Fields absent from the source are omitted. */
export interface NormalizedUsage {
  input_tokens?: number;
  output_tokens?: number;
  /** Tokens served from the prompt cache (Claude cache_read_input_tokens / Codex cached_input_tokens). */
  cache_read_tokens?: number;
  /** Tokens written to the prompt cache (Claude cache_creation_input_tokens; Codex has none). */
  cache_creation_tokens?: number;
  /** Reasoning tokens billed as output (Codex only). */
  reasoning_output_tokens?: number;
  /** Grand total when the source reports one (Codex / SDK). */
  total_tokens?: number;
  /** Money cost of the turn — Pi / OpenClaw report it directly (fractional). */
  cost?: CostBreakdown;
}

/** Model / effort / token enrichment attached to a captured trace entry. */
export interface TraceModelMeta {
  model?: string;
  reasoning_effort?: string | null;
  /** Why the turn ended: Claude `stop_reason`, Pi/OpenClaw `stopReason`. */
  stop_reason?: string;
  /** Usage for the most recent turn. */
  token_usage?: NormalizedUsage;
  /**
   * Cumulative session usage (Codex `total_token_usage`). This is a
   * whole-session running total spanning every model used, NOT per-model — a
   * session total is `MAX(total_tokens)` per session. For per-model totals,
   * sum the per-turn `token_usage`, deduping by `turn_id` (each Codex turn's
   * tool events share one snapshot).
   */
  token_usage_total?: NormalizedUsage;
  /**
   * Per-harness fields that don't generalize across agents (kept faithful to
   * the source rather than dropped): Claude billing detail (service_tier,
   * speed, cache TTL split, server_tool_use), Codex quota (model_context_window,
   * rate_limits), etc. Omitted when the agent exposes none.
   */
  usage_extra?: Record<string, unknown>;
}

/** Token counts are non-negative integers; reject anything else before it reaches an aggregate. */
function toNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}

/** Costs are non-negative finite numbers (fractional dollars); integers-only would drop them. */
function toFloat(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Copy only the numeric fields that are actually present, so absent keys stay absent. */
function assign(target: NormalizedUsage, key: "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_creation_tokens" | "reasoning_output_tokens" | "total_tokens", v: unknown): void {
  const n = toNum(v);
  if (n !== undefined) target[key] = n;
}

/** Normalize a Pi/OpenClaw cost object `{input, output, cacheRead, cacheWrite, total}`. */
function normalizeCost(cost: unknown): CostBreakdown | undefined {
  if (!cost || typeof cost !== "object") return undefined;
  const c = cost as { input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown; total?: unknown };
  const out: CostBreakdown = {};
  const put = (k: keyof CostBreakdown, v: unknown) => { const n = toFloat(v); if (n !== undefined) out[k] = n; };
  put("input", c.input);
  put("output", c.output);
  put("cache_read", c.cacheRead);
  put("cache_creation", c.cacheWrite);
  put("total", c.total);
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read only the tail of a transcript (default 1 MiB). Model / usage / stop
 * reason all live in the MOST RECENT turn, which sits at the end of the file —
 * so reading the whole thing on every capture event is needlessly O(filesize)
 * (and O(n²) across a session for Codex, which parses on every user/tool row).
 * The tail bounds each read to a constant. When the file is larger than the
 * window the first (partial) line is dropped, so callers only ever see whole
 * lines. Best-effort: returns null on any error.
 */
/** Read one window [size-maxBytes, size) of an open fd, returning whole lines. */
function readWindowLines(fd: number, size: number, maxBytes: number): string[] {
  if (size <= maxBytes) {
    // Whole file fits — read it all; no partial-line handling needed.
    const buf = Buffer.alloc(size);
    const n = size > 0 ? readSync(fd, buf, 0, size, 0) : 0;
    return buf.toString("utf-8", 0, n).split("\n");
  }
  // Read the window PLUS one leading byte, so we can tell whether the window
  // already starts at a line boundary. Buffer.alloc (zeroed) + decoding only the
  // bytes actually read guards against a short read exposing stale memory.
  const start = size - maxBytes - 1;
  const buf = Buffer.alloc(maxBytes + 1);
  const n = readSync(fd, buf, 0, maxBytes + 1, start);
  const text = buf.toString("utf-8", 0, n);
  // The first char is the byte BEFORE the window. If it's "\n", the window starts
  // on a complete line and slicing at index 0 keeps it; otherwise the first line
  // is partial and slicing drops it. Either case: cut at the first "\n".
  const nl = text.indexOf("\n");
  return (nl >= 0 ? text.slice(nl + 1) : "").split("\n");
}

/**
 * A transcript opened ONCE. `lines` is the tail (default 1 MiB window);
 * `readWhole()` re-reads the entire file from the SAME fd using the size
 * captured at open — so a fallback whole-file scan sees the exact same snapshot
 * as the tail, closing any reopen/mutation race between the two reads. The
 * caller must `close()`.
 */
interface TranscriptReader {
  lines: string[];
  readWhole(): string[];
  close(): void;
}

function openTranscript(path: string, window = 1_048_576): TranscriptReader | null {
  if (!path) return null;
  let fd: number;
  try {
    // Open directly and handle the error (incl. ENOENT) rather than an
    // existsSync() pre-check — a check-then-open is a file-system race.
    fd = openSync(path, "r");
  } catch (e: any) {
    log(`open failed (${path}): ${e?.message ?? String(e)}`);
    return null;
  }
  let size: number;
  try {
    size = fstatSync(fd).size;
  } catch (e: any) {
    try { closeSync(fd); } catch { /* best-effort */ }
    log(`stat failed: ${e?.message ?? String(e)}`);
    return null;
  }
  const read = (maxBytes: number): string[] => {
    try {
      return readWindowLines(fd, size, maxBytes);
    } catch (e: any) {
      log(`read failed: ${e?.message ?? String(e)}`);
      return [];
    }
  };
  let wholeCache: string[] | undefined;
  return {
    lines: read(window),
    readWhole: () => (wholeCache ??= read(Number.MAX_SAFE_INTEGER)),
    close: () => { try { closeSync(fd); } catch { /* best-effort */ } },
  };
}

/** Tail lines of a transcript (default 1 MiB). Thin wrapper over {@link openTranscript}. */
export function readTailLines(path: string, maxBytes = 1_048_576): string[] | null {
  const r = openTranscript(path, maxBytes);
  if (!r) return null;
  try {
    return r.lines;
  } finally {
    r.close();
  }
}

// ---------------------------------------------------------------------------
// Pi / OpenClaw (shared SDK usage shape)
// ---------------------------------------------------------------------------

interface SdkUsage {
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  totalTokens?: unknown;
  cost?: unknown;
}

/**
 * Normalize the Pi / OpenClaw SDK usage object
 * (`{ input, output, cacheRead, cacheWrite, totalTokens, cost }`) onto
 * {@link NormalizedUsage}, including the money `cost` sub-object. Returns
 * undefined when nothing usable is present, so callers can spread it without
 * emitting an empty object.
 */
export function normalizeSdkUsage(usage: unknown): NormalizedUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as SdkUsage;
  const out: NormalizedUsage = {};
  assign(out, "input_tokens", u.input);
  assign(out, "output_tokens", u.output);
  assign(out, "cache_read_tokens", u.cacheRead);
  assign(out, "cache_creation_tokens", u.cacheWrite);
  assign(out, "total_tokens", u.totalTokens);
  const cost = normalizeCost(u.cost);
  if (cost) out.cost = cost;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the trace enrichment for an in-process SDK turn (Pi / OpenClaw), where
 * the model, usage and stop reason arrive on the message object rather than a
 * transcript file. Returns undefined when nothing usable is present. These
 * runtimes expose no reasoning-effort field, so it is left unset.
 */
export function sdkTurnMeta(model: unknown, usage: unknown, stopReason?: unknown): TraceModelMeta | undefined {
  const token_usage = normalizeSdkUsage(usage);
  const hasModel = typeof model === "string" && model.length > 0;
  const hasStop = typeof stopReason === "string" && stopReason.length > 0;
  if (!hasModel && !token_usage && !hasStop) return undefined;
  const meta: TraceModelMeta = {};
  if (hasModel) meta.model = model as string;
  if (hasStop) meta.stop_reason = stopReason as string;
  if (token_usage) meta.token_usage = token_usage;
  return meta;
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

interface ClaudeUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  service_tier?: unknown;
  speed?: unknown;
  inference_geo?: unknown;
  cache_creation?: { ephemeral_1h_input_tokens?: unknown; ephemeral_5m_input_tokens?: unknown };
  server_tool_use?: { web_search_requests?: unknown; web_fetch_requests?: unknown };
}

interface ClaudeLine {
  type?: string;
  cwd?: unknown;
  isSidechain?: unknown;
  message?: { model?: unknown; usage?: ClaudeUsage; stop_reason?: unknown; content?: unknown };
}

/**
 * Claude Code's reasoning effort is a user-set control (low/medium/high, with
 * `ultrathink` = high), persisted as `effortLevel` in settings — NOT in the
 * per-message transcript. Read it at capture time, preferring project settings
 * over the user default. Best-effort: returns undefined on any miss so the
 * caller falls back to null. Reflects the level configured when the turn was
 * captured (an in-prompt `ultrathink` override for a single turn isn't
 * recorded anywhere we can recover).
 */
const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh"]);

export function readClaudeEffortLevel(cwd?: string): string | undefined {
  const candidates: string[] = [];
  if (cwd) {
    candidates.push(join(cwd, ".claude", "settings.local.json"));
    candidates.push(join(cwd, ".claude", "settings.json"));
  }
  candidates.push(join(homedir(), ".claude", "settings.json"));
  for (const p of candidates) {
    try {
      // Read directly and let a missing file throw into the catch (no
      // existsSync pre-check — that's a check-then-read race).
      const j = JSON.parse(readFileSync(p, "utf-8")) as { effortLevel?: unknown };
      // Allowlist Claude's supported levels — a settings file is untrusted
      // input, and an arbitrary/oversized string would poison effort analytics.
      if (typeof j.effortLevel === "string") {
        const level = j.effortLevel.toLowerCase();
        if (CLAUDE_EFFORT_LEVELS.has(level)) return level;
      }
    } catch {
      // ignore unreadable / malformed settings and try the next candidate
    }
  }
  return undefined;
}

function normalizeClaudeUsage(u: ClaudeUsage): NormalizedUsage {
  const out: NormalizedUsage = {};
  assign(out, "input_tokens", u.input_tokens);
  assign(out, "output_tokens", u.output_tokens);
  assign(out, "cache_read_tokens", u.cache_read_input_tokens);
  assign(out, "cache_creation_tokens", u.cache_creation_input_tokens);
  return out;
}

/**
 * Claude-only billing detail that doesn't generalize to other agents: the
 * pricing tier / speed, the cache-creation split by TTL (1h vs 5m are priced
 * differently), and billable server-side tool calls. Returns undefined when
 * none are present.
 */
function claudeUsageExtra(u: ClaudeUsage): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  if (typeof u.service_tier === "string") extra.service_tier = u.service_tier;
  if (typeof u.speed === "string") extra.speed = u.speed;
  if (typeof u.inference_geo === "string") extra.inference_geo = u.inference_geo;
  const cc = u.cache_creation;
  if (cc && typeof cc === "object") {
    const ttl: Record<string, number> = {};
    const a = toNum(cc.ephemeral_1h_input_tokens); if (a !== undefined) ttl.ephemeral_1h = a;
    const b = toNum(cc.ephemeral_5m_input_tokens); if (b !== undefined) ttl.ephemeral_5m = b;
    if (Object.keys(ttl).length) extra.cache_creation_ttl = ttl;
  }
  const st = u.server_tool_use;
  if (st && typeof st === "object") {
    const s: Record<string, number> = {};
    const ws = toNum(st.web_search_requests); if (ws !== undefined) s.web_search_requests = ws;
    const wf = toNum(st.web_fetch_requests); if (wf !== undefined) s.web_fetch_requests = wf;
    if (Object.keys(s).length) extra.server_tool_use = s;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/** Reverse-scan already-read lines for the last assistant turn carrying usage. */
function scanClaudeLines(lines: string[] | null): TraceModelMeta | null {
  if (!lines) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    let entry: ClaudeLine;
    try {
      entry = JSON.parse(trimmed) as ClaudeLine;
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue; // e.g. a bare `null` line
    const msg = entry.message;
    if (entry.type !== "assistant" || !msg || !msg.usage) continue;
    const meta: TraceModelMeta = {
      model: typeof msg.model === "string" ? msg.model : undefined,
      // Not in the transcript message — read the configured effortLevel from
      // settings (null when unset), keyed to the turn's project cwd.
      reasoning_effort: readClaudeEffortLevel(typeof entry.cwd === "string" ? entry.cwd : undefined) ?? null,
      token_usage: normalizeClaudeUsage(msg.usage),
    };
    if (typeof msg.stop_reason === "string") meta.stop_reason = msg.stop_reason;
    const extra = claudeUsageExtra(msg.usage);
    if (extra) meta.usage_extra = extra;
    return meta;
  }
  return null;
}

/**
 * Extract model + last-turn usage from a Claude Code transcript. Scans from the
 * end so the returned usage belongs to the most recently completed assistant
 * turn — exactly the turn whose Stop event is being captured. Reads the file
 * tail for speed; falls back to the whole file if the usage-bearing line didn't
 * fit the tail window (a single assistant record over the window size). Returns
 * null when the file is unreadable or has no assistant line with usage.
 */
export function parseClaudeTurnMeta(transcriptPath?: string): TraceModelMeta | null {
  if (!transcriptPath) return null;
  const r = openTranscript(transcriptPath);
  if (!r) return null;
  try {
    // Fast path: the last turn is in the tail. Only re-read the whole file (same
    // fd/snapshot) if the usage-bearing line didn't fit the window.
    return scanClaudeLines(r.lines) ?? scanClaudeLines(r.readWhole());
  } finally {
    r.close();
  }
}

/** Flatten a Claude message `content` (string or block array) to its text. */
function flattenClaudeText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : ""))
    .join("");
}

/**
 * Whether the transcript's assistant text plausibly IS the hook's
 * `last_assistant_message`. Exact match after trimming, or an ANCHORED
 * prefix with enough shared length that a coincidental hit is implausible —
 * an unanchored substring test would let a short reply ("Done") match the
 * PREVIOUS turn ("Done — details…") and resurrect the off-by-one this
 * correlation exists to prevent.
 */
const MIN_TRUNCATION_MATCH_LEN = 32;

function textMatches(entryText: string, expect: string): boolean {
  const a = entryText.trim();
  const b = expect.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= MIN_TRUNCATION_MATCH_LEN && longer.startsWith(shorter);
}

/**
 * One point-in-time scan of a Claude transcript for the CURRENT turn's
 * assistant metadata.
 *
 * `"match"` — the newest relevant assistant record is complete (has usage) and,
 * when `expectText` is given, its text corresponds to the captured
 * `last_assistant_message`. `meta` is set.
 *
 * `"retry"` — the transcript hasn't caught up with the turn being captured:
 * the file is missing/unreadable, ends in a partial JSONL record, has no
 * relevant assistant record yet, or its newest relevant assistant record lacks
 * usage or doesn't correspond to `expectText`. The caller should re-read after
 * a short backoff. Crucially this NEVER falls back to an older usage-bearing
 * record — that would silently attribute the previous turn's tokens to this
 * one (the off-by-one this scan exists to prevent).
 *
 * `includeSidechain` — on SubagentStop the agent transcript IS the sidechain,
 * so its records must not be filtered; on a main-session Stop, sidechain
 * records belong to subagents and must be skipped.
 */
export interface ClaudeTurnScan {
  status: "match" | "retry";
  meta?: TraceModelMeta;
}

export function scanClaudeTurnForCapture(
  transcriptPath: string | undefined,
  expectText?: string,
  includeSidechain = false,
): ClaudeTurnScan {
  if (!transcriptPath) return { status: "retry" };
  const r = openTranscript(transcriptPath);
  if (!r) return { status: "retry" };
  try {
    // The tail window can slice the newest records away only when a single
    // record exceeds 1 MiB — scan the whole snapshot when the tail finds
    // nothing relevant.
    return scanClaudeTurn(r.lines, expectText, includeSidechain) ??
      scanClaudeTurn(r.readWhole(), expectText, includeSidechain) ??
      { status: "retry" };
  } finally {
    r.close();
  }
}

/** Reverse-scan for the newest relevant assistant record. Null = nothing relevant in these lines. */
function scanClaudeTurn(
  lines: string[] | null,
  expectText: string | undefined,
  includeSidechain: boolean,
): ClaudeTurnScan | null {
  if (!lines) return null;
  let sawNonBlank = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    let entry: ClaudeLine;
    try {
      entry = JSON.parse(trimmed) as ClaudeLine;
    } catch {
      // A malformed FINAL record is an in-progress append — wait for it to
      // complete. Malformed records further up are just skipped.
      if (!sawNonBlank) {
        log("trailing partial record — retry");
        return { status: "retry" };
      }
      sawNonBlank = true;
      continue;
    }
    sawNonBlank = true;
    if (!entry || typeof entry !== "object") continue;
    const msg = entry.message;
    if (entry.type !== "assistant" || !msg) continue;
    if (!includeSidechain && entry.isSidechain === true) continue;
    if (expectText !== undefined) {
      // Only a TEXT-bearing record can be the one behind
      // last_assistant_message — a turn's trailing tool_use/thinking records
      // have no text and must not decide the correlation.
      const text = flattenClaudeText(msg.content);
      if (!text.trim()) continue;
      if (!textMatches(text, expectText)) {
        log("newest assistant record does not match last_assistant_message — retry");
        return { status: "retry" };
      }
    }
    // Newest relevant assistant record found — it alone decides the outcome.
    if (!msg.usage) {
      log("newest assistant record has no usage — retry");
      return { status: "retry" };
    }
    const meta: TraceModelMeta = {
      model: typeof msg.model === "string" ? msg.model : undefined,
      reasoning_effort: readClaudeEffortLevel(typeof entry.cwd === "string" ? entry.cwd : undefined) ?? null,
      token_usage: normalizeClaudeUsage(msg.usage),
    };
    if (typeof msg.stop_reason === "string") meta.stop_reason = msg.stop_reason;
    const extra = claudeUsageExtra(msg.usage);
    if (extra) meta.usage_extra = extra;
    return { status: "match", meta };
  }
  return null;
}

/**
 * Live-capture variant of {@link parseClaudeTurnMeta}: the Stop hook often
 * fires before Claude has flushed the turn's final assistant record to the
 * transcript, so a single read races the writer (observed in real sessions:
 * turn 1 captured with null model/usage while the record landed ~ms later).
 * Re-opens and re-scans the file across a short bounded backoff and returns
 * null — capture proceeds unenriched — if the record never materializes.
 */
export async function parseClaudeTurnMetaLive(
  transcriptPath: string | undefined,
  expectText?: string,
  includeSidechain = false,
  backoffMs: readonly number[] = [25, 50, 100],
): Promise<TraceModelMeta | null> {
  let scan = scanClaudeTurnForCapture(transcriptPath, expectText, includeSidechain);
  for (const delay of backoffMs) {
    if (scan.status === "match") break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    scan = scanClaudeTurnForCapture(transcriptPath, expectText, includeSidechain);
  }
  if (scan.status !== "match") {
    log(`turn meta unavailable after ${backoffMs.length + 1} reads — writing unenriched`);
    return null;
  }
  return scan.meta ?? null;
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

interface CodexUsage {
  input_tokens?: unknown;
  cached_input_tokens?: unknown;
  output_tokens?: unknown;
  reasoning_output_tokens?: unknown;
  total_tokens?: unknown;
}

interface CodexRateWindow {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_at?: unknown;
}

interface CodexLine {
  type?: string;
  payload?: {
    type?: string;
    model?: unknown;
    effort?: unknown;
    info?: {
      last_token_usage?: CodexUsage;
      total_token_usage?: CodexUsage;
      model_context_window?: unknown;
    };
    rate_limits?: { primary?: CodexRateWindow; secondary?: CodexRateWindow };
  };
}

/** Compact Codex quota detail from a token_count event: context window + rate-limit windows. */
function codexUsageExtra(
  info: { model_context_window?: unknown } | undefined,
  rateLimits: { primary?: CodexRateWindow; secondary?: CodexRateWindow } | undefined,
): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  const win = toNum(info?.model_context_window);
  if (win !== undefined) extra.model_context_window = win;
  const pickWin = (w?: CodexRateWindow) => {
    if (!w || typeof w !== "object") return undefined;
    const o: Record<string, number> = {};
    const up = toFloat(w.used_percent); if (up !== undefined) o.used_percent = up;
    const wm = toNum(w.window_minutes); if (wm !== undefined) o.window_minutes = wm;
    const ra = toNum(w.resets_at); if (ra !== undefined) o.resets_at = ra;
    return Object.keys(o).length ? o : undefined;
  };
  const primary = pickWin(rateLimits?.primary);
  const secondary = pickWin(rateLimits?.secondary);
  if (primary || secondary) {
    const rl: Record<string, unknown> = {};
    if (primary) rl.primary = primary;
    if (secondary) rl.secondary = secondary;
    extra.rate_limits = rl;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function normalizeCodexUsage(u: CodexUsage): NormalizedUsage {
  const out: NormalizedUsage = {};
  assign(out, "input_tokens", u.input_tokens);
  assign(out, "output_tokens", u.output_tokens);
  assign(out, "cache_read_tokens", u.cached_input_tokens);
  assign(out, "reasoning_output_tokens", u.reasoning_output_tokens);
  assign(out, "total_tokens", u.total_tokens);
  return out;
}

/**
 * Forward-scan already-read Codex rollout lines. `sawTurnContext` / `sawTokenCount`
 * report which event types were present — the two carry different halves of the
 * turn's metadata (model+effort vs usage+total+quota), so the caller only trusts
 * the tail when BOTH were seen; otherwise it widens the read.
 */
function scanCodexLines(
  lines: string[] | null,
  fallbackModel?: string,
): { meta: TraceModelMeta | null; sawTurnContext: boolean; sawTokenCount: boolean } {
  let model: string | undefined = fallbackModel;
  let reasoningEffort: string | undefined;
  let last: NormalizedUsage | undefined;
  let total: NormalizedUsage | undefined;
  let extra: Record<string, unknown> | undefined;
  let sawTurnContext = false;
  let sawTokenCount = false;

  if (lines) {
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let entry: CodexLine;
      try {
        entry = JSON.parse(trimmed) as CodexLine;
      } catch {
        continue;
      }
      if (!entry || typeof entry !== "object") continue; // e.g. a bare `null` line
      const p = entry.payload;
      if (!p) continue;
      if (entry.type === "turn_context") {
        // A new turn context starts a new turn (possibly a new model/effort).
        // Reset both to this turn's values — falling back to the hook model
        // when the context omits one — so a later turn never inherits an
        // earlier turn's model or effort. The previous turn's per-turn usage is
        // cleared for the same reason; `total` is a session-wide cumulative and
        // is intentionally preserved across turns.
        sawTurnContext = true;
        model = typeof p.model === "string" ? p.model : fallbackModel;
        reasoningEffort = typeof p.effort === "string" ? p.effort : undefined;
        last = undefined;
        extra = undefined; // quota (context window / rate limits) is per-turn too
      } else if (p.type === "token_count" && p.info) {
        sawTokenCount = true;
        if (p.info.last_token_usage) last = normalizeCodexUsage(p.info.last_token_usage);
        if (p.info.total_token_usage) total = normalizeCodexUsage(p.info.total_token_usage);
        extra = codexUsageExtra(p.info, p.rate_limits); // latest token_count wins (may clear)
      }
    }
  }

  const empty = model === undefined && reasoningEffort === undefined && !last && !total && !extra;
  if (empty) return { meta: null, sawTurnContext, sawTokenCount };
  const meta: TraceModelMeta = {};
  if (model !== undefined) meta.model = model;
  if (reasoningEffort !== undefined) meta.reasoning_effort = reasoningEffort;
  if (last) meta.token_usage = last;
  if (total) meta.token_usage_total = total;
  if (extra) meta.usage_extra = extra;
  return { meta, sawTurnContext, sawTokenCount };
}

/**
 * Extract model + reasoning effort + latest token usage from a Codex rollout.
 * Keeps the last `turn_context` (model/effort) and last `token_count` (per-turn
 * + cumulative usage + quota). Reads the file tail for speed; the two event
 * types carry different halves of the metadata, so if the tail is missing
 * EITHER (a turn with >window bytes between them), it re-scans the whole file —
 * whose result is authoritative. `fallbackModel` is the hook payload's `model`.
 */
export function parseCodexTurnMeta(
  transcriptPath?: string | null,
  fallbackModel?: string,
): TraceModelMeta | null {
  if (!transcriptPath) return scanCodexLines(null, fallbackModel).meta;
  const r = openTranscript(transcriptPath);
  if (!r) return scanCodexLines(null, fallbackModel).meta;
  try {
    const tail = scanCodexLines(r.lines, fallbackModel);
    // Trust the tail only if it holds the COMPLETE latest state: model/effort
    // (turn_context), per-turn usage + quota (token_count), AND the cumulative
    // total — which the whole-file scan carries across turns and an in-tail
    // token_count might not include if an earlier one set it.
    if (tail.sawTurnContext && tail.sawTokenCount && tail.meta?.token_usage_total !== undefined) {
      return tail.meta;
    }
    // Widen to the whole file — SAME fd + size captured at open, so tail and
    // whole are one snapshot (no reopen/mutation race). Trust the whole scan
    // only if it saw Codex events; otherwise keep what the tail extracted.
    const whole = scanCodexLines(r.readWhole(), fallbackModel);
    if (!whole.sawTurnContext && !whole.sawTokenCount) return tail.meta;
    return whole.meta ?? tail.meta;
  } finally {
    r.close();
  }
}
