#!/usr/bin/env node

/**
 * Codex PreToolUse hook — intercepts Bash commands targeting ~/.deeplake/memory/.
 *
 * Strategy: "block + inject"
 * Codex does not parse JSON hook output here, so the CLI wrapper still maps:
 * - action=pass  -> exit 0, no output
 * - action=guide -> stdout guidance, exit 0
 * - action=block -> stderr content, exit 2
 *
 * The source logic is exported so tests can exercise it directly without
 * spawning the bundled script in a subprocess.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readStdin } from "../../utils/stdin.js";
import { loadConfig } from "../../config.js";
import { DeeplakeApi } from "../../deeplake-api.js";
import { sqlIdent, sqlLike } from "../../utils/sql.js";
import { parseBashGrep, handleGrepDirect } from "../grep-direct.js";
import { tryGraphRead } from "../../graph/graph-command.js";
import { executeCompiledBashCommand } from "../bash-command-compiler.js";
import {
  findVirtualPaths,
  readVirtualPathContents,
  listVirtualPathRows,
  readVirtualPathContent,
} from "../virtual-table-query.js";
import {
  readCachedIndexContent,
  writeCachedIndexContent,
} from "../query-cache.js";
import { log as _log } from "../../utils/debug.js";
import { isDirectRun } from "../../utils/direct-run.js";
import { isSafe, touchesMemory, rewritePaths } from "../memory-path-utils.js";
import { armSkillOptOnSkillUse } from "../shared/skillopt-hook.js";

export { isSafe, touchesMemory, rewritePaths };

const __bundleDir = dirname(fileURLToPath(import.meta.url));

const log = (msg: string) => _log("codex-pre", msg);

export interface CodexPreToolUseInput {
  session_id: string;
  tool_name: string;
  tool_use_id: string;
  tool_input: { command: string };
  cwd: string;
  hook_event_name: string;
  model: string;
  turn_id?: string;
}

export interface CodexPreToolDecision {
  action: "pass" | "guide" | "block";
  output?: string;
  rewrittenCommand?: string;
}

export function buildUnsupportedGuidance(): string {
  return "This command is not supported for ~/.deeplake/memory/ operations. " +
    "Only bash builtins are available: cat, ls, grep, echo, jq, head, tail, wc, sort, find, etc. " +
    "Do NOT use python, python3, node, curl, or other interpreters. " +
    "Rewrite your command using only bash tools and retry.";
}

function buildIndexContent(rows: Record<string, unknown>[]): string {
  const lines = ["# Memory Index", "", `${rows.length} sessions:`, ""];
  for (const row of rows) {
    const path = row["path"] as string;
    const project = row["project"] as string || "";
    const description = (row["description"] as string || "").slice(0, 120);
    const date = (row["creation_date"] as string || "").slice(0, 10);
    lines.push(`- [${path}](${path}) ${date} ${project ? `[${project}]` : ""} ${description}`);
  }
  return lines.join("\n");
}

interface CodexPreToolDeps {
  config?: ReturnType<typeof loadConfig>;
  createApi?: (table: string, config: NonNullable<ReturnType<typeof loadConfig>>) => DeeplakeApi;
  executeCompiledBashCommandFn?: typeof executeCompiledBashCommand;
  readVirtualPathContentsFn?: typeof readVirtualPathContents;
  readVirtualPathContentFn?: typeof readVirtualPathContent;
  listVirtualPathRowsFn?: typeof listVirtualPathRows;
  findVirtualPathsFn?: typeof findVirtualPaths;
  handleGrepDirectFn?: typeof handleGrepDirect;
  readCachedIndexContentFn?: typeof readCachedIndexContent;
  writeCachedIndexContentFn?: typeof writeCachedIndexContent;
  logFn?: (msg: string) => void;
}

export async function processCodexPreToolUse(
  input: CodexPreToolUseInput,
  deps: CodexPreToolDeps = {},
): Promise<CodexPreToolDecision> {
  const {
    config = loadConfig(),
    createApi = (table, activeConfig) => new DeeplakeApi(
      activeConfig.token,
      activeConfig.apiUrl,
      activeConfig.orgId,
      activeConfig.workspaceId,
      table,
    ),
    executeCompiledBashCommandFn = executeCompiledBashCommand,
    readVirtualPathContentsFn = readVirtualPathContents,
    readVirtualPathContentFn = readVirtualPathContent,
    listVirtualPathRowsFn = listVirtualPathRows,
    findVirtualPathsFn = findVirtualPaths,
    handleGrepDirectFn = handleGrepDirect,
    readCachedIndexContentFn = readCachedIndexContent,
    writeCachedIndexContentFn = writeCachedIndexContent,
    logFn = log,
  } = deps;

  const cmd = input.tool_input?.command ?? "";
  logFn(`hook fired: cmd=${cmd}`);

  if (!touchesMemory(cmd)) return { action: "pass" };

  const rewritten = rewritePaths(cmd);

  // Graph VFS dispatch — a cat/head/tail/ls on the `/graph/*` subtree is
  // answered from the local snapshot, no SQL, no config needed. Runs before
  // the isSafe/grep/shell handling. Shared parser: src/graph/graph-command.ts.
  const graphBody = tryGraphRead(rewritten, input.cwd ?? process.cwd());
  if (graphBody !== null) {
    logFn(`graph vfs intercept: ${rewritten}`);
    return { action: "block", output: graphBody, rewrittenCommand: rewritten };
  }

  if (!isSafe(rewritten)) {
    // BLOCK (exit 2), not "guide" (exit 0). guide lets Codex run the original
    // command on the host, so an unsafe memory command — `python … x.py`,
    // backticks, `$()`, `curl` — would still execute and could read/run real
    // files. Block stops it and injects the guidance instead.
    logFn(`unsupported command, blocking with guidance: ${rewritten}`);
    return {
      action: "block",
      output: buildUnsupportedGuidance(),
      rewrittenCommand: rewritten,
    };
  }

  if (config) {
    const table = process.env["HIVEMIND_TABLE"] ?? "memory";
    const sessionsTable = process.env["HIVEMIND_SESSIONS_TABLE"] ?? "sessions";
    const api = createApi(table, config);

    const readVirtualPathContentsWithCache = async (
      cachePaths: string[],
    ): Promise<Map<string, string | null>> => {
      const uniquePaths = [...new Set(cachePaths)];
      const result = new Map<string, string | null>(uniquePaths.map((path) => [path, null]));
      const cachedIndex = uniquePaths.includes("/index.md")
        ? readCachedIndexContentFn(input.session_id)
        : null;

      const remainingPaths = cachedIndex === null
        ? uniquePaths
        : uniquePaths.filter((path) => path !== "/index.md");

      if (cachedIndex !== null) {
        result.set("/index.md", cachedIndex);
      }

      if (remainingPaths.length > 0) {
        const fetched = await readVirtualPathContentsFn(api, table, sessionsTable, remainingPaths);
        for (const [path, content] of fetched) result.set(path, content);
      }

      const fetchedIndex = result.get("/index.md");
      if (typeof fetchedIndex === "string") {
        writeCachedIndexContentFn(input.session_id, fetchedIndex);
      }

      return result;
    };

    try {
      const compiled = await executeCompiledBashCommandFn(api, table, sessionsTable, rewritten, {
        readVirtualPathContentsFn: async (_api, _memoryTable, _sessionsTable, cachePaths) => readVirtualPathContentsWithCache(cachePaths),
      });
      if (compiled !== null) {
        return { action: "block", output: compiled, rewrittenCommand: rewritten };
      }

      let virtualPath: string | null = null;
      let lineLimit = 0;
      let fromEnd = false;

      const catCmd = rewritten.replace(/\s+2>\S+/g, "").trim();
      const catPipeHead = catCmd.match(/^cat\s+(\S+?)\s*(?:\|[^|]*)*\|\s*head\s+(?:-n?\s*)?(-?\d+)\s*$/);
      if (catPipeHead) {
        virtualPath = catPipeHead[1];
        lineLimit = Math.abs(parseInt(catPipeHead[2], 10));
      }
      if (!virtualPath) {
        const catMatch = catCmd.match(/^cat\s+(\S+)\s*$/);
        if (catMatch) virtualPath = catMatch[1];
      }
      if (!virtualPath) {
        const headMatch = rewritten.match(/^head\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/)
          ?? rewritten.match(/^head\s+(\S+)\s*$/);
        if (headMatch) {
          if (headMatch[2]) {
            virtualPath = headMatch[2];
            lineLimit = Math.abs(parseInt(headMatch[1], 10));
          } else {
            virtualPath = headMatch[1];
            lineLimit = 10;
          }
        }
      }
      if (!virtualPath) {
        const tailMatch = rewritten.match(/^tail\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/)
          ?? rewritten.match(/^tail\s+(\S+)\s*$/);
        if (tailMatch) {
          fromEnd = true;
          if (tailMatch[2]) {
            virtualPath = tailMatch[2];
            lineLimit = Math.abs(parseInt(tailMatch[1], 10));
          } else {
            virtualPath = tailMatch[1];
            lineLimit = 10;
          }
        }
      }
      if (!virtualPath) {
        const wcMatch = rewritten.match(/^wc\s+-l\s+(\S+)\s*$/);
        if (wcMatch) {
          virtualPath = wcMatch[1];
          lineLimit = -1;
        }
      }

      if (virtualPath && !virtualPath.endsWith("/")) {
        logFn(`direct read: ${virtualPath}`);
        let content = virtualPath === "/index.md"
          ? readCachedIndexContentFn(input.session_id)
          : null;
        if (content === null) {
          content = await readVirtualPathContentFn(api, table, sessionsTable, virtualPath);
        }
        if (content === null && virtualPath === "/index.md") {
          const idxRows = await api.query(
            `SELECT path, project, description, creation_date FROM "${sqlIdent(table)}" WHERE path LIKE '/summaries/%' ORDER BY creation_date DESC`
          );
          content = buildIndexContent(idxRows);
        }

        if (content !== null) {
          if (virtualPath === "/index.md") {
            writeCachedIndexContentFn(input.session_id, content);
          }
          if (lineLimit === -1) {
            return { action: "block", output: `${content.split("\n").length} ${virtualPath}`, rewrittenCommand: rewritten };
          }
          if (lineLimit > 0) {
            const lines = content.split("\n");
            content = fromEnd
              ? lines.slice(-lineLimit).join("\n")
              : lines.slice(0, lineLimit).join("\n");
          }
          return { action: "block", output: content, rewrittenCommand: rewritten };
        }
        // Concrete file path with no VFS row → "not found", not an unsupported
        // command. Returning the generic guidance would mislead the model into
        // rewriting an already-valid `cat`/`head`/… shape.
        logFn(`virtual path not found: ${virtualPath}`);
        return { action: "block", output: `${virtualPath}: No such file or directory`, rewrittenCommand: rewritten };
      }

      const lsMatch = rewritten.match(/^ls\s+(?:-[a-zA-Z]+\s+)*(\S+)?\s*$/);
      if (lsMatch) {
        const dir = (lsMatch[1] ?? "/").replace(/\/+$/, "") || "/";
        const isLong = /\s-[a-zA-Z]*l/.test(rewritten);
        logFn(`direct ls: ${dir}`);
        const rows = await listVirtualPathRowsFn(api, table, sessionsTable, dir);
        const entries = new Map<string, { isDir: boolean; size: number }>();
        const prefix = dir === "/" ? "/" : `${dir}/`;
        for (const row of rows) {
          const path = row["path"] as string;
          if (!path.startsWith(prefix) && dir !== "/") continue;
          const rest = dir === "/" ? path.slice(1) : path.slice(prefix.length);
          const slash = rest.indexOf("/");
          const name = slash === -1 ? rest : rest.slice(0, slash);
          if (!name) continue;
          const existing = entries.get(name);
          if (slash !== -1) {
            if (!existing) entries.set(name, { isDir: true, size: 0 });
          } else {
            entries.set(name, { isDir: false, size: (row["size_bytes"] as number) ?? 0 });
          }
        }

        if (entries.size > 0) {
          const lines: string[] = [];
          for (const [name, info] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
            if (isLong) {
              const type = info.isDir ? "drwxr-xr-x" : "-rw-r--r--";
              const size = info.isDir ? "0" : String(info.size).padStart(6);
              lines.push(`${type} 1 user user ${size} ${name}${info.isDir ? "/" : ""}`);
            } else {
              lines.push(name + (info.isDir ? "/" : ""));
            }
          }
          return { action: "block", output: lines.join("\n"), rewrittenCommand: rewritten };
        }

        return {
          action: "block",
          output: `ls: cannot access '${dir}': No such file or directory`,
          rewrittenCommand: rewritten,
        };
      }

      // Anchor to the exact shape the VFS serves (optionally piped to wc -l);
      // a prefix match would accept `find … -name '*.md' -delete` and silently
      // drop the suffix. Everything else falls through to block+guidance.
      // No `-type` clause: the VFS find handler can't enforce a type filter, so
      // accepting `-type d` and ignoring it would return wrong results. Such
      // commands fall through to block+guidance instead.
      const findMatch = rewritten.match(/^find\s+(\S+)\s+-name\s+(?:'([^']+)'|"([^"]+)"|([^\s|]+))\s*(?:\|\s*wc\s+-l)?\s*$/);
      if (findMatch) {
        const dir = findMatch[1].replace(/\/+$/, "") || "/";
        const rawPattern = findMatch[2] ?? findMatch[3] ?? findMatch[4] ?? "";
        const namePattern = sqlLike(rawPattern).replace(/\*/g, "%").replace(/\?/g, "_");
        logFn(`direct find: ${dir} -name '${rawPattern}'`);
        const paths = await findVirtualPathsFn(api, table, sessionsTable, dir, namePattern);
        let result = paths.join("\n") || "";
        if (/\|\s*wc\s+-l\s*$/.test(rewritten)) result = String(paths.length);
        return {
          action: "block",
          output: result || "(no matches)",
          rewrittenCommand: rewritten,
        };
      }

      const grepParams = parseBashGrep(rewritten);
      if (grepParams) {
        logFn(`direct grep: pattern=${grepParams.pattern} path=${grepParams.targetPath}`);
        const result = await handleGrepDirectFn(api, table, sessionsTable, grepParams);
        if (result !== null) {
          return { action: "block", output: result, rewrittenCommand: rewritten };
        }
      }
    } catch (e: any) {
      logFn(`direct query failed: ${e.message}`);
    }
  }

  // Nothing matched by the inline fast-path. Route through the VFS shell bundle
  // — a sandboxed Node.js interpreter against the SQL backend, no host access.
  // We run it synchronously here (spawnSync) so the output is available before
  // returning the decision.
  //
  // Always return "block" (exit 2) after the VFS shell executes the command.
  // Returning "guide" (exit 0) would cause Codex to also run the original on
  // the real host shell, violating VFS isolation - memory-touching commands
  // must never reach the host shell regardless of whether they are write
  // redirects or reads.
  const shellBundle = join(__bundleDir, "shell", "deeplake-shell.js");
  logFn(`unroutable memory command, falling back to VFS shell: ${rewritten}`);
  try {
    const proc = spawnSync("node", [shellBundle, "-c", rewritten], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (proc.status === 0 || (proc.stdout && proc.stdout.trim())) {
      const output = (proc.stdout?.trim() ?? "") || "(done)";
      return { action: "block", output, rewrittenCommand: rewritten };
    }
    // Shell exited non-zero (bundle missing or command failed) — fall back to guidance.
    return { action: "block", output: buildUnsupportedGuidance(), rewrittenCommand: rewritten };
  } catch {
    return { action: "block", output: buildUnsupportedGuidance(), rewrittenCommand: rewritten };
  }
}

/* c8 ignore start */
async function main(): Promise<void> {
  const input = await readStdin<CodexPreToolUseInput>();
  // SkillOpt: codex USES an org skill by shelling a read of its SKILL.md — arm the judgment
  // window on that command. Guarded at the call site too (armSkillOptOnSkillUse is already
  // internally swallowed): a throw here must NOT short-circuit the memory-path gate below, whose
  // top-level catch exits 0 (fail-open). Fail-closed for the SkillOpt side-effect.
  try { armSkillOptOnSkillUse(input.session_id, input.tool_name, input.tool_input, input.tool_use_id); }
  catch { /* never let the SkillOpt arm affect the tool decision */ }
  const decision = await processCodexPreToolUse(input);

  if (decision.action === "pass") return;
  if (decision.action === "guide") {
    if (decision.output) process.stdout.write(decision.output);
    process.exit(0);
  }
  if (decision.output) process.stderr.write(decision.output);
  process.exit(2);
}

if (isDirectRun(import.meta.url)) {
  main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
}
/* c8 ignore stop */
