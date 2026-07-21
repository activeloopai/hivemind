#!/usr/bin/env node

/**
 * CLI surface for the codebase-graph feature (Phase 1.5).
 *
 * hivemind graph build [--cwd <path>]
 *   Walk the project for source files, run the tree-sitter extractor on each
 *   (TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C, C++), write a
 *   snapshot to ~/.hivemind/graphs/<repo-key>/.
 */

import { execSync } from "node:child_process";
import { loadConfig } from "../config.js";
import { runDocsOnboarding } from "../docs/onboarding.js";
import { tryGitTopLevel } from "../graph/git-hook-install.js";
import { loadCurrentSnapshot } from "../graph/load-current.js";
import { spawnDetachedNodeWorker } from "../utils/spawn-detached.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { createHash } from "node:crypto";

import { getVersion } from "../cli/version.js";
import { fileContentHash, readCache, writeCache } from "../graph/cache.js";
import { pushSnapshot } from "../graph/deeplake-push.js";
import { pullSnapshot } from "../graph/deeplake-pull.js";
import {
  diffSnapshots,
  loadSnapshotByCommit,
  printDiffHuman,
} from "../graph/diff.js";
import { extractFile } from "../graph/extract/index.js";
import {
  loadGraphIgnore,
  ignoreDirSet,
  pathHasIgnoredSegment,
  type GraphIgnoreConfig,
} from "../graph/ignore-config.js";
import {
  installPostCommitHook,
  uninstallPostCommitHook,
} from "../graph/git-hook-install.js";
import { countHistoryEntries, readHistoryTail, type SnapshotTrigger } from "../graph/history.js";
import { buildSnapshot, repoDir, writeSnapshot } from "../graph/snapshot.js";
import type {
  FileExtraction,
  GraphMetadata,
  GraphObservation,
} from "../graph/types.js";
import { deriveProjectKey } from "../utils/repo-identity.js";
import { maybeSpawnDocsRefresh } from "../docs/auto-refresh-trigger.js";

const USAGE = `hivemind graph — codebase-graph commands (Phase 1.5)

Usage:
  hivemind graph build [--cwd <path>]
      Walk the project for supported source files (TS, JS, Python, Go, Rust, Java, Ruby, C, C++), extract symbols + edges,
      and write a snapshot to ~/.hivemind/graphs/<repo-key>/snapshots/<commit-sha>.json.
      Also updates ~/.hivemind/graphs/<repo-key>/latest-commit.txt and the
      per-repo .last-build.json (consumed by the SessionEnd auto-build hook).

  hivemind graph diff <sha1> <sha2> [--cwd <path>] [--json] [--limit N]
      Diff two snapshots by their git commit SHA. Prints added/removed
      counts for nodes and edges, plus up to N=10 (default) examples of each.
      --json: emit machine-readable JSON instead of the human format.
      --limit N: cap the per-category examples (human format only).

  hivemind graph history [--cwd <path>] [-n N] [--json]
      Print the last N (default 20) entries from the per-repo history.jsonl,
      newest last. Each entry shows ts, commit_sha (short), snapshot_sha256
      (short), node/edge counts, and the trigger that fired the build.
      --json: emit raw JSONL (one parsed entry per line, full fields).

  hivemind graph init [--cwd <path>] [--force] [--no-initial-build]
      Install a managed block in .git/hooks/post-commit that fires
      \`hivemind graph build --trigger post-commit\` after each commit
      (async, non-blocking, exit 0 always). Idempotent: re-running on
      an already-installed hook is a no-op. Refuses to clobber an
      existing non-managed hook unless --force is passed.
      Also runs an initial \`hivemind graph build\` unless
      --no-initial-build is passed.

  hivemind graph uninstall [--cwd <path>]
      Remove our managed block from .git/hooks/post-commit. If our block
      was the only content, deletes the file; otherwise leaves the rest
      intact. Snapshots and history are NOT touched (\`rm -rf
      ~/.hivemind/graphs/<key>\` if you really want them gone).

  hivemind graph pull [--cwd <path>]
      Download the freshest cloud snapshot for HEAD into the local graph
      dir (any worktree of this user counts). No-op if local already
      matches cloud sha256 or local was built later than cloud. Requires
      \`hivemind login\`. Best-effort: any network/auth failure leaves
      the local files untouched. Disable via HIVEMIND_GRAPH_PULL=0.

  hivemind graph --help
      Show this message.

  Future subcommands (Phase 1.5+): daemon, search, latest, push, pull, prune.
`;

