/**
 * Shared helper for spawning the detached wiki-worker.js process.
 * Called from session-end.ts (always) and capture.ts (periodic trigger).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type { Config } from "../config.js";
import { makeWikiLogger } from "../utils/wiki-log.js";
import { getInstalledVersion } from "../utils/version-check.js";
import { spawnDetachedNodeWorker } from "../utils/spawn-detached.js";
import { projectNameFromCwd } from "../utils/project-name.js";
import { resolveCliBin } from "../utils/resolve-cli-bin.js";

const HOME = homedir();
const wikiLogger = makeWikiLogger(join(HOME, ".claude", "hooks"));
export const WIKI_LOG = wikiLogger.path;

export const WIKI_PROMPT_TEMPLATE = `You are building a personal wiki from a coding session. Your goal is to extract every piece of knowledge — entities, decisions, relationships, and facts — into a structured, searchable wiki entry. Think of this as building a knowledge graph, not writing a summary.

SESSION JSONL path: __JSONL__
SUMMARY FILE to write: __SUMMARY__
SESSION ID: __SESSION_ID__
PROJECT: __PROJECT__
PREVIOUS JSONL OFFSET (lines already processed): __PREV_OFFSET__
CURRENT JSONL LINES: __JSONL_LINES__

Steps:
1. Read the session JSONL at the path above.
   - If PREVIOUS JSONL OFFSET > 0, this is a resumed session. Read the existing summary file first,
     then focus on lines AFTER the offset for new content. Merge new facts into the existing summary.
   - If offset is 0, generate from scratch.

2. Write the summary file at the path above with this EXACT format. The header fields (Source, Project) are pre-filled — copy them VERBATIM, do NOT replace them with paths from the JSONL content:

# Session __SESSION_ID__
- **Source**: __JSONL_SERVER_PATH__
- **Started**: <extract from JSONL>
- **Ended**: <now>
- **Project**: __PROJECT__
- **JSONL offset**: __JSONL_LINES__

## What Happened
<2-3 dense sentences. What was the goal, what was accomplished, what's left. Preserve VERBATIM any precise, non-derivable identifier that defines the work — exact token/key/secret-name values, version numbers, error codes/sqlstates, table/branch/file names, commit SHAs, config keys and their chosen values. If the session established a specific value (e.g. a token "QX7341-ZULU-STAGING", a flag set to 0, a threshold of 0.5), write that EXACT value here, not a paraphrase of it. A future reader must be able to answer "what was the value?" from this section alone.>

## People
<For each person mentioned: name, role, what they did/said. Format: **Name** — role — action>

## Entities
<Every named thing: repos, branches, files, APIs, tools, services, tables, features, bugs.
Format: **entity** (type) — what was done with it, its current state>

## Decisions & Reasoning
<Every decision made and WHY. Not just "did X" but "did X because Y, considered Z but rejected it because W">

## Key Facts
<Bullet list of atomic facts that could answer future questions. Each fact should stand alone and include the EXACT, VERBATIM value where one exists — never replace a concrete identifier/value with a vague gist. Quote literal values inline.
Examples:
"- The memory table uses DELETE+INSERT, not UPDATE (WASM doesn't support upsert)"
"- The staging verification token is QX7341-ZULU-STAGING (set in config key auth.staging_token)"
"- DEEPLAKE_SNAPSHOT_RESTORE_ON_CLAIM was flipped from 1 to 0 to stop the eviction race">

## Files Modified
<bullet list: path (new/modified/deleted) — what changed>

## Open Questions / TODO
<Anything unresolved, blocked, or explicitly deferred>

## Next Steps
<Decide in two steps. STEP 1 — is the work this session set out to do actually finished? If it ended mid-task — a feature only half-implemented, a build or test still failing, a fix written but not yet verified, a plan agreed but not executed, a blocker hit and unresolved, or an explicit "still need to.../next I'll..." left hanging — then it is NOT finished and you MUST write a single concrete imperative line naming the unfinished work (e.g. "Finish wiring the uint32 class_label scan binding and run its test"). The session's LAST messages are the strongest signal: if they describe or show work still in progress or something left to do, that IS the next step — never suppress a genuinely unfinished task, and do not demand "substantial consequences" for it. STEP 2 — if the core work IS finished, default to exactly: none and do not invent a follow-up to fill the section. Write none when the work reached a natural stopping point, only trivial/obvious/optional polish or cleanup remains, the "next step" would just be open-ended exploration, or the only thing left is administrative wrap-up (committing, pushing, opening/merging a PR, deploying, monitoring CI — treat ALL such wrap-up as ALREADY DONE). The sole exception that still warrants a next step on otherwise-finished work is a separate, important, non-obvious item a returning engineer would NOT realize on their own and would be materially harmed by missing.>

IMPORTANT: Be exhaustive. Extract EVERY entity, decision, and fact. Future you will search this wiki to answer questions like "who worked on X", "why did we choose Y", "what's the status of Z". If a detail exists in the session, it should be in the wiki.

PRIVACY: Never include absolute filesystem paths (e.g. /home/user/..., /Users/..., C:\\\\...) in the summary. Use only project-relative paths or the project name. The Source and Project fields above are already correct — do not change them.

LENGTH LIMIT: Keep the total summary under 4000 characters. Be dense and concise — prioritize facts over prose. If a session is short, the summary should be short too.`;

export const wikiLog = wikiLogger.log;

export function findClaudeBin(): string {
  return resolveCliBin("claude");
}

export interface SpawnOptions {
  config: Config;
  sessionId: string;
  cwd: string;
  bundleDir: string;
  reason: string;
  /** Value written to the summary's `agent` column. Defaults to "claude_code". */
  agent?: string;
}

export function spawnWikiWorker(opts: SpawnOptions): void {
  const { config, sessionId, cwd, bundleDir, reason } = opts;
  const projectName = projectNameFromCwd(cwd);

  const tmpDir = join(tmpdir(), `deeplake-wiki-${sessionId}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const pluginVersion = getInstalledVersion(bundleDir, ".claude-plugin") ?? "";

  const configFile = join(tmpDir, "config.json");
  writeFileSync(configFile, JSON.stringify({
    apiUrl: config.apiUrl,
    token: config.token,
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    memoryTable: config.tableName,
    sessionsTable: config.sessionsTableName,
    sessionId,
    userName: config.userName,
    orgName: config.orgName,
    project: projectName,
    agent: opts.agent ?? "claude_code",
    pluginVersion,
    tmpDir,
    claudeBin: findClaudeBin(),
    wikiLog: WIKI_LOG,
    hooksDir: join(HOME, ".claude", "hooks"),
    promptTemplate: WIKI_PROMPT_TEMPLATE,
  }));

  wikiLog(`${reason}: spawning summary worker for ${sessionId}`);

  const workerPath = join(bundleDir, "wiki-worker.js");
  spawnDetachedNodeWorker(workerPath, [configFile]);

  wikiLog(`${reason}: spawned summary worker for ${sessionId}`);
}

export function bundleDirFromImportMeta(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}
