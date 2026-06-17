#!/usr/bin/env node

/**
 * SessionStart hook:
 * 1. If no credentials → run device flow login (opens browser)
 * 2. Inject Deeplake memory instructions into Claude's context
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { loadCredentials, saveCredentials, healDriftedOrgToken } from "../commands/auth.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlIdent, sqlStr } from "../utils/sql.js";
import { projectNameFromCwd } from "../utils/project-name.js";
import { readStdin } from "../utils/stdin.js";
import { log as _log } from "../utils/debug.js";
import { getInstalledVersion } from "../utils/version-check.js";
import { makeWikiLogger } from "../utils/wiki-log.js";
import { autoUpdate } from "./shared/autoupdate.js";
import { autoPullSkills } from "../skillify/auto-pull.js";
import { renderSkillifyCommands } from "../cli/skillify-spec.js";
import { renderContextBlock } from "./shared/context-renderer.js";
import { countLocalManifestEntries } from "../skillify/local-manifest.js";
import { renderLocalMinedNote } from "../skillify/local-mined-banner.js";
import { maybeAutoMineLocal } from "../skillify/spawn-mine-local-worker.js";
import { graphContextLine } from "../graph/session-context.js";
import { spawnGraphPullWorker } from "../graph/spawn-pull-worker.js";
import { entrypointPassesOnlyCliGate } from "./shared/capture-gate.js";
import { clearSessionEnded, recordSessionOwner, touchSessionActivity } from "./summary-state.js";
const log = (msg: string) => _log("session-start", msg);

const __bundleDir = dirname(fileURLToPath(import.meta.url));
// Hivemind requires its npm bin (`hivemind` from @deeplake/hivemind, declared in
// package.json `bin`) to be on PATH. Inject text uses the bare `hivemind <sub>` form
// — no per-agent path resolution needed. Marketplace-only installs without
// `npm i -g @deeplake/hivemind` are unsupported (documented in README + RELEASE_CHECKLIST).

const context = `DEEPLAKE MEMORY: You have TWO memory sources. ALWAYS check BOTH when the user asks you to recall, remember, or look up ANY information:

1. Your built-in memory (~/.claude/) — personal per-project notes
2. Deeplake global memory (~/.deeplake/memory/) — global memory shared across all sessions, users, and agents in the org

Deeplake memory has THREE tiers — pick the right one for the question:
1. ~/.deeplake/memory/index.md   — auto-generated index, top 50 most-recently-updated entries with \`Created\` + \`Last Updated\` + \`Project\` + \`Description\` columns. ~5 KB. **For "what's recent / who did X this week / since <date>" queries, START HERE** and trust the \`Last Updated\` column over any \`Started:\` line in summary bodies.
2. ~/.deeplake/memory/summaries/ — condensed wiki summaries per session (~3 KB each). For keyword/topic recall, search these.
3. ~/.deeplake/memory/sessions/  — raw full-dialogue JSONL (~5 KB each). FALLBACK only — use when summaries don't contain the exact quote/turn you need.

Search workflow:
  - Time-based ("last week", "today", "since X"): \`cat ~/.deeplake/memory/index.md\` and read the most-recent rows.
  - Keyword/topic recall: use the **Bash tool** with \`grep -r "keyword" ~/.deeplake/memory/summaries/\`. The Bash hook routes this through hybrid lexical+semantic search — synonyms / paraphrases match too. Then \`cat\` the top-matching summary to pull the answer.
  - Raw transcript fallback only: \`grep -r "keyword" ~/.deeplake/memory/sessions/\` (use sparingly — JSONL is verbose).

Tool choice on this mount:
  ✅ Bash tool with \`grep -r\` / \`cat\` / \`ls\` / \`head\` / \`tail\` — supported, fast.
  ❌ Built-in Grep tool — not supported on this path; use Bash grep instead.
  ❌ \`grep\` without a \`summaries/\` or \`sessions/\` suffix — too noisy, drowns the answer.

Resuming work (user says "pick up where I left off" / "load that from hivemind" / "continue where we stopped"):
  The resume target is the most recent session summary for the CURRENT project. Find and load it from the VFS — do not wait for or expect it to be pre-loaded:
  1. \`cat ~/.deeplake/memory/index.md\` and take the newest rows whose \`Project\` matches this repo (or \`ls -t ~/.deeplake/memory/summaries/<your-username>/\` for the latest files).
  2. \`cat\` the newest matching summary. If its \`## Next Steps\` (or older \`## Open Questions / TODO\`) is empty or says "none", move to the next-newest until you find one with real open work.
  3. Load THAT summary as context, then RECONCILE with the current git state (branch, uncommitted changes) before acting — the summary can be stale. Tell the user where they left off and confirm before continuing; don't silently execute the next step.
  4. Don't bulk-read \`sessions/\` — drill into the raw jsonl only for a specific detail the summary is missing.

Organization management — each argument is SEPARATE (do NOT quote subcommands together):
- hivemind login                              — SSO login
- hivemind whoami                             — show current user/org
- hivemind org list                           — list organizations
- hivemind org switch <name-or-id>            — switch organization
- hivemind workspaces                         — list workspaces
- hivemind workspace <id>                     — switch workspace
- hivemind invite <email> <ADMIN|WRITE|READ>  — invite member (ALWAYS ask user which role before inviting)
- hivemind members                            — list members
- hivemind remove <user-id>                   — remove member

Skill management (mine + share reusable Claude skills across the org):
${renderSkillifyCommands()}

Embeddings (semantic memory search) — opt-in, persisted in ~/.deeplake/config.json:
- hivemind embeddings install                        — download deps (~600MB), symlink agents, set enabled:true
- hivemind embeddings enable                         — flip enabled:true (run install first if deps missing)
- hivemind embeddings disable                        — flip enabled:false + SIGTERM daemon (deps stay on disk)
- hivemind embeddings uninstall [--prune]            — remove agent symlinks + disable; --prune wipes deps too
- hivemind embeddings status                         — show config + deps + per-agent link state

IMPORTANT: Only use bash commands (cat, ls, grep, echo, jq, head, tail, etc.) to interact with ~/.deeplake/memory/. Do NOT use python, python3, node, curl, or other interpreters — they are not available in the memory filesystem. Avoid bash brace expansions like \`{1..10}\` (not fully supported); spell out paths explicitly. Bash output is capped at 10MB total — avoid \`for f in *.json; do cat $f\` style loops on the whole sessions dir.

LIMITS: Do NOT spawn subagents to read deeplake memory. If a file returns empty after 2 attempts, skip it and move on. Report what you found rather than exhaustively retrying.

Debugging: Set HIVEMIND_DEBUG=1 to enable verbose logging to ~/.deeplake/hook-debug.log`;

const HOME = homedir();
const { log: wikiLog } = makeWikiLogger(join(HOME, ".claude", "hooks"));

/** Create a placeholder summary via direct SQL INSERT (no DeeplakeFs bootstrap needed). */
async function createPlaceholder(api: DeeplakeApi, table: string, sessionId: string, cwd: string, userName: string, orgName: string, workspaceId: string, pluginVersion: string): Promise<void> {
  const summaryPath = `/summaries/${userName}/${sessionId}.md`;

  // table is config-driven (HIVEMIND_TABLE) and interpolated raw into the
  // Deeplake SQL API (no parameterized queries) — validate as an identifier.
  const tbl = sqlIdent(table);
  const existing = await api.query(
    `SELECT path FROM "${tbl}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`
  );
  if (existing.length > 0) {
    wikiLog(`SessionStart: summary exists for ${sessionId} (resumed)`);
    return;
  }

  const now = new Date().toISOString();
  const projectName = projectNameFromCwd(cwd);
  const sessionSource = `/sessions/${userName}/${userName}_${orgName}_${workspaceId}_${sessionId}.jsonl`;
  const content = [
    `# Session ${sessionId}`,
    `- **Source**: ${sessionSource}`,
    `- **Started**: ${now}`,
    `- **Project**: ${projectName}`,
    `- **Status**: in-progress`,
    "",
  ].join("\n");
  const filename = `${sessionId}.md`;

  await api.query(
    `INSERT INTO "${tbl}" (id, path, filename, summary, author, mime_type, size_bytes, project, description, agent, plugin_version, creation_date, last_update_date) ` +
    `VALUES ('${crypto.randomUUID()}', '${sqlStr(summaryPath)}', '${sqlStr(filename)}', E'${sqlStr(content)}', '${sqlStr(userName)}', 'text/markdown', ` +
    `${Buffer.byteLength(content, "utf-8")}, '${sqlStr(projectName)}', 'in progress', 'claude_code', '${sqlStr(pluginVersion)}', '${now}', '${now}')`
  );

  wikiLog(`SessionStart: created placeholder for ${sessionId} (${cwd})`);
}

