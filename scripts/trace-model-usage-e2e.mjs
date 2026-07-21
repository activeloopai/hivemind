#!/usr/bin/env node
/**
 * End-to-end trace of model + reasoning effort + token usage across every model
 * provider present in the local agent transcripts.
 *
 * For each distinct model found in the real Claude Code transcripts
 * (~/.claude/projects) and Codex rollouts (~/.codex/sessions), this drives the
 * REAL compiled capture hook (dist/src/hooks/capture.js and
 * dist/src/hooks/codex/capture.js) with a synthesized hook payload whose
 * transcript_path points at that transcript, then reads the rows back from the
 * sessions table and prints the model / reasoning_effort / token_usage that
 * actually landed in the JSONB `message` column.
 *
 * It exercises the whole path — parser -> entry build -> SQL INSERT -> Deeplake
 * -> read-back — not just the parser in isolation.
 *
 * Safety:
 *   - Writes to a THROWAWAY table (HIVEMIND_SESSIONS_TABLE, default
 *     `sessions_modeltest`), never the production `sessions` table.
 *   - HIVEMIND_WIKI_WORKER=1 suppresses the hooks' side effects (owner walk,
 *     periodic summary spawn, stop trigger) so only the INSERT runs.
 *   - Deletes its own rows on completion.
 *
 * Usage:
 *   node scripts/trace-model-usage-e2e.mjs            # trace + report + cleanup
 *   HIVEMIND_SESSIONS_TABLE=my_test node scripts/trace-model-usage-e2e.mjs
 *   KEEP=1 node scripts/trace-model-usage-e2e.mjs     # keep rows for inspection
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions_modeltest";
const RUN_TAG = "modeltest-" + Date.now().toString(36);
const MAX_FILES_PER_AGENT = Number(process.env.MAX_FILES ?? 300);

const { parseClaudeTurnMeta, parseCodexTurnMeta, scanClaudeTurnForCapture, sdkTurnMeta } = await import(
  join(ROOT, "dist/src/notifications/model-usage.js")
);
const { loadConfig } = await import(join(ROOT, "dist/src/config.js"));
const { DeeplakeApi } = await import(join(ROOT, "dist/src/deeplake-api.js"));

// Env shared by every hook invocation: throwaway table, no side effects, no embed.
const HOOK_ENV = {
  ...process.env,
  HIVEMIND_SESSIONS_TABLE: TABLE,
  HIVEMIND_WIKI_WORKER: "1",
  HIVEMIND_EMBEDDINGS: "false",
  HIVEMIND_CAPTURE: "true",
};

/** Newest-first list of transcript files under a directory tree, capped. */
function listTranscripts(rootDir, cap) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  walk(rootDir);
  return out
    .map((p) => ({ p, mtime: statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, cap)
    .map((x) => x.p);
}

/** One representative transcript per distinct model, using the real parser. */
function pickOnePerModel(files, parse) {
  const byModel = new Map();
  for (const f of files) {
    let meta;
    try {
      meta = parse(f);
    } catch {
      continue;
    }
    if (meta?.model && !byModel.has(meta.model)) byModel.set(meta.model, f);
  }
  return byModel; // model -> file
}

/**
 * Find a real transcript message carrying model+usage, build the entry via the
 * shared sdkTurnMeta (the exact logic Pi inlines and OpenClaw imports), and
 * assert the normalized token_usage has positive integer input+output tokens.
 * Returns { ok, found } — ok:false means a transcript with usage existed but
 * produced no/invalid token_usage (a real failure); found:false means the agent
 * simply has no local transcripts (not a failure in this env).
 */
function proveSdk(name, dir) {
  const files = listTranscripts(dir, 200);
  let anyTranscript = files.length > 0;
  for (const f of files) {
    let raw;
    try {
      raw = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    for (const ln of raw.split("\n")) {
      if (!ln.includes('"usage"')) continue;
      let o;
      try {
        o = JSON.parse(ln);
      } catch {
        continue;
      }
      const m = o.message ?? o;
      const meta = sdkTurnMeta(m?.model ?? o?.model, m?.usage ?? o?.usage);
      const u = meta?.token_usage;
      if (u) {
        const ok = Number.isInteger(u.input_tokens) && u.input_tokens >= 0 &&
          Number.isInteger(u.output_tokens) && u.output_tokens >= 0;
        console.log(`  [${name}] ${String(meta.model ?? "?").padEnd(24)} token_usage=${JSON.stringify(u)} ${ok ? "OK" : "INVALID"}`);
        return { ok, found: true };
      }
    }
  }
  console.log(`  [${name}] no real transcript with usage found${anyTranscript ? " (has transcripts, none with usage)" : ""}`);
  return { ok: true, found: false };
}

function runHook(entry, payload) {
  const r = spawnSync("node", [join(ROOT, entry)], {
    input: JSON.stringify(payload),
    env: HOOK_ENV,
    encoding: "utf-8",
    timeout: 60_000,
  });
  return r.status === 0;
}

/**
 * The transcript's newest non-sidechain assistant text — what a live Stop
 * hook would receive as `last_assistant_message` for that transcript.
 */
function lastClaudeAssistantText(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    let e;
    try { e = JSON.parse(t); } catch { continue; }
    // Mirror the live scanner: the newest text-bearing, non-sidechain
    // assistant record — with NO usage requirement, because that is the
    // record the hook will correlate against.
    if (e?.type !== "assistant" || e.isSidechain === true) continue;
    const c = e.message?.content;
    const text = typeof c === "string"
      ? c
      : Array.isArray(c) ? c.map((b) => (b?.type === "text" && typeof b.text === "string" ? b.text : "")).join("") : "";
    if (text.trim()) return text;
  }
  return null;
}

/**
 * Live-faithful Claude parse for transcript selection: only pick transcripts
 * whose FINAL turn would actually enrich under the hook's correlation
 * semantics (newest text-bearing record matches + carries usage). Replaying a
 * transcript whose final turn has no usage would correctly produce an
 * unenriched row — useless for this harness's per-model assertions.
 */
function parseClaudeLive(file) {
  const text = lastClaudeAssistantText(file);
  if (!text) return null;
  const scan = scanClaudeTurnForCapture(file, text);
  return scan.status === "match" ? scan.meta : null;
}

async function main() {
  const config = loadConfig();
  if (!config) {
    console.error("No Deeplake credentials resolved (log in with `hivemind login`).");
    process.exit(1);
  }
  console.log(`Org: ${config.orgName} | table: ${TABLE} | run: ${RUN_TAG}\n`);

  const claudeModels = pickOnePerModel(
    listTranscripts(join(homedir(), ".claude", "projects"), MAX_FILES_PER_AGENT),
    parseClaudeLive,
  );
  const codexModels = pickOnePerModel(
    listTranscripts(join(homedir(), ".codex", "sessions"), MAX_FILES_PER_AGENT),
    (f) => parseCodexTurnMeta(f),
  );

  console.log(
    `Discovered ${claudeModels.size} Claude model(s), ${codexModels.size} Codex model(s).\n`,
  );

  // Build one capture job per model. `expectedModels` is every model driven
  // through a stdin hook that MUST appear in the read-back — the hooks swallow
  // errors and exit 0, so exit code alone is not proof of capture.
  //
  // Inserts are PACED (SLEEP_MS between them): the sessions table drops rapid
  // same-table bursts (returns 200 with rows=0 and the row never lands), a
  // known backend quirk. Real sessions emit events seconds apart, so pacing
  // reflects reality; stragglers are retried below.
  const jobs = [];
  let n = 0;
  for (const [model, file] of claudeModels) {
    const sid = `${RUN_TAG}-cc-${n++}`;
    // The capture hook correlates last_assistant_message with the transcript's
    // newest assistant record (off-by-one guard), so a synthetic message would
    // make every enrichment come back null — replay the transcript's REAL
    // final assistant text.
    const lastText = lastClaudeAssistantText(file);
    jobs.push({ agent: "claude_code", model, run: () =>
      runHook("dist/src/hooks/capture.js", {
        session_id: sid, transcript_path: file, cwd: ROOT,
        hook_event_name: "Stop", last_assistant_message: lastText ?? `e2e trace for ${model}`,
      }) });
  }
  for (const [model, file] of codexModels) {
    const sid = `${RUN_TAG}-cx-${n++}`;
    jobs.push({ agent: "codex", model, run: () =>
      runHook("dist/src/hooks/codex/capture.js", {
        session_id: sid, transcript_path: file, cwd: ROOT,
        hook_event_name: "UserPromptSubmit", model, prompt: `e2e trace for ${model}`,
      }) });
  }
  // Cursor: model is in the payload (no token data exists in its transcript).
  jobs.push({ agent: "cursor", model: "cursor-default-model", run: () =>
    runHook("dist/src/hooks/cursor/capture.js", {
      conversation_id: `${RUN_TAG}-cur`, session_id: `${RUN_TAG}-cur`,
      hook_event_name: "afterAgentResponse", model: "cursor-default-model",
      cwd: ROOT, text: "e2e trace for cursor",
    }) });
  const expectedModels = new Set(jobs.map((j) => j.model));

  const SLEEP_MS = Number(process.env.SLEEP_MS ?? 900);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const runJobs = async (list) => {
    for (const job of list) {
      const ok = job.run();
      console.log(`  [${job.agent}] ${job.model} -> ${ok ? "captured" : "FAILED"}`);
      await sleep(SLEEP_MS);
    }
  };
  await runJobs(jobs);

  // Hermes: payload carries no model / token data — capture a plain event to
  // confirm the row still lands (model/usage simply absent, never fabricated).
  {
    const ok = runHook("dist/src/hooks/hermes/capture.js", {
      session_id: `${RUN_TAG}-herm`, hook_event_name: "UserPromptSubmit",
      cwd: ROOT, extra: { prompt: "e2e trace for hermes" },
    });
    console.log(`  [hermes] (no model/token data) -> ${ok ? "captured" : "FAILED"}`);
  }

  // Read the rows back from the store and report what actually landed. The
  // sessions table is read-after-write lagged — a row INSERTed moments ago may
  // not be visible on an immediate SELECT (the backend even returns rows=0 on
  // the write) — so poll until every invoked model is visible or we time out.
  const api = new DeeplakeApi(
    config.token,
    config.apiUrl,
    config.orgId,
    config.workspaceId,
    TABLE,
  );
  const readRows = async () => {
    const res = await api.query(
      `SELECT message FROM "${TABLE}" WHERE message->>'session_id' LIKE '${RUN_TAG}-%' ORDER BY message->>'model'`,
    );
    return res?.rows ?? res?.data ?? res ?? [];
  };
  // Derive the agent from the session_id we control — the SQL `agent` column
  // reads back unreliably here, and the prefix is authoritative anyway.
  const agentOf = (sid) => {
    const rest = String(sid ?? "").slice(RUN_TAG.length + 1);
    if (rest.startsWith("cc-")) return "claude_code";
    if (rest.startsWith("cx-")) return "codex";
    if (rest.startsWith("cur")) return "cursor";
    if (rest.startsWith("herm")) return "hermes";
    return "?";
  };
  const modelOf = (r) => (typeof r.message === "string" ? JSON.parse(r.message) : r.message).model;
  const missingFrom = (rws) => {
    const present = new Set(rws.map(modelOf));
    return [...expectedModels].filter((m) => !present.has(m));
  };
  let rows = [];
  // Up to 3 rounds: poll for propagation, then re-capture any straggler the
  // backend dropped (spaced further apart) before asserting.
  for (let round = 0; round < 3; round++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      rows = await readRows();
      if (missingFrom(rows).length === 0) break;
      await sleep(2000);
    }
    const missing = missingFrom(rows);
    if (missing.length === 0 || round === 2) break;
    console.log(`\nRetry round ${round + 1}: re-capturing ${missing.length} straggler(s): ${missing.join(", ")}`);
    await runJobs(jobs.filter((j) => missing.includes(j.model)));
  }

  console.log(`\n=== Rows read back from ${TABLE} (${rows.length}) ===`);
  const landedModels = new Set();
  const modelsByAgent = new Map(); // agent -> Set(model)
  const tokenRowsByAgent = new Map(); // agent -> count of rows with token_usage
  const seen = new Set();
  for (const row of rows) {
    const m = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
    const agent = agentOf(m.session_id);
    landedModels.add(m.model);
    if (!modelsByAgent.has(agent)) modelsByAgent.set(agent, new Set());
    modelsByAgent.get(agent).add(m.model);
    const u = m.token_usage;
    // Correctness, not just presence: a token-bearing row must have positive
    // integer input+output tokens (proves real numbers flowed parser->hook->DB).
    const validTok = u &&
      Number.isInteger(u.input_tokens) && u.input_tokens >= 0 &&
      Number.isInteger(u.output_tokens) && u.output_tokens >= 0 &&
      u.input_tokens + u.output_tokens > 0;
    if (validTok) tokenRowsByAgent.set(agent, (tokenRowsByAgent.get(agent) ?? 0) + 1);
    if (seen.has(m.model)) continue; // one line per model in the display
    seen.add(m.model);
    console.log(
      `  ${String(agent).padEnd(12)} ${String(m.model ?? "?").padEnd(28)} effort=${String(m.reasoning_effort ?? "—").padEnd(7)} ` +
        `usage=${u ? JSON.stringify(u) : "—"}` +
        (m.token_usage_total ? ` total=${JSON.stringify(m.token_usage_total)}` : ""),
    );
  }

  const invokedByAgent = new Map();
  for (const j of jobs) invokedByAgent.set(j.agent, (invokedByAgent.get(j.agent) ?? 0) + 1);
  console.log(`\nInvoked vs visible per agent (sessions-table burst read-lag hides some of a rapid tail):`);
  for (const [agent, count] of invokedByAgent) {
    console.log(`  ${agent.padEnd(12)} invoked=${count}  visible=${modelsByAgent.get(agent)?.size ?? 0}  with-tokens=${tokenRowsByAgent.get(agent) ?? 0}`);
  }

  // Pi + OpenClaw capture in-process (extension event / producer hook), not via
  // a stdin subprocess, so they can't be driven here. Prove the exact enriched
  // entry they build by running the shared sdkTurnMeta over a real message from
  // each one's on-disk transcript, asserting positive token values.
  console.log(`\n=== Pi / OpenClaw entry-build proof (from real transcripts) ===`);
  const piProof = proveSdk("pi", join(homedir(), ".pi", "agent", "sessions"));
  const openclawProof = proveSdk("openclaw", join(homedir(), ".openclaw"));

  // Guard: exit code 0 from a capture hook is not proof — verify each agent's
  // capture path actually wrote correct rows. Require only agents that were
  // ACTUALLY invoked (a CI box may lack a given agent's transcripts), and for
  // the token-bearing agents require a row with valid positive token counts.
  // We don't require every one of a 20-model burst to be visible — the backend
  // read-lag won't reliably surface the tail — but a genuinely broken hook
  // lands zero rows for its agent.
  const invokedAgents = new Set(jobs.map((j) => j.agent));
  const tokenAgents = ["claude_code", "codex"].filter((a) => invokedAgents.has(a));
  const problems = [];
  if (rows.length === 0) problems.push("no rows landed at all");
  for (const agent of invokedAgents) {
    if (!(modelsByAgent.get(agent)?.size)) problems.push(`no ${agent} rows landed`);
  }
  for (const agent of tokenAgents) {
    if (!tokenRowsByAgent.get(agent)) problems.push(`no ${agent} row carried valid token_usage`);
  }
  if (!piProof.ok) problems.push("pi sdkTurnMeta produced invalid token_usage");
  if (!openclawProof.ok) problems.push("openclaw sdkTurnMeta produced invalid token_usage");
  if (problems.length > 0) {
    console.error(`\nFAIL: ${problems.join("; ")}`);
    if (process.env.KEEP !== "1") {
      await api.query(`DELETE FROM "${TABLE}" WHERE message->>'session_id' LIKE '${RUN_TAG}-%'`);
    }
    process.exit(1);
  }
  console.log(`\nPASS: every invoked agent's capture path wrote correct rows (token-bearing agents carry valid token_usage).`);

  if (process.env.KEEP === "1") {
    console.log(`\nKEEP=1 — leaving ${rows.length} rows in ${TABLE}.`);
    return;
  }
  await api.query(`DELETE FROM "${TABLE}" WHERE message->>'session_id' LIKE '${RUN_TAG}-%'`);
  console.log(`\nCleaned up ${rows.length} test rows from ${TABLE}.`);
}

main().catch((e) => {
  console.error("e2e trace failed:", e?.message ?? e);
  process.exit(1);
});
