/**
 * Hermes on_session_start hook.
 *
 * Hermes hook spec (from agent/shell_hooks.py):
 *   stdin  JSON: { hook_event_name, tool_name?, tool_input?, session_id, cwd, extra? }
 *   stdout JSON: { context: "..." } injects context into pre_llm_call;
 *                for on_session_start, the recommended shape is also { context }
 *                — the docstring describes pre_llm_call but the same wire is
 *                used for session start.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCredentials, healDriftedOrgToken } from "../../commands/auth.js";
import { loadConfig } from "../../config.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { renderContextBlock } from "../shared/context-renderer.js";
import { sqlIdent, sqlStr } from "../../utils/sql.js";
import { projectNameFromCwd } from "../../utils/project-name.js";
import { renderSkillifyCommands } from "../../cli/skillify-spec.js";
import { countLocalManifestEntries } from "../../skillify/local-manifest.js";
import { maybeAutoMineLocal } from "../../skillify/spawn-mine-local-worker.js";
import { readStdin } from "../../utils/stdin.js";
import { log as _log } from "../../utils/debug.js";
import { getInstalledVersion } from "../../utils/version-check.js";
import { autoUpdate } from "../shared/autoupdate.js";
import { autoPullSkills } from "../../skillify/auto-pull.js";
import { GOALS_INSTRUCTIONS_CLI } from "../shared/goals-instructions.js";
import { spawnGraphPullWorker } from "../../graph/spawn-pull-worker.js";
import { graphContextLine } from "../../graph/session-context.js";
const log = (msg: string) => _log("hermes-session-start", msg);

const __bundleDir = dirname(fileURLToPath(import.meta.url));
// Hivemind requires its npm bin (`hivemind` from @deeplake/hivemind) on PATH.
// Inject text uses bare `hivemind <sub>` form — no per-agent path resolution needed.

const context = `DEEPLAKE MEMORY: Persistent memory at ~/.deeplake/memory/ shared across sessions, users, and agents.

Structure: index.md (start here) → summaries/*.md → sessions/*.jsonl (last resort). Do NOT jump straight to JSONL.
Search: use \`grep\` (NOT \`rg\`/ripgrep). Example: grep -ri "keyword" ~/.deeplake/memory/
You also have hivemind MCP tools registered: hivemind_search, hivemind_read, hivemind_index. Prefer these — one tool call returns ranked hits across all summaries and sessions in a single SQL query.
IMPORTANT: Only use these bash builtins to interact with ~/.deeplake/memory/: cat, ls, grep, echo, jq, head, tail, sed, awk, wc, sort, find. Do NOT use rg/ripgrep, python, python3, node, curl, or other interpreters.
Do NOT spawn subagents to read deeplake memory.

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

SKILLS (skillify) — mine + share reusable skills across the org:
${renderSkillifyCommands()}

Embeddings (semantic memory search) — opt-in, persisted in ~/.deeplake/config.json:
- hivemind embeddings install               — download deps (~600MB), symlink agents, set enabled:true
- hivemind embeddings enable                — flip enabled:true (run install first if deps missing)
- hivemind embeddings disable               — flip enabled:false + SIGTERM daemon (deps stay on disk)
- hivemind embeddings uninstall [--prune]   — remove agent symlinks + disable; --prune wipes deps too
- hivemind embeddings status                — show config + deps + per-agent link state`;

interface HermesSessionStartInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  extra?: Record<string, unknown>;
}

async function createPlaceholder(
  api: DeeplakeApi,
  table: string,
  sessionId: string,
  cwd: string,
  userName: string,
  orgName: string,
  workspaceId: string,
  pluginVersion: string,
): Promise<void> {
  const summaryPath = `/summaries/${userName}/${sessionId}.md`;
  // table is config-driven (HIVEMIND_TABLE) and interpolated raw into the
  // Deeplake SQL API (no parameterized queries) — validate as an identifier.
  const tbl = sqlIdent(table);
  const existing = await api.query(
    `SELECT path FROM "${tbl}" WHERE path = '${sqlStr(summaryPath)}' LIMIT 1`,
  );
  if (existing.length > 0) return;

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
    `${Buffer.byteLength(content, "utf-8")}, '${sqlStr(projectName)}', 'in progress', 'hermes', '${sqlStr(pluginVersion)}', '${now}', '${now}')`,
  );
}

async function main(): Promise<void> {
  if (process.env.HIVEMIND_WIKI_WORKER === "1") return;
  const input = await readStdin<HermesSessionStartInput>();
  const sessionId = input.session_id ?? `hermes-${Date.now()}`;
  const cwd = input.cwd ?? process.cwd();

  let creds = loadCredentials();
  const captureEnabled = process.env.HIVEMIND_CAPTURE !== "false";

  if (!creds?.token) {
    // Auto-trigger mine-local on first SessionStart for unauthenticated
    // users. Detached spawn — see spawn-mine-local-worker.ts for the
    // full set of guards. Next session shows the count via
    // countLocalManifestEntries().
    maybeAutoMineLocal();
  } else {
    creds = await healDriftedOrgToken(creds, log);
  }

  // Centralized autoupdate fires BEFORE the DB ensure-table calls — those
  // can stall for tens of seconds against a slow/unreachable backend, and
  // autoUpdate has no dependency on table state. Run it first so the user
  // sees the upgrade notice promptly even when the API is down.
  await autoUpdate(creds, { agent: "hermes" });

  // Resolve plugin version once — also stamped on the placeholder row.
  const current = getInstalledVersion(__bundleDir, ".claude-plugin");
  const pluginVersion = current ?? "";

  // HIVEMIND_CAPTURE=false means full read-only mode — no INSERTs
  // AND no DDL. ensureTable + ensureSessionsTable create/heal tables
  // (DDL writes), so they're gated on captureEnabled too. Renderer
  // is read-only and runs regardless. See cursor session-start for
  // the same layering rationale.
  let rulesBlock = "";
  if (creds?.token) {
    try {
      const config = loadConfig();
      if (config) {
        const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
        if (captureEnabled) {
          await api.ensureTable();
          await api.ensureSessionsTable(config.sessionsTableName);
          await createPlaceholder(api, config.tableName, sessionId, cwd, config.userName, config.orgName, config.workspaceId, pluginVersion);
          log("placeholder created");
        } else {
          log("placeholder + schema ensure skipped (HIVEMIND_CAPTURE=false)");
        }
        // Read-only renderer. Hermes's context field is invisible to
        // the user (model-only). Renderer absorbs its own errors.
        // Trusted table list (cached) so the renderer skips the rules/goals
        // SELECT when the table isn't there yet — avoids a 42P01 server-side.
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
    }
  }

  // Auto-pull skills from all org users on every SessionStart (5s timeout).
  // File writes inside runPull are idempotent (skipped when local version
  // is at-or-newer than remote), so re-running every session is cheap on
  // disk; the only per-call cost is the SQL round-trip. autoPullSkills
  // never rejects — all errors are swallowed inside. Hard opt-out:
  // HIVEMIND_AUTOPULL_DISABLED=1.
  const pullResult = await autoPullSkills();
  log(`autopull: pulled=${pullResult.pulled} skipped=${pullResult.skipped}`);

  let versionNotice = "";
  if (current) versionNotice = `\nHivemind v${current}`;

  // No placeholder substitution — inject already uses bare `hivemind <sub>` form.
  const localMined = countLocalManifestEntries();
  const localMinedNote = localMined > 0
    ? `\n${localMined} local skill${localMined === 1 ? "" : "s"} from past 'hivemind skillify mine-local' run(s) live in ~/.claude/skills/. Run 'hivemind login' to start sharing new mining results with your team.`
    : "";
  // Async auto-pull on SessionStart — detached, never blocks. Pulled
  // bytes land for the NEXT SessionStart. See src/graph/spawn-pull-worker.ts.
  // Gate on creds: avoid wasted process churn when unauthenticated
  // (pullSnapshot would early-return skipped-no-auth anyway).
  if (creds?.token) spawnGraphPullWorker(cwd, __bundleDir);

  const baseContext = creds?.token
    ? `${context}\nLogged in to Deeplake as org: ${creds.orgName ?? creds.orgId} (workspace: ${creds.workspaceId ?? "default"})${versionNotice}`
    : `${context}\nNot logged in to Deeplake. Run: hivemind login${localMinedNote}${versionNotice}`;
  // Hermes' pre-tool-use intercepts only `terminal` — it cannot
  // route Write/Edit. Use the CLI variant: agent invokes
  // `hivemind goal add/list/...` via terminal. End state in tables
  // is identical to the VFS-routed path.
  const baseWithGoals = creds?.token ? `${baseContext}\n\n${GOALS_INSTRUCTIONS_CLI}` : baseContext;
  // Code-graph inject. Unlike harnesses/claude-code/cursor this is user-visible in the
  // Hermes TUI (Hermes has no model-only SessionStart channel), but an
  // always-present structural index is worth the extra lines. graphContextLine
  // returns null — and appends nothing — when no graph exists for this repo yet.
  const graphNote = graphContextLine(cwd) ?? "";
  const additional = (rulesBlock
    ? `${baseWithGoals}\n\n${rulesBlock}`
    : baseWithGoals) + graphNote;

  // Hermes expects { context: "..." } on stdout
  console.log(JSON.stringify({ context: additional }));
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