interface SessionStartInput {
  session_id: string;
  cwd?: string;
}

async function main(): Promise<void> {
  // Skip if this is a sub-session spawned by the wiki worker
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;

  const __hookT0 = Date.now();
  log(`hook entered (pid=${process.pid})`);

  const input = await readStdin<SessionStartInput>();

  // A fresh start or --resume of this session re-activates it: drop any stale
  // ended marker and record the owning `claude` process so other sessions can
  // tell this one is live even while it sits idle waiting on the user.
  if (input.session_id) {
    clearSessionEnded(input.session_id);
    recordSessionOwner(input.session_id);
    // Re-arm the heartbeat so the non-Linux mtime fallback in isSessionLive()
    // marks this resumed session live right away, not only after its first
    // captured event (on Linux the owner record above already does this).
    touchSessionActivity(input.session_id);
  }

  let creds = loadCredentials();

  if (!creds?.token) {
    log("no credentials found — run /hivemind:login to authenticate");
    // First-impression bootstrap: when an unauthenticated user opens a
    // session on a box that has Claude Code transcripts but no local
    // mining manifest yet, spawn `hivemind skillify mine-local` in the
    // background. The worker writes to ~/.claude/skills/ + fan-out
    // symlinks; THIS session sees the standard "not logged in" message,
    // and the NEXT SessionStart fire surfaces the count + sign-in CTA.
    // All guards (manifest, lock, no-sessions, no-hivemind-bin) live
    // inside maybeAutoMineLocal — call is always safe.
    const auto = maybeAutoMineLocal();
    log(`auto-mine: ${auto.triggered ? "triggered (background)" : `skipped (${auto.reason})`}`);
  } else {
    log(`credentials loaded: org=${creds.orgName ?? creds.orgId}`);
    // Self-heal the legacy `org switch` regression: pre-fix versions only
    // rewrote orgId without re-minting, so creds.token still carries the
    // old org_id claim. Detect drift here and re-bind; non-fatal on
    // failure (logged + continue with stale token).
    creds = await healDriftedOrgToken(creds, log);
    // Backfill userName if missing (for users who logged in before this field was added)
    if (creds.token && !creds.userName) {
      try {
        const { userInfo } = await import("node:os");
        creds.userName = userInfo().username ?? "unknown";
        saveCredentials(creds);
        log(`backfilled and persisted userName: ${creds.userName}`);
      } catch { /* non-fatal */ }
    }
  }

  // Centralized autoupdate fires BEFORE the DB ensure-table calls — those
  // can stall for tens of seconds against a slow/unreachable backend, and
  // autoUpdate has no dependency on table state. Run it first so the user
  // sees the upgrade notice promptly even when the API is down.
  await autoUpdate(creds, { agent: "claude" });

  // Resolve the installed plugin version once up front — it's stamped on
  // every row this session writes (placeholder + capture) and is also used
  // for the user-visible update notice below.
  // getInstalledVersion swallows its own fs errors and returns null.
  const current = getInstalledVersion(__bundleDir, ".claude-plugin");
  const pluginVersion = current ?? "";

  // Ensure tables exist and (when capture is enabled) create the placeholder
  // summary via direct SQL. Tables must always be synced so queries return
  // fresh data — only the placeholder INSERT is skipped when HIVEMIND_CAPTURE=false
  // (benchmark runs, explicit opt-out). Mirrors the guard already in
  // session-start-setup.ts / session-end.ts / codex hooks.
  // HIVEMIND_CAPTURE=false means full read-only mode — no INSERTs and
  // no DDL. ensureTable + ensureSessionsTable both create/heal tables
  // (DDL writes), so they MUST be gated on captureEnabled. Codex
  // review pass 4 surfaced this — the prior code ran ensure* even
  // under capture=false. The renderer is read-only and runs
  // regardless; the rules table it queries is lazy-created by the
  // CLI write path (`hivemind rules add`).
  const captureEnabled = process.env.HIVEMIND_CAPTURE !== "false" && entrypointPassesOnlyCliGate();

  // Auto-pull skills from all org users into ~/.claude/skills/ on every
  // SessionStart. File writes inside runPull are idempotent (skipped
  // when local version is at-or-newer than remote), so re-running each
  // session is cheap on disk; the only per-call cost is the SQL
  // round-trip. Bounded by a 5s timeout so a slow Deeplake never
  // freezes SessionStart. Hard opt-out via HIVEMIND_AUTOPULL_DISABLED=1.
  // All failures swallowed inside autoPullSkills (documented as
  // never-rejecting), so no try/catch needed here.
  const pullResult = await autoPullSkills();
  log(`autopull: pulled=${pullResult.pulled} skipped=${pullResult.skipped}`);

  let rulesBlock = "";
  if (input.session_id && creds?.token) {
    try {
      const config = loadConfig();
      if (config) {
        const table = config.tableName;
        const sessionsTable = config.sessionsTableName;
        const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, table);
        if (captureEnabled) {
          await api.ensureTable();
          await api.ensureSessionsTable(sessionsTable);
          await createPlaceholder(api, table, input.session_id, input.cwd ?? "", config.userName, config.orgName, config.workspaceId, pluginVersion);
          log("placeholder created");
        } else {
          const reason = process.env.HIVEMIND_CAPTURE === "false"
            ? "HIVEMIND_CAPTURE=false"
            : "HIVEMIND_CAPTURE_ONLY_CLI gate";
          log(`placeholder + schema ensure skipped (${reason})`);
        }
        // Renderer is read-only and runs regardless of captureEnabled.
        // It absorbs its own errors (missing table, network, etc.)
        // and returns "" on any failure — SessionStart MUST NOT fail
        // because of a bad rules read.
        // Trusted table list (cached — ensureTable above already warmed it)
        // so the renderer can skip the rules/goals SELECT when the table
        // isn't there yet, avoiding a 42P01 server-side on every SessionStart.
        const known = await api.knownTablesOrNull();
        const tableExists = known ? (name: string) => known.includes(name) : undefined;
        rulesBlock = await renderContextBlock(
          (sql: string) => api.query(sql) as Promise<Array<Record<string, unknown>>>,
          {
            rulesTable: config.rulesTableName,
            goalsTable: config.goalsTableName,
            currentUser: config.userName,
          },
          { log, tableExists },
        );
      }
    } catch (e: any) {
      log(`placeholder failed: ${e.message}`);
      wikiLog(`SessionStart: placeholder failed for ${input.session_id}: ${e.message}`);
    }
  }

  // SkillOpt is no longer fired from SessionStart — it's event-driven now (a skill
  // invocation arms the session via PreToolUse, then UserPromptSubmit/SessionEnd tick
  // the per-skill counter and fire only on accumulated pushback). See skillopt-trigger.

  // Version notice in additionalContext — informational only; the
  // upgrade-applied signal goes to stderr from inside autoUpdate (which
  // already fired earlier in main(), before the DB ensure-table calls).
  const updateNotice = current ? `\n\n✅ Hivemind v${current}` : "";

  // No placeholder substitution needed — inject uses bare `hivemind <sub>` form.
  const resolvedContext = context;
  // When the user hasn't signed in but has mined skills locally with
  // `hivemind skillify mine-local`, surface a count + sign-in CTA in
  // the model-visible context. The rich concrete-insight banner is
  // delivered on the user-visible systemMessage channel by the
  // notifications rule (src/notifications/rules/local-mined.ts) — it
  // is intentionally NOT rendered here because `insight` originates
  // from haiku's gate output and feeding LLM-derived prose back into
  // `additionalContext` is a prompt-injection vector (codex P1).
  // Take the refactored helper from main (renderLocalMinedNote) AND the
  // graph-bridge wiring from this branch. The helper supersedes the
  // inline string construction; the graph spawn + inject append remain.
  const localMined = countLocalManifestEntries();
  // Use the shared renderer (extracted on main for testability / codex
  // review on PR #197) — keep `baseContext` here as the intermediate
  // because the rules block append below depends on a separate name
  // from the final `additionalContext` emitted to stdout.
  const localMinedNote = renderLocalMinedNote({ totalCount: localMined });

  // Local code graph context (Phase 3 v1.1). Cheap: reads ~/.hivemind/...
  // /.last-build.json (small file populated by writeSnapshot) — never opens
  // the ~1 MB snapshot. Returns null when no graph exists for this repo, in
  // which case we add nothing (avoids a misleading "graph: 0 nodes" line
  // for users who've never run a build).
  //
  // Fire the async graph-pull worker BEFORE composing the inject. The
  // worker runs detached and will not affect THIS session's inject (the
  // pulled bytes land for the NEXT SessionStart to pick up). Putting the
  // spawn here is purely organizational — order doesn't matter because
  // the worker is fully detached.
  // Gate on creds: pullSnapshot would early-return "skipped-no-auth"
  // anyway, so spawning a worker without auth is wasted process churn.
  if (creds?.token) spawnGraphPullWorker(input.cwd ?? process.cwd(), __bundleDir);
  const graphLine = graphContextLine(input.cwd ?? process.cwd());
  const graphNote = graphLine ?? "";

  const baseContext = creds?.token
    ? `${resolvedContext}\n\nLogged in to Deeplake as org: ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"})${updateNotice}`
    : `${resolvedContext}\n\nNot logged in to Deeplake; memory search is unavailable this session.${localMinedNote}${updateNotice}`;
  // Append the rules block when there's something to show, then
  // append the graph note (single line, may be empty). The renderer
  // returns "" on empty state OR failure, so the ternary stays terse.
  const withRules = rulesBlock
    ? `${baseContext}\n\n${rulesBlock}`
    : baseContext;
  const additionalContext = `${withRules}${graphNote}`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  }));
  log(`hook done (${Date.now() - __hookT0}ms total)`);
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