// Which directories to skip during discovery lives in
// src/graph/ignore-config.ts — a user-editable JSON (~/.deeplake/graph-ignore.json)
// merged with the repo's own .gitignore (honored via git ls-files).

/** Top-level dispatcher: invoked from src/cli/index.ts on `hivemind graph ...`. */
export function runGraphCommand(args: string[]): void | Promise<void> {
  const sub = args[0];
  if (sub === undefined || sub === "--help" || sub === "-h" || sub === "help") {
    console.log(USAGE);
    return;
  }
  if (sub === "build") {
    return runBuildCommand(args.slice(1));
  }
  if (sub === "diff") {
    runDiffCommand(args.slice(1));
    return;
  }
  if (sub === "history") {
    runHistoryCommand(args.slice(1));
    return;
  }
  if (sub === "init") {
    return runInitCommand(args.slice(1));
  }
  if (sub === "uninstall") {
    runUninstallCommand(args.slice(1));
    return;
  }
  if (sub === "pull") {
    return runPullCommand(args.slice(1));
  }
  console.error(`hivemind graph: unknown subcommand '${sub}'`);
  console.error(USAGE);
  process.exit(2);
}

interface InitOptions {
  cwd: string;
  force: boolean;
  initialBuild: boolean;
}

function parseInitArgs(args: string[]): InitOptions {
  let cwd = process.cwd();
  let force = false;
  let initialBuild = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--no-initial-build") {
      initialBuild = false;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph init: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, force, initialBuild };
}

async function runInitCommand(args: string[]): Promise<void> {
  const opts = parseInitArgs(args);
  const status = installPostCommitHook(opts.cwd, { force: opts.force });
  switch (status.kind) {
    case "installed":
      console.log(`Installed post-commit hook at ${status.path}`);
      break;
    case "already-ours":
      console.log(`Post-commit hook already managed by hivemind (no change): ${status.path}`);
      break;
    case "foreign-hook":
      console.error(`hivemind graph init: ${status.hint}`);
      process.exit(1);
  }
  if (opts.initialBuild) {
    console.log("");
    console.log("Running initial build...");
    await runBuildCommand(["--cwd", opts.cwd, "--trigger", "manual"]);
  } else {
    console.log("");
    console.log("Skipped initial build (--no-initial-build). Run `hivemind graph build` when ready.");
  }

  // Docs onboarding — the one moment a human consents to LLM spend. The
  // build above makes the ~N pages estimate real. Fail-closed by contract:
  // no git → hint only; no TTY → silent; defaults are No.
  const initCfg = loadConfig();
  if (initCfg) {
    const root = tryGitTopLevel(opts.cwd) ?? opts.cwd;
    console.log("");
    const result = await runDocsOnboarding({
      root,
      isGitRepo: tryGitTopLevel(opts.cwd) !== null,
      orgId: initCfg.orgId,
      orgName: initCfg.orgName,
      project: deriveProjectKey(root).key,
      snap: loadCurrentSnapshot(root),
    });
    if (result.generate) {
      const cliEntry = process.argv[1];
      if (cliEntry) {
        spawnDetachedNodeWorker(cliEntry, ["docs", "wiki", "--cwd", root]);
        console.log("Generating wiki docs in the background — check with: hivemind docs list");
      } else {
        console.log("Run `hivemind docs wiki` to generate the corpus.");
      }
    }
  }
}

interface UninstallOptions {
  cwd: string;
}

function parseUninstallArgs(args: string[]): UninstallOptions {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph uninstall: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}

