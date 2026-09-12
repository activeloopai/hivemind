/**
 * Meta-skill — the optimizer's cross-run memory (the paper's meta-skill). Records
 * every edit proposed for a skill so later runs (a) don't re-propose an edit that
 * was already tried, and (b) feed "what's been tried" (with outcome) to the proposer.
 *
 * Status lifecycle: proposed → applied (next judged invocation passed) | reverted
 * (next judged invocation failed again). The transition is written as an append-only
 * PATCH entry (same fingerprint + skill, with a `resolvedAt` timestamp), so the
 * underlying JSONL stays append-only. Readers fold entries by fingerprint —
 * last-write wins — to get the resolved view.
 *
 * This closes the loop described in the header: `priorEditSummaries` now annotates
 * each prior edit with its outcome ([applied]/[reverted]/[proposed]) so the proposer
 * can prefer edit shapes that worked.
 *
 * Append-only JSONL at <stateDir>/skillopt/meta.jsonl. Pure helpers + injected path,
 * so it's unit-tested with a tmp file.
 */
import fs from "node:fs";
import path from "node:path";
import type { Edit } from "./skill-edits.js";

export type MetaStatus = "proposed" | "applied" | "reverted";

export interface MetaEntry {
  skill: string;       // "<name>--<author>"
  ops: string[];       // short per-edit summaries (op + anchor/preview)
  fingerprint: string; // stable hash of the edits, for dedup
  proposedAt: string;
  status: MetaStatus;
  /** Present only on patch entries written by `patchMeta`; absent on originals. */
  resolvedAt?: string;
}

export const skillRef = (name: string, author: string) => `${name}--${author}`;

/** Short human summary of one edit. */
function summarizeEdit(e: Edit): string {
  const anchor = e.target ? ` @"${e.target.slice(0, 40)}"` : "";
  const preview = e.content ? `: ${e.content.slice(0, 60).replace(/\s+/g, " ")}` : "";
  return `${e.op}${anchor}${preview}`;
}

/** Order-independent fingerprint of an edit set (so the same edits dedup). */
export function fingerprintEdits(edits: Edit[]): string {
  return edits
    .map((e) => `${e.op}|${e.target ?? ""}|${e.content ?? ""}`)
    .sort()
    .join("\n");
}

export function loadMeta(file: string): MetaEntry[] {
  let raw: string;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return []; }
  const out: MetaEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as MetaEntry;
      if (e && typeof e.skill === "string" && typeof e.fingerprint === "string") out.push(e);
    } catch { /* skip malformed line */ }
  }
  return out;
}

export function appendMeta(file: string, entry: MetaEntry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

/**
 * Append a patch entry that updates the status of an existing meta entry without
 * mutating the original line (the JSONL is append-only). Readers fold by fingerprint
 * (last-write wins), so this patch supersedes the original proposed entry.
 *
 * No-op (safe to call) when `fingerprint` is empty/null — callers should guard with
 * `latestUnresolvedFingerprint` before calling.
 */
export function patchMeta(
  file: string,
  skill: string,
  fingerprint: string,
  status: "applied" | "reverted",
  resolvedAt: string,
): void {
  if (!fingerprint) return;
  // Patch entries carry resolvedAt and the updated status, but keep ops empty to
  // avoid re-emitting the full summary (the original entry already has it).
  const patch: MetaEntry = { skill, ops: [], fingerprint, proposedAt: "", status, resolvedAt };
  appendMeta(file, patch);
}

/** Has this exact edit set already been proposed for this skill? (avoid churn) */
export function alreadyProposed(meta: MetaEntry[], name: string, author: string, edits: Edit[]): boolean {
  const ref = skillRef(name, author);
  const fp = fingerprintEdits(edits);
  return meta.some((m) => m.skill === ref && m.fingerprint === fp);
}

/**
 * Build the resolved view of the meta log for a skill: fold by fingerprint (last-write
 * wins), so patch entries override the originals. Returns a map from fingerprint →
 * resolved entry, preserving only entries for the given skill.
 */
function resolvedView(meta: MetaEntry[], ref: string): Map<string, MetaEntry> {
  const map = new Map<string, MetaEntry>();
  for (const m of meta) {
    if (m.skill !== ref) continue;
    const prior = map.get(m.fingerprint);
    if (!prior) {
      map.set(m.fingerprint, m);
    } else {
      // Merge: prefer the patch's status/resolvedAt, but keep the original's ops/proposedAt
      // so summaries don't disappear when a patch entry (with ops:[]) supersedes the original.
      map.set(m.fingerprint, {
        ...prior,
        status: m.status,
        ...(m.resolvedAt ? { resolvedAt: m.resolvedAt } : {}),
      });
    }
  }
  return map;
}

/**
 * Summaries of edits previously tried for this skill — context for the proposer.
 * Each summary is annotated with its resolved outcome so the proposer can prefer
 * edit shapes that were applied and avoid re-trying reverted ones.
 *
 * Format: "[applied] append: Always assert..." / "[reverted] replace @\"...\"" / "[proposed] ..."
 */
export function priorEditSummaries(meta: MetaEntry[], name: string, author: string): string[] {
  const ref = skillRef(name, author);
  const resolved = resolvedView(meta, ref);
  const out: string[] = [];
  for (const entry of resolved.values()) {
    const label = `[${entry.status}]`;
    for (const op of entry.ops) {
      out.push(`${label} ${op}`);
    }
  }
  return out;
}

/**
 * The fingerprint of the latest meta entry for this skill that has NOT yet been
 * resolved (still `"proposed"`). Used by the worker to know which entry to patch
 * when a verdict comes in. Returns null if there's no unresolved entry.
 */
export function latestUnresolvedFingerprint(meta: MetaEntry[], name: string, author: string): string | null {
  const ref = skillRef(name, author);
  const resolved = resolvedView(meta, ref);
  // Walk meta in reverse to find the most recently proposed entry that is still unresolved.
  for (let i = meta.length - 1; i >= 0; i--) {
    const m = meta[i];
    if (m.skill !== ref) continue;
    const r = resolved.get(m.fingerprint);
    if (r && r.status === "proposed") return m.fingerprint;
  }
  return null;
}

/** Build a meta entry for a freshly-proposed edit set. */
export function metaEntryFor(name: string, author: string, edits: Edit[], now: string): MetaEntry {
  return {
    skill: skillRef(name, author),
    ops: edits.map(summarizeEdit),
    fingerprint: fingerprintEdits(edits),
    proposedAt: now,
    status: "proposed",
  };
}
