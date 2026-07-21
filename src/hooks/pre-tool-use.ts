#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { deriveProjectKey } from "../utils/repo-identity.js";
import { homedir } from "node:os";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin } from "../utils/stdin.js";
import { loadConfig } from "../config.js";
import { resolveDirConfig } from "../dir-config.js";
import { armSkillOptOnSkillUse } from "./shared/skillopt-hook.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlLike } from "../utils/sql.js";
import { log as _log } from "../utils/debug.js";
import { isDirectRun } from "../utils/direct-run.js";
import { type GrepParams, parseBashGrep, handleGrepDirect } from "./grep-direct.js";
import { handleGraphVfs } from "../graph/vfs-handler.js";
import { handleDocsVfs } from "../docs/vfs-handler.js";
import { makeQueryEmbedder } from "../docs/embed.js";
import { defaultGit } from "../docs/candidates.js";
import { currentScope } from "../docs/branch-scope.js";
import { executeCompiledBashCommand } from "./bash-command-compiler.js";
import {
  findVirtualPaths,
  readVirtualPathContents,
  listVirtualPathRows,
  readVirtualPathContent,
} from "./virtual-table-query.js";
import {
  readCachedIndexContent,
  writeCachedIndexContent,
} from "./query-cache.js";
import { isSafe, touchesMemory, rewritePaths, bashTouchesMemory } from "./memory-path-utils.js";
import { capOutputForClaude } from "../utils/output-cap.js";
import { ensureSessionOwner } from "./summary-state.js";

export { isSafe, touchesMemory, rewritePaths };

const log = (msg: string) => _log("pre", msg);

const __bundleDir = dirname(fileURLToPath(import.meta.url));