function runUninstallCommand(args: string[]): void {
  const opts = parseUninstallArgs(args);
  const status = uninstallPostCommitHook(opts.cwd);
  switch (status.kind) {
    case "removed":
      if (status.wholeFileDeleted) {
        console.log(`Removed post-commit hook (file deleted): ${status.path}`);
      } else {
        console.log(`Removed managed block from post-commit hook (other content preserved): ${status.path}`);
      }
      console.log("Local snapshots + history.jsonl are untouched.");
      break;
    case "no-hook":
      console.log(
        status.path === "" ? "No git repo here (nothing to uninstall)." : `No post-commit hook at ${status.path} (nothing to uninstall).`,
      );
      break;
    case "not-ours":
      console.error(`hivemind graph uninstall: ${status.hint}`);
      process.exit(1);
  }
}

interface HistoryOptions {
  cwd: string;
  n: number;
  json: boolean;
}

function parseHistoryArgs(args: string[]): HistoryOptions {
  let cwd = process.cwd();
  let n = 20;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "-n" && i + 1 < args.length) {
      // CodeRabbit Minor: parseInt accepts trailing junk ("5junk" → 5).
      // Validate the whole token before converting.
      const raw = args[i + 1]!;
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph history: -n must be a non-negative integer");
        process.exit(2);
      }
      n = Number(raw);
      i += 1;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph history: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, n, json };
}

function runHistoryCommand(args: string[]): void {
  const opts = parseHistoryArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);
  const total = countHistoryEntries(baseDir);
  const entries = readHistoryTail(baseDir, opts.n);

  if (opts.json) {
    for (const e of entries) console.log(JSON.stringify(e));
    return;
  }

  if (total === 0) {
    console.log("No history yet. Run `hivemind graph build` to record one.");
    return;
  }
  console.log(`history.jsonl: ${total} total entries; showing last ${entries.length}`);
  console.log("");
  for (const e of entries) {
    const commit = e.commit_sha === null ? "(no-git)" : e.commit_sha.slice(0, 7);
    const snap = e.snapshot_sha256.slice(0, 7);
    console.log(
      `  ${e.ts}  commit=${commit}  snap=${snap}  nodes=${e.node_count}  edges=${e.edge_count}  trigger=${e.trigger}`,
    );
  }
}

interface DiffOptions {
  cwd: string;
  sha1: string;
  sha2: string;
  json: boolean;
  limit: number;
}

function parseDiffArgs(args: string[]): DiffOptions {
  let cwd = process.cwd();
  let json = false;
  let limit = 10;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--limit" && i + 1 < args.length) {
      const raw = args[i + 1]!;
      if (!/^\d+$/.test(raw)) {
        console.error("hivemind graph diff: --limit must be a non-negative integer");
        process.exit(2);
      }
      limit = Number(raw);
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a !== undefined && !a.startsWith("--")) {
      positional.push(a);
    } else {
      console.error(`hivemind graph diff: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  if (positional.length !== 2) {
    console.error("hivemind graph diff: expected exactly two commit SHAs");
    console.error(USAGE);
    process.exit(2);
  }
  return { cwd, sha1: positional[0]!, sha2: positional[1]!, json, limit };
}

function runDiffCommand(args: string[]): void {
  const opts = parseDiffArgs(args);
  const { key: repoKey } = deriveProjectKey(opts.cwd);
  const baseDir = repoDir(repoKey);

  const from = loadSnapshotByCommit(baseDir, opts.sha1);
  if (from === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha1}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha1}.json`);
    console.error("  hint: run 'hivemind graph build' on the relevant commit, or check the commit sha");
    process.exit(1);
  }
  const to = loadSnapshotByCommit(baseDir, opts.sha2);
  if (to === null) {
    console.error(`hivemind graph diff: snapshot not found for ${opts.sha2}`);
    console.error(`  expected: ${baseDir}/snapshots/${opts.sha2}.json`);
    process.exit(1);
  }

  const diff = diffSnapshots(from, to);

  if (opts.json) {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  console.log(`Diff: ${opts.sha1} → ${opts.sha2}`);
  console.log("");
  printDiffHuman(diff, opts.limit);
}

interface BuildOptions {
  cwd: string;
  trigger: SnapshotTrigger;
}

function parseBuildArgs(args: string[]): BuildOptions {
  let cwd = process.cwd();
  let trigger: SnapshotTrigger = "manual";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "--trigger" && i + 1 < args.length) {
      const v = args[i + 1]!;
      if (v === "manual" || v === "session-end" || v === "post-commit" || v === "unknown") {
        trigger = v;
      } else {
        console.error(`hivemind graph build: --trigger must be one of manual|session-end|post-commit|unknown (got '${v}')`);
        process.exit(2);
      }
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph build: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd, trigger };
}

