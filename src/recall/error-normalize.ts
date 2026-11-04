/**
 * Failure → recall query (pure).
 *
 * Claude Code's PostToolUseFailure payload carries the raw failure text
 * (`"Exit code N\n<stderr>"` for Bash). Most failures are noise for team
 * recall — a grep with no match, a user rejecting a tool call, an Edit whose
 * `old_string` drifted — so this module both FILTERS (isRecallWorthyFailure)
 * and DISTILLS (normalizeErrorText) the text down to the lines that name the
 * actual problem, with run-specific values (paths, numbers, ids, timestamps)
 * stripped so two teammates hitting the same error produce the same terms.
 *
 * The output is only ever used as a lexical query against the local summary
 * index; it is never written anywhere.
 */

import { markPorts, uniqueTerms } from "./tokenize.js";

export interface FailureInput {
  tool_name?: string;
  error?: unknown;
  is_interrupt?: boolean;
}

/** Tools whose failures describe the environment/code, not agent tool misuse. */
function isRecallTool(tool: string): boolean {
  return tool === "Bash" || tool.startsWith("mcp__");
}

// Failures that are about the agent/user interaction, never a real problem.
const INTERACTION_RE =
  /(user (doesn't|does not) want|user (denied|rejected|declined)|interrupted by user|permission to use .* (has been )?denied|operation was aborted|request (was )?interrupted|command timed out after)/i;

// Lines that name the problem. Anything else (progress output, banners, the
// echoed command) is dropped when at least one of these is present.
const ERRORISH_RE =
  /(error|exception|traceback|fatal|failed|failure|panic|denied|refused|not found|no such|cannot|can't|could not|couldn't|unable|invalid|unknown|missing|undefined|unexpected|unsupported|timeout|timed out|abort|segfault|killed|\bE[A-Z]{3,}\b|exit status|errno)/i;

// Stack frames: JS "    at fn (file:1:2)", Python 'File "x.py", line 3', Go "\tfile.go:12".
const STACK_FRAME_RE = /^(at\s|File\s+"|\s*[\w./-]+\.(go|rs|java|kt|py|js|ts):\d+)/;

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const URL_RE = /\bhttps?:\/\/[^\s'"<>)]+/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_TS_RE = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?\b/g;
const HEX_RE = /\b(0x)?[0-9a-f]{7,}\b/gi;
// Absolute or relative multi-segment paths → keep only the final segment.
const PATH_RE = /(?:~|\.{1,2})?(?:\/[\w.@+-]+){2,}\/?|[A-Za-z]:\\(?:[\w.@+-]+\\)*[\w.@+-]*/g;
const LINE_COL_RE = /:\d+(:\d+)?\b/g;
const NUMBER_RE = /\b\d+(\.\d+)?\b/g;

const MAX_LINES = 6;
const MAX_LINE_CHARS = 300;
/** A query with fewer distinct terms than this is too vague to match on. */
export const MIN_QUERY_TERMS = 3;

function errorString(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["message", "error", "stderr", "output"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    try { return JSON.stringify(e); } catch { return ""; }
  }
  return "";
}

function scrubLine(line: string): string {
  return markPorts(line)
    .replace(URL_RE, (u) => { try { return new URL(u).hostname; } catch { return ""; } })
    .replace(UUID_RE, " ")
    .replace(ISO_TS_RE, " ")
    .replace(PATH_RE, (p) => p.split(/[\\/]/).filter(Boolean).pop() ?? "")
    .replace(LINE_COL_RE, " ")
    .replace(HEX_RE, " ")
    .replace(NUMBER_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE_CHARS);
}

/**
 * Reduce raw failure text to the few lines that name the problem, with
 * run-specific values stripped. Returns "" when nothing usable remains.
 */
export function normalizeErrorText(raw: string): string {
  const lines = (raw || "")
    .replace(ANSI_RE, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // The "Exit code N" header Claude Code prepends carries no signal.
    .filter((l) => !/^exit code \d+$/i.test(l))
    .filter((l) => !STACK_FRAME_RE.test(l));

  const errorish = lines.filter((l) => ERRORISH_RE.test(l));
  // Prefer the error lines; fall back to the tail (where most tools print the
  // reason) when nothing looks like an error.
  const picked = (errorish.length ? errorish.slice(0, MAX_LINES) : lines.slice(-3))
    .map(scrubLine)
    .filter(Boolean);
  return [...new Set(picked)].join("\n");
}

export type FailureVerdict =
  | { worthy: true; query: string; terms: string[] }
  | { worthy: false; reason: string };

/** Decide whether a failed tool call is worth a team-recall lookup. */
export function classifyFailure(input: FailureInput): FailureVerdict {
  if (input.is_interrupt) return { worthy: false, reason: "interrupt" };
  const tool = input.tool_name ?? "";
  if (!isRecallTool(tool)) return { worthy: false, reason: "tool" };
  const raw = errorString(input.error);
  if (!raw.trim()) return { worthy: false, reason: "empty" };
  if (INTERACTION_RE.test(raw)) return { worthy: false, reason: "interaction" };
  const query = normalizeErrorText(raw);
  const terms = uniqueTerms(query);
  if (terms.length < MIN_QUERY_TERMS) return { worthy: false, reason: "vague" };
  return { worthy: true, query, terms };
}

/** Stable per-session dedupe key for a distilled failure query. */
export function failureKey(terms: readonly string[]): string {
  return [...terms].sort().join(" ").slice(0, 400);
}
