/**
 * CLI surface for `hivemind recall` — local proactive team recall.
 *
 * Usage: see USAGE below. Everything except `sync` is local-only; `sync`
 * performs the same read-only, incremental pull the SessionStart worker does.
 */

import { existsSync, readFileSync } from "node:fs";
import { loadRoutedConfig } from "../dir-config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { cacheDir, clearCache, indexSizeBytes, loadIndex, loadStore } from "../recall/cache.js";
import { classifyFailure } from "../recall/error-normalize.js";
import { search } from "../recall/lexical-index.js";
import { lookupTeamRecall } from "../recall/lookup.js";
import {
  passesGate, recallConfigPath, recallMode, saveModeConfig, thresholds,
  type RecallMode, type RecallTrigger,
} from "../recall/policy.js";
import { syncRecallCache } from "../recall/sync.js";
import { recallEventsPath } from "../hooks/shared/recall-events.js";
import { projectNameFromCwd } from "../utils/project-name.js";

const USAGE = `
hivemind recall — proactive recall of teammates' prior work (local, no embeddings)

Usage:
  hivemind recall status
      Mode per trigger, cache location, cached summaries, last sync.
  hivemind recall mode [off|shadow|on] [--failure | --prompt]
      Show or set the mode (both triggers unless one is named).
      shadow = look up and log what would be injected, inject nothing.
  hivemind recall sync [--full]
      Pull new/changed teammate summaries into the local cache now.
  hivemind recall search <text...> [--failure | --prompt] [--error]
      Rank cached summaries against <text> and show the gate verdict.
      --error treats <text> as raw tool error output (normalized first).
  hivemind recall stats [--days N]
      Summarize ~/.deeplake/recall-events.jsonl (default: last 7 days).
  hivemind recall clear
      Delete the local cache for the current org/workspace.
`;

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function requireConfig() {
  const config = loadRoutedConfig();
  if (!config) {
    console.error("Not logged in. Run: hivemind login");
    process.exit(1);
  }
  return config;
}

function dirFor(config: NonNullable<ReturnType<typeof loadRoutedConfig>>): string {
  return cacheDir({ orgId: config.orgId, workspaceId: config.workspaceId, table: config.tableName });
}

function status(): void {
  const config = requireConfig();
  const dir = dirFor(config);
  const store = loadStore(dir, config.userName);
  const idx = loadIndex(dir);
  console.log(`failure trigger: ${recallMode("failure")}`);
  console.log(`prompt trigger:  ${recallMode("prompt")}`);
  console.log(`org / workspace: ${config.orgName} / ${config.workspaceId} (table ${config.tableName})`);
  console.log(`cache dir:       ${dir}`);
  console.log(`cached:          ${Object.keys(store.docs).length} teammate summaries` +
    ` (index ${idx ? `${idx.docs.length} docs, ${(indexSizeBytes(dir) / 1e6).toFixed(1)} MB` : "missing"})`);
  console.log(`last sync:       ${store.lastSyncAt || "never"}`);
  console.log(`mode config:     ${recallConfigPath()}`);
}

function mode(args: string[]): void {
  const value = args.find((a) => !a.startsWith("--"));
  const only: RecallTrigger | null = flag(args, "--failure") ? "failure" : flag(args, "--prompt") ? "prompt" : null;
  if (value) {
    if (!["off", "shadow", "on"].includes(value)) {
      console.error("mode must be one of: off, shadow, on");
      process.exit(1);
    }
    const m = value as RecallMode;
    saveModeConfig(only ? { [only]: m } : { failure: m, prompt: m });
  }
  console.log(`failure: ${recallMode("failure")}`);
  console.log(`prompt:  ${recallMode("prompt")}`);
  if (process.env.HIVEMIND_PROACTIVE_RECALL || process.env.HIVEMIND_RECALL_FAILURE || process.env.HIVEMIND_RECALL_PROMPT) {
    console.log("(environment variables override the saved mode)");
  }
}