export async function runBuildCommand(args: string[]): Promise<void> {
  const opts = parseBuildArgs(args);
  // Resolve cwd to absolute once so every downstream consumer (repoKey,
  // worktreeId, worktree_path observation, the per-file `relative()` calls,
  // pushSnapshot / pullSnapshot) sees the same stable input. Without this,
  // invoking `--cwd ../repo` from two different directories produces two
  // different repo keys / worktree IDs for the same checkout. CodeRabbit
  // P1 fix; deriveProjectKey is also defensive at its boundary but normalizing
  // here keeps logged paths absolute too (worktree_path, output messages).
  const cwd = resolve(opts.cwd);

  const { key: repoKey, project } = deriveProjectKey(cwd);
  const baseDir = repoDir(repoKey);
  const commitSha = readGitCommit(cwd);
  const branch = readGitBranch(cwd);
  const version = getVersion();

  console.log(`Building codebase graph for ${project}`);
  console.log(`  repo_key:   ${repoKey}`);
  console.log(`  commit_sha: ${commitSha ?? "(not in a git repo)"}`);
  console.log(`  branch:     ${branch ?? "(none / detached)"}`);
  console.log(`  output:     ${baseDir}`);
  console.log("");

  const ignoreConfig = loadGraphIgnore();
  const sourceFiles = discoverSourceFiles(cwd, ignoreConfig);
  console.log(`Discovered ${sourceFiles.length} source files. Extracting...`);

  const extractions: FileExtraction[] = [];
  let skipped = 0;
  let totalParseErrors = 0;
  let cacheHits = 0;
  for (const abs of sourceFiles) {
    const rel = toForwardSlash(relative(cwd, abs));
    try {
      const content = readFileSync(abs, "utf8");
      // Per-file content-hash cache: same file content (regardless of path)
      // serves a previously-computed FileExtraction. Cache miss → extract +
      // populate. Cache write/read failures are swallowed (best-effort).
      const contentSha = fileContentHash(content);
      let extraction = readCache(baseDir, contentSha, rel);
      if (extraction === null) {
        extraction = extractFile(content, rel);
        writeCache(baseDir, contentSha, extraction);
      } else {
        cacheHits += 1;
      }
      if (extraction.parse_errors.length > 0) {
        totalParseErrors += extraction.parse_errors.length;
        for (const err of extraction.parse_errors) {
          console.warn(`  warn: parse issue in ${err.source_file} ${err.location ?? ""}: ${err.message}`);
        }
      }
      extractions.push(extraction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  warn: skipping ${rel}: ${msg}`);
      skipped += 1;
    }
  }

  const metadata: GraphMetadata = {
    schema_version: 1,
    generator: "hivemind-graph",
    commit_sha: commitSha,
    repo_key: repoKey,
  };
  const observation: GraphObservation = {
    ts: new Date().toISOString(),
    branch,
    worktree_path: cwd,
    repo_project: project,
    generator_version: version,
    source_files_extracted: extractions.length,
    source_files_skipped: skipped,
  };

  const snapshot = buildSnapshot(extractions, metadata, observation);
  // Pass worktreeId so writeSnapshot routes latest-commit.txt + .last-build.json
  // under baseDir/worktrees/<id>/ instead of clobbering another worktree's
  // singletons. Snapshots/cache/history stay shared at the repo level.
  const worktreeId = workTreeIdFor(cwd);
  const result = writeSnapshot(snapshot, baseDir, opts.trigger, worktreeId);

  console.log("");
  console.log(`Snapshot:      ${result.snapshotPath}`);
  console.log(`Latest:        ${result.latestCommitPath ?? "(no commit context — latest-commit.txt not updated)"}`);
  console.log(`SHA-256:       ${result.snapshotSha256}`);
  console.log(`Nodes:         ${snapshot.nodes.length}`);
  console.log(`Edges:         ${snapshot.links.length}`);
  console.log(`Files extracted: ${extractions.length} (skipped: ${skipped}, parse warnings: ${totalParseErrors}, cache hits: ${cacheHits}/${sourceFiles.length})`);

  // Phase 3: push to Deeplake `codebase` table. Best-effort — any failure
  // logs and returns; the local snapshot is the source of truth. Skips
  // silently when not authenticated (loadConfig returns null).
  // worktreeId already computed above for the writeSnapshot call.
  // Pass the resolved build cwd so `.hivemind` resolves against the target
  // tree (honors `--cwd`), not the process's invocation directory.
  const pushOutcome = await pushSnapshot(snapshot, worktreeId, { cwd });
  switch (pushOutcome.kind) {
    case "inserted":
      console.log(`Cloud:         pushed to codebase table (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "inserted-with-duplicate-race":
      console.warn(`Cloud:         pushed (commit ${pushOutcome.commitSha.slice(0, 7)}) but ${pushOutcome.rowCount} rows now share`);
      console.warn(`               this identity key — a concurrent writer raced. v1.1 adds a server-side`);
      console.warn(`               UNIQUE constraint; until then, the older row(s) should be deleted manually.`);
      break;
    case "already-current":
      console.log(`Cloud:         already up-to-date (commit ${pushOutcome.commitSha.slice(0, 7)})`);
      break;
    case "skipped-no-auth":
      console.log(`Cloud:         skipped (not authenticated; run \`hivemind login\` to enable cloud sync)`);
      break;
    case "skipped-no-commit":
      console.log(`Cloud:         skipped (no commit context — not in a git repo)`);
      break;
    case "skipped-disabled":
      console.log(`Cloud:         skipped (HIVEMIND_GRAPH_PUSH=0)`);
      break;
    case "skipped-collect-disabled":
      console.log(`Cloud:         skipped (.hivemind collect:false for this directory)`);
      break;
    case "drift":
      console.warn(`Cloud:         DRIFT — commit ${pushOutcome.commitSha.slice(0, 7)} is in cloud with`);
      console.warn(`               sha256=${pushOutcome.cloudSha256.slice(0, 12)}... but local rebuild produced`);
      console.warn(`               sha256=${pushOutcome.localSha256.slice(0, 12)}...`);
      console.warn(`               (probably extractor version drift; investigate before forcing.)`);
      break;
    case "error":
      console.warn(`Cloud:         push error (non-fatal): ${pushOutcome.message}`);
      break;
  }

  // Step 8: after the snapshot is fresh on disk, refresh docs IF the user
  // opted this (org, repo) in via the CLI registry (`docs auto on` or the
  // graph-init onboarding). Detached, best-effort — never blocks the build.
  const autoCfg = loadConfig();
  if (autoCfg && maybeSpawnDocsRefresh(cwd, { orgId: autoCfg.orgId, project: deriveProjectKey(cwd).key })) {
    console.log("Docs:          spawned auto sync (enabled for this repo — `hivemind docs list`)");
  }
}

// ─── pull subcommand ───────────────────────────────────────────────────────

interface PullOptions {
  cwd: string;
}

function parsePullArgs(args: string[]): PullOptions {
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1]!;
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`hivemind graph pull: unknown argument '${a}'`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { cwd };
}

export async function runPullCommand(args: string[]): Promise<void> {
  const opts = parsePullArgs(args);
  const outcome = await pullSnapshot(opts.cwd);
  switch (outcome.kind) {
    case "pulled":
      console.log(`Pulled commit ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  sha256:  ${outcome.snapshotSha256.slice(0, 12)}...`);
      console.log(`  bytes:   ${outcome.bytes}`);
      // CodeRabbit Minor: `sourceWorktreePath` is the cloud row's `worktree_id`
      // column (a 16-char sha256 hex, NOT a filesystem path). Print the FULL
      // value so the user can correlate cloud rows by id; truncating it was
      // misleading (also worktree_id is already short — no truncation needed).
      console.log(`  origin:  worktree_id=${outcome.sourceWorktreePath}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "up-to-date":
      console.log(`Already up-to-date (commit ${outcome.commitSha.slice(0, 7)}, sha256 ${outcome.snapshotSha256.slice(0, 12)}...)`);
      break;
    case "local-newer":
      console.log(`Local is newer than cloud — not pulling.`);
      console.log(`  commit:   ${outcome.commitSha.slice(0, 7)}`);
      console.log(`  local ts: ${new Date(outcome.localTs).toISOString()}`);
      console.log(`  cloud ts: ${new Date(outcome.cloudTs).toISOString()}`);
      break;
    case "no-cloud-row":
      console.log(`No cloud snapshot for commit ${outcome.commitSha.slice(0, 7)} — run \`hivemind graph build\` to create one.`);
      break;
    case "skipped-no-auth":
      console.log(`Skipped: not authenticated (run \`hivemind login\`).`);
      break;
    case "skipped-disabled":
      console.log(`Skipped: HIVEMIND_GRAPH_PULL=0.`);
      break;
    case "skipped-no-head":
      console.log(`Skipped: not in a git repo (\`git rev-parse HEAD\` failed).`);
      break;
    case "error":
      console.warn(`Pull error (non-fatal): ${outcome.message}`);
      process.exitCode = 1;
      break;
  }
}

/**
 * Stable per-worktree identifier — sha256 of the absolute path, truncated to
 * 16 chars. Distinguishes two clones of the same repo on the same machine
 * (e.g., main checkout + git worktree for a feature branch). NOT cross-machine
 * stable; pair with user_id in the cloud PK to keep rows distinct across machines.
 */
function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

// ─── Source-file discovery ─────────────────────────────────────────────────

function discoverSourceFiles(rootDir: string, config: GraphIgnoreConfig): string[] {
  const ignore = ignoreDirSet(config);
  // Preferred path: let git's own ignore engine (.gitignore, nested rules,
  // .git/info/exclude, anchoring) decide what's in-repo, then drop anything
  // under an ignored dir name as a safety net for tracked junk.
  if (config.respectGitignore) {
    const fromGit = gitListSourceFiles(rootDir, ignore);
    if (fromGit !== null) return fromGit;
  }
  // Fallback (non-git repo, or git unavailable): manual walk with name-based ignores.
  const out: string[] = [];
  walk(rootDir, out, ignore);
  out.sort(); // deterministic order across runs (FS readdir order isn't guaranteed)
  return out;
}

/**
 * List in-repo source files via `git ls-files --cached --others --exclude-standard`
 * (tracked + untracked-not-ignored, honoring .gitignore EXACTLY — anchoring and
 * nested rules included). Returns absolute paths, or null when this isn't a
 * usable git repo (caller falls back to walk()). The ignore-name set is still
 * applied as a safety net for directories the repo happens to track.
 */
function gitListSourceFiles(rootDir: string, ignore: Set<string>): string[] | null {
  let stdout: string;
  try {
    stdout = execSync("git ls-files --cached --others --exclude-standard -z", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null; // not a git repo / git unavailable
  }
  const out: string[] = [];
  for (const rel of stdout.split("\0")) {
    if (rel.length === 0) continue;
    if (!isSourceFile(rel)) continue;
    if (pathHasIgnoredSegment(rel, ignore)) continue;
    out.push(join(rootDir, rel));
  }
  out.sort();
  return out;
}

function walk(dir: string, out: string[], ignore: Set<string>): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dirs (permissions, races) are skipped silently
  }
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    // Skip dotfiles/dotdirs except the dir itself (rare edge — we entered via name, not '.')
    if (entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out, ignore);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      out.push(abs);
    }
  }
}

function isSourceFile(name: string): boolean {
  if (name.endsWith(".d.ts")) return false; // declarations only, no implementation
  return /\.(tsx?|jsx?|mjs|cjs|pyi?|go|rs|java|rb|cpp|cc|cxx|hpp|[ch])$/.test(name.toLowerCase());
}

function toForwardSlash(p: string): string {
  return sep === "\\" ? p.replace(/\\/g, "/") : p;
}

// ─── Git context ───────────────────────────────────────────────────────────

function readGitCommit(cwd: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readGitBranch(cwd: string): string | null {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // Detached HEAD prints literally "HEAD" — surface as null so consumers
    // (and the observation field) clearly distinguish "no current branch"
    // from any real branch name.
    return out === "" || out === "HEAD" ? null : out;
  } catch {
    return null;
  }
}