export interface PreToolUseInput {
  /** Session working directory (present in the hook payload). */
  cwd?: string;
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface ClaudePreToolDecision {
  command: string;
  description: string;
  /**
   * When set, main() emits the hook response as `updatedInput: {file_path}`
   * instead of `updatedInput: {command, description}`. This is required for
   * Read-tool intercepts: Claude Code's Read implementation reads
   * `updatedInput.file_path` and errors with "path must be of type string,
   * got undefined" if the hook hands it the Bash-shaped input.
   */
  file_path?: string;
  /**
   * When set, main() emits a `permissionDecision: "deny"` response carrying
   * this reason. Used for tools the VFS cannot route (Write / Edit) so the
   * agent sees a clear "use Bash instead" message rather than a cryptic
   * "Path must be a string, received undefined" from a shape mismatch.
   */
  deny?: string;
}

const READ_CACHE_ROOT = join(homedir(), ".deeplake", "query-cache");

/**
 * Materialize fetched content for a Read intercept into a real file on disk
 * so Claude Code's Read tool can read it via `updatedInput.file_path`. The
 * file lives under `~/.deeplake/query-cache/<session_id>/read/` and mirrors
 * the virtual path structure (e.g. `/sessions/conv_0_session_1.json` →
 * `.../read/sessions/conv_0_session_1.json`). Per-session dirs are cleaned
 * alongside the index cache at session end.
 */
export function writeReadCacheFile(
  sessionId: string,
  virtualPath: string,
  content: string,
  deps: { cacheRoot?: string } = {},
): string {
  const { cacheRoot = READ_CACHE_ROOT } = deps;
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  const rel = virtualPath.replace(/^\/+/, "") || "content";
  const expectedRoot = join(cacheRoot, safeSessionId, "read");
  const absPath = join(expectedRoot, rel);
  // Containment guard: if the DB-derived virtualPath contains `..` segments,
  // `join` resolves them and absPath can escape the per-session cache dir.
  // Refuse the write rather than silently writing outside the sandbox.
  if (absPath !== expectedRoot && !absPath.startsWith(expectedRoot + sep)) {
    throw new Error(`writeReadCacheFile: path escapes cache root: ${absPath}`);
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf-8");
  return absPath;
}

export function buildReadDecision(file_path: string, description: string): ClaudePreToolDecision {
  return { command: "", description, file_path };
}

export function buildDenyDecision(reason: string, description: string): ClaudePreToolDecision {
  return { command: "", description, deny: reason };
}

const MEMORY_RETRY_GUIDANCE =
  "[RETRY REQUIRED] The command you tried is not available for ~/.deeplake/memory/. " +
  "This virtual filesystem only supports bash builtins: cat, ls, grep, echo, jq, head, tail, wc, sort, find, etc. " +
  "python, python3, node, and curl are NOT available. " +
  "You MUST rewrite your command using only the bash tools listed above and try again. " +
  "For example, to parse JSON use: cat file.json | jq '.key'. To count keys: cat file.json | jq 'keys | length'.";

// Send an unserviceable memory request back to the agent as retry guidance,
// shaped per tool so the original never reaches the host shell.
//   - Bash/Grep/Glob: an *allow* decision that REWRITES the command to a
//     harmless `echo`, so e.g. `sort /etc/passwd ~/.deeplake/memory/x >
//     /tmp/out` is replaced before it can run.
//   - Read: a *deny*. Claude Code's Read tool reads `updatedInput.file_path`;
//     handing it a `{command}` payload leaves file_path undefined and the
//     harness errors with "Path must be a string". Deny is shape-safe and
//     still tells the agent how to retry via Bash.
function buildRetryGuidanceDecision(toolName: string): ClaudePreToolDecision {
  if (toolName === "Read") {
    return buildDenyDecision(MEMORY_RETRY_GUIDANCE, "[DeepLake] memory Read unavailable — use Bash builtins");
  }
  return buildAllowDecision(
    `echo ${JSON.stringify(MEMORY_RETRY_GUIDANCE)}`,
    "[DeepLake] unsupported command — rewrite using bash builtins",
  );
}

const WRITE_EDIT_DENY_REASON =
  "Write and Edit tools cannot route through the Deeplake VFS at ~/.deeplake/memory/. " +
  "The pre-tool-use hook only intercepts Bash, Read, Grep, and Glob; tool-shape mismatches make a " +
  "Write/Edit rewrite unsafe. Use the Bash tool instead:\n" +
  "  - Single-line:  echo '<content>' > '<path>'\n" +
  "  - Multi-line:   cat > '<path>' <<'EOF'\\n<content>\\nEOF\n" +
  "Bash IS intercepted and writes through to the team-shared SQL backend.";

function getReadTargetPath(toolInput: Record<string, unknown>): string | null {
  const rawPath = (toolInput.file_path ?? toolInput.path) as string | undefined;
  return rawPath ? rawPath : null;
}

function isLikelyDirectoryPath(virtualPath: string): boolean {
  const normalized = virtualPath.replace(/\/+$/, "") || "/";
  if (normalized === "/") return true;
  const base = normalized.split("/").pop() ?? "";
  return !base.includes(".");
}

export function getShellCommand(toolName: string, toolInput: Record<string, unknown>): string | null {
  switch (toolName) {
    case "Grep": {
      const p = toolInput.path as string | undefined;
      if (p && touchesMemory(p)) {
        const pattern = toolInput.pattern as string ?? "";
        const flags: string[] = ["-r"];
        if (toolInput["-i"]) flags.push("-i");
        if (toolInput["-n"]) flags.push("-n");
        // Single-quote the pattern safely: escape any embedded single quotes
        // so the string can never break out of the shell quoting context if
        // this command string is ever forwarded to a shell executor.
        const escaped = pattern.replace(/'/g, "'\\''");
        return `grep ${flags.join(" ")} '${escaped}' /`;
      }
      break;
    }
    case "Read": {
      const fp = getReadTargetPath(toolInput);
      if (fp && touchesMemory(fp)) {
        const rewritten = rewritePaths(fp) || "/";
        return `${isLikelyDirectoryPath(rewritten) ? "ls" : "cat"} ${rewritten}`;
      }
      break;
    }
    case "Bash": {
      const cmd = toolInput.command as string | undefined;
      if (!cmd || !bashTouchesMemory(cmd)) break;
      const rewritten = rewritePaths(cmd);
      if (!isSafe(rewritten)) {
        log(`unsafe command blocked: ${rewritten}`);
        return null;
      }
      return rewritten;
    }
    case "Glob": {
      const p = toolInput.path as string | undefined;
      if (p && touchesMemory(p)) return "ls /";
      break;
    }
  }
  return null;
}

export function buildAllowDecision(command: string, description: string): ClaudePreToolDecision {
  return { command, description };
}

/**
 * Build a shell command that emits `body` VERBATIM. We previously echoed the
 * JSON-stringified body, but JSON.stringify only escapes `"` and `\` —
 * NOT backticks or `$`. Inside a double-quoted echo the shell still performs
 * command substitution (`` `find/` `` → runs `find/`) and variable expansion,
 * which corrupted bodies containing backticks/$ (e.g. the graph index.md help
 * text, or a memory summary with code) and leaked `find/: No such file` to
 * stderr. JSON.stringify also turned real newlines into the 2-char `\n`, which
 * bash's `echo` prints literally.
 *
 * Fix: single-quote the body so the shell treats it fully literally — no
 * substitution, no expansion, real newlines preserved. The only character that
 * needs escaping inside single quotes is `'` itself, encoded as `'\''` (close
 * quote, an escaped literal quote, reopen quote). `printf '%s\n'` prints the
 * single argument exactly (a `%` in the body is harmless — it's the argument,
 * not the format).
 */
export function safeEchoCommand(body: string): string {
  const escaped = body.replace(/'/g, `'\\''`);
  return `printf '%s\\n' '${escaped}'`;
}

export function extractGrepParams(
  toolName: string,
  toolInput: Record<string, unknown>,
  shellCmd: string,
): GrepParams | null {
  if (toolName === "Grep") {
    const outputMode = (toolInput.output_mode as string) ?? "files_with_matches";
    return {
      pattern: (toolInput.pattern as string) ?? "",
      targetPath: rewritePaths((toolInput.path as string) ?? "") || "/",
      ignoreCase: !!toolInput["-i"],
      wordMatch: false,
      filesOnly: outputMode === "files_with_matches",
      countOnly: outputMode === "count",
      lineNumber: !!toolInput["-n"],
      invertMatch: false,
      fixedString: false,
    };
  }
  if (toolName === "Bash") return parseBashGrep(shellCmd);
  return null;
}

interface ClaudePreToolDeps {
  config?: ReturnType<typeof loadConfig>;
  createApi?: (table: string, config: NonNullable<ReturnType<typeof loadConfig>>) => DeeplakeApi;
  executeCompiledBashCommandFn?: typeof executeCompiledBashCommand;
  handleGrepDirectFn?: typeof handleGrepDirect;
  handleGraphVfsFn?: typeof handleGraphVfs;
  handleDocsVfsFn?: typeof handleDocsVfs;
  readVirtualPathContentsFn?: typeof readVirtualPathContents;
  readVirtualPathContentFn?: typeof readVirtualPathContent;
  listVirtualPathRowsFn?: typeof listVirtualPathRows;
  findVirtualPathsFn?: typeof findVirtualPaths;
  readCachedIndexContentFn?: typeof readCachedIndexContent;
  writeCachedIndexContentFn?: typeof writeCachedIndexContent;
  writeReadCacheFileFn?: typeof writeReadCacheFile;
  logFn?: (msg: string) => void;
}

export async function processPreToolUse(input: PreToolUseInput, deps: ClaudePreToolDeps = {}): Promise<ClaudePreToolDecision | null> {
  const {
    config: baseConfig = loadConfig(),
    createApi = (table, activeConfig) => new DeeplakeApi(
      activeConfig.token,
      activeConfig.apiUrl,
      activeConfig.orgId,
      activeConfig.workspaceId,
      table,
    ),
    executeCompiledBashCommandFn = executeCompiledBashCommand,
    handleGrepDirectFn = handleGrepDirect,
    handleGraphVfsFn = handleGraphVfs,
    handleDocsVfsFn = handleDocsVfs,
    readVirtualPathContentsFn = readVirtualPathContents,
    readVirtualPathContentFn = readVirtualPathContent,
    listVirtualPathRowsFn = listVirtualPathRows,
    findVirtualPathsFn = findVirtualPaths,
    readCachedIndexContentFn = readCachedIndexContent,
    writeCachedIndexContentFn = writeCachedIndexContent,
    writeReadCacheFileFn = writeReadCacheFile,
    logFn = log,
  } = deps;

  // SkillOpt: arm this session if it invoked an ORG skill (swallowed; never blocks tools).
  armSkillOptOnSkillUse(input.session_id, input.tool_name, input.tool_input, input.tool_use_id);

  const cmd = (input.tool_input.command as string) ?? "";
  const shellCmd = getShellCommand(input.tool_name, input.tool_input);
  const toolPath = (getReadTargetPath(input.tool_input) ?? input.tool_input.path ?? "") as string;

  // Write / Edit on memory paths cannot be safely rewritten: the hook can only
  // mutate tool_input, not the tool itself, so emitting a Bash-shaped decision
  // (command/description) leaves the Write tool with file_path=undefined → the
  // harness errors out with "Path must be a string, received undefined". Deny
  // with a clear message pointing at Bash instead — Bash IS intercepted and
  // routes through the SQL backend.
  if ((input.tool_name === "Write" || input.tool_name === "Edit") && touchesMemory(toolPath)) {
    logFn(`deny Write/Edit on memory path: ${toolPath}`);
    return buildDenyDecision(WRITE_EDIT_DENY_REASON, `[DeepLake] ${input.tool_name} denied on memory path`);
  }

  if (!shellCmd && (bashTouchesMemory(cmd) || touchesMemory(toolPath))) {
    // Unsupported/unsafe command targeting memory (interpreter, $(), pipes,
    // chains, …). Do NOT rewrite it to a host `cat`: that decision runs on the
    // real filesystem, not the VFS, so `python3 ~/.deeplake/memory/../../etc/passwd`
    // would become `cat '/../../etc/passwd'` and read a real host file. Return
    // guidance; the agent reissues a supported builtin (e.g. `cat …`) which IS
    // routed through the VFS.
    logFn(`unsupported command, returning guidance: ${cmd}`);
    return buildRetryGuidanceDecision(input.tool_name);
  }

  if (!shellCmd) return null;
  // A memory command we could rewrite, but with no config the VFS backend is
  // unreachable. Do NOT return null here — that hands the original command to
  // the host shell. Return the retry guidance instead so the command never
  // touches the real filesystem.
  if (!baseConfig) return buildRetryGuidanceDecision(input.tool_name);

  // Reads are routed by the nearest `.hivemind` exactly like capture is: a
  // directory pinned to another org/workspace must SEE that workspace's memory,
  // not the global one. `collect` is a capture switch and deliberately does not
  // gate reads (see src/dir-config.ts).
  const config = resolveDirConfig(baseConfig, input.cwd ?? process.cwd()).config;

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
    if (input.tool_name === "Bash") {
      const compiled = await executeCompiledBashCommandFn(api, table, sessionsTable, shellCmd, {
        readVirtualPathContentsFn: async (_api, _memoryTable, _sessionsTable, cachePaths) => readVirtualPathContentsWithCache(cachePaths),
      });
      if (compiled !== null) {
        return buildAllowDecision(safeEchoCommand(compiled), `[DeepLake compiled] ${shellCmd}`);
      }
    }

    const grepParams = extractGrepParams(input.tool_name, input.tool_input, shellCmd);
    if (grepParams) {
      logFn(`direct grep: pattern=${grepParams.pattern} path=${grepParams.targetPath}`);
      const result = await handleGrepDirectFn(api, table, sessionsTable, grepParams);
      if (result !== null) return buildAllowDecision(safeEchoCommand(result), `[DeepLake direct] grep ${grepParams.pattern}`);
    }

    let virtualPath: string | null = null;
    let lineLimit = 0;
    let fromEnd = false;
    let lsDir: string | null = null;
    let longFormat = false;

    if (input.tool_name === "Read") {
      virtualPath = rewritePaths(getReadTargetPath(input.tool_input) ?? "");
      if (virtualPath && isLikelyDirectoryPath(virtualPath)) {
        lsDir = virtualPath.replace(/\/+$/, "") || "/";
        virtualPath = null;
      }
    } else if (input.tool_name === "Bash") {
      const catCmd = shellCmd.replace(/\s+2>\S+/g, "").trim();
      const catPipeHead = catCmd.match(/^cat\s+(\S+?)\s*(?:\|[^|]*)*\|\s*head\s+(?:-n?\s*)?(-?\d+)\s*$/);
      if (catPipeHead) { virtualPath = catPipeHead[1]; lineLimit = Math.abs(parseInt(catPipeHead[2], 10)); }
      if (!virtualPath) {
        const catMatch = catCmd.match(/^cat\s+(\S+)\s*$/);
        if (catMatch) virtualPath = catMatch[1];
      }
      if (!virtualPath) {
        const headMatch = shellCmd.match(/^head\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ??
                          shellCmd.match(/^head\s+(\S+)\s*$/);
        if (headMatch) {
          if (headMatch[2]) { virtualPath = headMatch[2]; lineLimit = Math.abs(parseInt(headMatch[1], 10)); }
          else { virtualPath = headMatch[1]; lineLimit = 10; }
        }
      }
      if (!virtualPath) {
        const tailMatch = shellCmd.match(/^tail\s+(?:-n\s*)?(-?\d+)\s+(\S+)\s*$/) ??
                          shellCmd.match(/^tail\s+(\S+)\s*$/);
        if (tailMatch) {
          fromEnd = true;
          if (tailMatch[2]) { virtualPath = tailMatch[2]; lineLimit = Math.abs(parseInt(tailMatch[1], 10)); }
          else { virtualPath = tailMatch[1]; lineLimit = 10; }
        }
      }
      if (!virtualPath) {
        const wcMatch = shellCmd.match(/^wc\s+-l\s+(\S+)\s*$/);
        if (wcMatch) { virtualPath = wcMatch[1]; lineLimit = -1; }
      }
    }

    // Graph VFS dispatch — synthesized text responses for the
    // <memory>/graph/... subtree. Lives under the memory mount as a
    // SUBDIR (not a separate mount) so the existing touchesMemory()
    // intercept already brought us here. We just route /graph/* away
    // from the SQL-backed memory dispatch below to the local snapshot.
    //
    // Trimmed surface per codex review: index.md / find/<pattern> /
    // show/<handle-or-pattern>. Hits return synthesized text via
    // `echo <body>` exactly like the BM25 grep path does. From the
    // agent's perspective it's just `cat` on a file.
    if (virtualPath && virtualPath.startsWith("/graph/") && !virtualPath.endsWith("/")) {
      const subpath = virtualPath.slice("/graph/".length);
      logFn(`graph vfs: ${subpath}`);
      const result = handleGraphVfsFn(subpath, process.cwd());
      const body = result.kind === "ok"
        ? result.body
        : `(${result.kind}) ${result.message}`;
      // CodeRabbit P1: Read tool requires a file_path-shaped decision
      // (the harness reads the cached file directly). Bash gets the
      // command-shaped decision (echo) like the rest of the intercepts.
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, virtualPath, body);
        return buildReadDecision(file_path, `[hivemind graph] ${virtualPath}`);
      }
      return buildAllowDecision(safeEchoCommand(body), `[hivemind graph] /graph/${subpath}`);
    }
    if (lsDir === "/graph" || lsDir === "/graph/") {
      const body = "index.md\nfind/\nshow/\n";
      if (input.tool_name === "Read") {
        // Synthetic leaf (not "/graph" itself) so later reads of
        // /graph/index.md or /graph/show/... can still create children.
        const file_path = writeReadCacheFileFn(input.session_id, "/graph/_listing.txt", body);
        return buildReadDecision(file_path, "[hivemind graph] ls /graph");
      }
      return buildAllowDecision(safeEchoCommand(body), `[hivemind graph] ls /graph`);
    }

    // Docs VFS dispatch — the browsable per-directory docs index under
    // <memory>/docs/. Separate surface from the memory index (no retrieval
    // pollution). Backed by the docs TABLE, so this is async via api.query.
    // `/docs` (bare) and `/docs/index.md` both render the root index.
    if (virtualPath && (virtualPath === "/docs" || virtualPath.startsWith("/docs/")) && !virtualPath.endsWith("/")) {
      const subpath = virtualPath === "/docs" ? "" : virtualPath.slice("/docs/".length);
      logFn(`docs vfs: ${subpath || "(root)"}`);
      const docsCwd = input.cwd ?? process.cwd();
      const docsGit = defaultGit(docsCwd);
      const result = await handleDocsVfsFn(subpath, (sql) => api.query(sql), config.docsTableName, { embedQuery: makeQueryEmbedder(), project: deriveProjectKey(docsCwd).key, readerScope: currentScope(docsGit), git: docsGit });
      const body = result.kind === "ok" ? result.body : `(${result.kind}) ${result.message}`;
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, virtualPath, body);
        return buildReadDecision(file_path, `[hivemind docs] ${virtualPath}`);
      }
      return buildAllowDecision(safeEchoCommand(capOutputForClaude(body, { kind: "docs" })), `[hivemind docs] /docs/${subpath}`);
    }
    if (lsDir === "/docs" || lsDir === "/docs/") {
      const result = await handleDocsVfsFn("", (sql) => api.query(sql), config.docsTableName, { project: deriveProjectKey(input.cwd ?? process.cwd()).key });
      const body = result.kind === "ok" ? result.body : `(${result.kind}) ${result.message}`;
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, "/docs/_listing.txt", body);
        return buildReadDecision(file_path, "[hivemind docs] ls /docs");
      }
      return buildAllowDecision(safeEchoCommand(capOutputForClaude(body, { kind: "docs" })), `[hivemind docs] ls /docs`);
    }

    if (virtualPath && !virtualPath.endsWith("/")) {
      logFn(`direct read: ${virtualPath}`);
      let content = virtualPath === "/index.md"
        ? readCachedIndexContentFn(input.session_id)
        : null;

      if (content === null) {
        // `/index.md` goes through the dual-table builder inside
        // `readVirtualPathContents` (fix #1). Other paths fall back to the
        // same helper which returns null when neither table has a row, at
        // which point we let the shell bundle handle the miss below.
        //
        // A genuine backend failure now THROWS out of readVirtualPathContent
        // (it no longer collapses to null → a misleading "No such file"). We
        // deliberately let that throw propagate to the outer catch, which
        // falls through to the sandboxed VFS shell (deeplake-shell.js) whose
        // readFileBuffer re-attempts and surfaces a real error — preserving
        // the retry instead of short-circuiting it here.
        content = await readVirtualPathContentFn(api, table, sessionsTable, virtualPath);
      }
      if (content !== null) {
        if (virtualPath === "/index.md") {
          writeCachedIndexContentFn(input.session_id, content);
        }
        if (lineLimit === -1) return buildAllowDecision(safeEchoCommand(`${content.split("\n").length} ${virtualPath}`), `[DeepLake direct] wc -l ${virtualPath}`);
        if (lineLimit > 0) {
          const lines = content.split("\n");
          content = fromEnd ? lines.slice(-lineLimit).join("\n") : lines.slice(0, lineLimit).join("\n");
        }
        const label = lineLimit > 0 ? (fromEnd ? `tail -${lineLimit}` : `head -${lineLimit}`) : "cat";
        // Read tool writes content to disk and Claude Code reads the file directly,
        // so no size pressure; keep full content. Bash intercepts flow through
        // Claude Code's 16 KB tool_result threshold so we cap before reaching it.
        if (input.tool_name === "Read") {
          const file_path = writeReadCacheFileFn(input.session_id, virtualPath, content);
          return buildReadDecision(file_path, `[DeepLake direct] ${label} ${virtualPath}`);
        }
        const capped = capOutputForClaude(content, { kind: label });
        return buildAllowDecision(safeEchoCommand(capped), `[DeepLake direct] ${label} ${virtualPath}`);
      }
      // The path was normalized to a concrete file but no VFS row exists — that
      // is "not found", NOT an unsupported command. Falling through to the
      // generic retry guidance would loop the agent on an already-valid shape.
      logFn(`virtual path not found: ${virtualPath}`);
      const notFound = `${virtualPath}: No such file or directory`;
      if (input.tool_name === "Read") {
        const file_path = writeReadCacheFileFn(input.session_id, virtualPath, notFound);
        return buildReadDecision(file_path, `[DeepLake] not found: ${virtualPath}`);
      }
      return buildAllowDecision(`echo ${JSON.stringify(notFound)}`, `[DeepLake] not found: ${virtualPath}`);
    }

    if (!lsDir && input.tool_name === "Glob") {
      lsDir = rewritePaths((input.tool_input.path as string) ?? "") || "/";
    } else if (input.tool_name === "Bash") {
      const lsMatch = shellCmd.match(/^ls\s+(?:-([a-zA-Z]+)\s+)?(\S+)?\s*$/);
      if (lsMatch) {
        lsDir = lsMatch[2] ?? "/";
        longFormat = (lsMatch[1] ?? "").includes("l");
      }
    }

    if (lsDir) {
      const dir = lsDir.replace(/\/+$/, "") || "/";
      logFn(`direct ls: ${dir}`);
      // A backend failure throws here; like the read path, we let it propagate
      // to the outer catch → VFS shell fallback rather than masking it.
      const rows = await listVirtualPathRowsFn(api, table, sessionsTable, dir);
      const entries = new Map<string, { isDir: boolean; size: number }>();
      const prefix = dir === "/" ? "/" : dir + "/";
      for (const row of rows) {
        const p = row["path"] as string;
        if (!p.startsWith(prefix) && dir !== "/") continue;
        const rest = dir === "/" ? p.slice(1) : p.slice(prefix.length);
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
      const lines: string[] = [];
      for (const [name, info] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (longFormat) {
          const type = info.isDir ? "drwxr-xr-x" : "-rw-r--r--";
          const size = String(info.isDir ? 0 : info.size).padStart(6);
          lines.push(`${type} 1 user user ${size} ${name}${info.isDir ? "/" : ""}`);
        } else {
          lines.push(name + (info.isDir ? "/" : ""));
        }
      }
      const lsOutput = capOutputForClaude(lines.join("\n") || "(empty directory)", { kind: "ls" });
      if (input.tool_name === "Read") {
        // Read needs a file_path-shaped decision (a {command} payload would
        // leave file_path undefined). Materialize the listing under a synthetic
        // leaf inside the dir — not the dir path itself — so later child reads
        // can still create files alongside it in the cache.
        const leaf = (dir === "/" ? "" : dir) + "/_listing.txt";
        const file_path = writeReadCacheFileFn(input.session_id, leaf, lsOutput);
        return buildReadDecision(file_path, `[DeepLake direct] ls ${dir}`);
      }
      // Branch hardening: safeEchoCommand over a raw `echo` for the ls payload.
      return buildAllowDecision(safeEchoCommand(lsOutput), `[DeepLake direct] ls ${dir}`);
    }

    if (input.tool_name === "Bash") {
      // Anchor to the exact shape the VFS serves: `find <dir> [-type X] -name
      // '<pat>'` optionally piped to `wc -l`. A prefix match would accept
      // `find … -name '*.md' -delete` or `… -o -name '…'` and silently drop the
      // trailing semantics; anything else falls through to guidance.
      // No `-type` clause: the VFS find handler can't enforce a type filter, so
      // accepting `-type d` and ignoring it would return wrong results. Such
      // commands fall through to guidance instead.
      const findMatch = shellCmd.match(/^find\s+(\S+)\s+-name\s+(?:'([^']+)'|"([^"]+)"|([^\s|]+))\s*(?:\|\s*wc\s+-l)?\s*$/);
      if (findMatch) {
        const dir = findMatch[1].replace(/\/+$/, "") || "/";
        const rawPattern = findMatch[2] ?? findMatch[3] ?? findMatch[4] ?? "";
        const namePattern = sqlLike(rawPattern).replace(/\*/g, "%").replace(/\?/g, "_");
        logFn(`direct find: ${dir} -name '${rawPattern}'`);
        const paths = await findVirtualPathsFn(api, table, sessionsTable, dir, namePattern);
        let result = paths.join("\n") || "";
        if (/\|\s*wc\s+-l\s*$/.test(shellCmd)) result = String(paths.length);
        const capped = capOutputForClaude(result || "(no matches)", { kind: "find" });
        return buildAllowDecision(safeEchoCommand(capped), `[DeepLake direct] find ${dir}`);
      }
    }
  } catch (e: any) {
    logFn(`direct query failed: ${e.message}`);
  }

  // No compiled handler matched (or a direct query failed). Route through the
  // VFS shell bundle — it is a sandboxed Node.js interpreter that operates
  // entirely against the SQL backend, so no host filesystem access occurs.
  // Do NOT return null: that would hand the original command to Claude Code's
  // real host shell, which is unsafe.
  const shellBundle = join(__bundleDir, "shell", "deeplake-shell.js");
  logFn(`unroutable memory command, falling back to shell: ${shellCmd}`);
  // Read needs file_path, not a command-shaped decision.
  if (input.tool_name === "Read") {
    return buildDenyDecision(MEMORY_RETRY_GUIDANCE, "[DeepLake] memory Read unavailable — use Bash builtins");
  }
  // Single-quote both arguments so $(), backticks, and variable expansion
  // cannot escape into the host shell before deeplake-shell.js receives them.
  const sq = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
  return buildAllowDecision(
    `node ${sq(shellBundle)} -c ${sq(shellCmd)}`,
    `[DeepLake shell] ${shellCmd}`,
  );
}

/* c8 ignore start */
async function main(): Promise<void> {
  const input = await readStdin<PreToolUseInput>();
  // Self-heal the owner record from a SYNCHRONOUS hook. SessionStart records it
  // for new sessions, but a session already open when this shipped only gets a
  // record via the async capture hook — which can be detached and unable to
  // walk to its `claude` ancestor. PreToolUse runs synchronously under claude,
  // so its /proc walk reliably finds the owner; no-op once recorded.
  if (input.session_id && process.env.HIVEMIND_WIKI_WORKER !== "1") {
    try { ensureSessionOwner(input.session_id); } catch { /* best-effort */ }
  }
  const decision = await processPreToolUse(input);
  if (!decision) return;
  if (decision.deny !== undefined) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.deny,
      },
    }));
    return;
  }
  const updatedInput: Record<string, unknown> = decision.file_path !== undefined
    ? { file_path: decision.file_path }
    : { command: decision.command, description: decision.description };
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  }));
}

if (isDirectRun(import.meta.url)) {
  main().catch((e) => { log(`fatal: ${e.message}`); process.exit(0); });
}
/* c8 ignore stop */