async function sync(args: string[]): Promise<void> {
  const config = requireConfig();
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  const r = await syncRecallCache({
    query: (sql) => api.query(sql),
    orgId: config.orgId, workspaceId: config.workspaceId, table: config.tableName,
    userName: config.userName, force: true, full: flag(args, "--full"),
  });
  console.log(`${r.status}: fetched ${r.fetched}, removed ${r.removed}, cached ${r.total}, ${r.pages} page(s), ${r.ms} ms`);
  if (r.error) { console.error(`error: ${r.error}`); process.exit(1); }
}

function searchCmd(args: string[]): void {
  const config = requireConfig();
  const trigger: RecallTrigger = flag(args, "--prompt") ? "prompt" : "failure";
  const text = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!text) { console.error("Usage: hivemind recall search <text...> [--failure|--prompt] [--error]"); process.exit(1); }

  let query = text;
  if (flag(args, "--error")) {
    const v = classifyFailure({ tool_name: "Bash", error: text });
    if (!v.worthy) { console.log(`not recall-worthy (${v.reason}) — the failure hook would skip this`); return; }
    console.log(`distilled query: ${v.query.replace(/\n/g, " | ")}`);
    query = v.query;
  }
  const t0 = Date.now();
  const index = loadIndex(dirFor(config));
  const loadMs = Date.now() - t0;
  if (!index) { console.log("no local index yet — run: hivemind recall sync"); return; }
  const t1 = Date.now();
  const hits = search(index, query, {
    limit: 5, project: projectNameFromCwd(process.cwd()), excludeAuthor: config.userName,
    maxTerms: trigger === "failure" ? 32 : 24,
  });
  const searchMs = Date.now() - t1;
  const th = thresholds(trigger);
  console.log(`trigger=${trigger} thresholds: matched>=${th.minMatched} coverage>=${th.minCoverage} rarestDf<=${th.maxRarestDf} phrases>=${th.minPhrases}`);
  console.log(`index ${index.docs.length} docs, load ${loadMs} ms, search ${searchMs} ms`);
  if (!hits.length) { console.log("no candidates"); return; }
  for (const h of hits) {
    const g = passesGate(h, th);
    console.log(
      `\n${g.pass ? "PASS" : `skip(${g.reason})`}  score=${h.score.toFixed(2)} matched=${h.matched} ` +
      `coverage=${h.coverage.toFixed(2)} rarestDf=${h.rarestDf.toFixed(3)} phrases=${h.phrases}\n  ${h.doc.a} · ${h.doc.u.slice(0, 10)} · ${h.doc.pr}  ${h.doc.p}\n` +
      `  ${h.doc.d.slice(0, 160)}\n  terms: ${h.terms.slice(0, 12).join(", ")}`,
    );
  }
  const res = lookupTeamRecall({ trigger, query, config, cwd: process.cwd(), index });
  if (res.kind === "hit") console.log(`\n--- would inject ---\n${res.context}`);
}

function stats(args: string[]): void {
  const days = Number(flagValue(args, "--days") ?? 7);
  const since = Date.now() - (Number.isFinite(days) ? days : 7) * 86_400_000;
  const path = recallEventsPath();
  if (!existsSync(path)) { console.log(`no events yet (${path})`); return; }
  const counts = new Map<string, number>();
  const hits: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { continue; }
    if (Date.parse(String(e.ts)) < since) continue;
    const k = `${e.trigger ?? "?"}:${e.event}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (e.event === "injected" || e.event === "shadow") hits.push(e);
  }
  console.log(`recall events, last ${days} day(s):`);
  for (const [k, n] of [...counts].sort()) console.log(`  ${k.padEnd(24)} ${n}`);
  if (hits.length) {
    console.log(`\nmost recent hits (injected / shadow):`);
    for (const e of hits.slice(-10)) {
      console.log(`  ${String(e.ts).slice(0, 16)} ${e.trigger} ${e.event} ${e.author} ${e.path} cov=${e.coverage}\n    query: ${e.query ?? ""}`);
    }
  }
}

export async function runRecallCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "status": return status();
    case "mode": return mode(rest);
    case "sync": return sync(rest);
    case "search": return searchCmd(rest);
    case "stats": return stats(rest);
    case "clear": {
      const config = requireConfig();
      clearCache(dirFor(config));
      console.log(`cleared ${dirFor(config)}`);
      return;
    }
    default:
      console.log(USAGE);
      if (sub && sub !== "help" && sub !== "--help") process.exit(1);
  }
}
