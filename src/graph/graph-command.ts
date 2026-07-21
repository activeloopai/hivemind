/**
 * Shared graph-read command parser for the VFS intercept.
 *
 * Several agents (Claude Code, Cursor, …) intercept shell commands that read
 * the `~/.deeplake/memory/graph/` subtree and synthesize the response from the
 * local snapshot instead of touching disk. The *path taxonomy* and the
 * dispatch to `handleGraphVfs()` are identical across agents — only the
 * per-agent decision wrapper (echo vs read-cache) differs. This module owns
 * the shared half so the per-agent hooks don't each re-implement the regex
 * parsing (and drift apart).
 *
 * Input is the command AFTER rewritePaths() has mapped host paths
 * (`~/.deeplake/memory/...`, `$HOME/...`, absolute) onto the virtual mount root
 * "/", so a graph read looks like `cat /graph/index.md`.
 */

import { handleGraphVfs } from "./vfs-handler.js";

const GRAPH_ROOT = "/graph";
const GRAPH_PREFIX = "/graph/";

/** Split a command line into tokens, keeping simple single/double quoted runs intact. */
function tokenize(s: string): string[] {
  return s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

/** Strip one layer of surrounding matching quotes from a token. */
export function stripQuotes(p: string): string {
  if (p.length >= 2 && ((p[0] === '"' && p[p.length - 1] === '"') || (p[0] === "'" && p[p.length - 1] === "'"))) {
    return p.slice(1, -1);
  }
  return p;
}

/**
 * Extract the virtual path read by a simple `cat` / `head` / `tail` command.
 * Returns null when the command isn't one of those single-file reads. Line
 * limits are intentionally ignored: graph endpoints return a bounded synthesized
 * body already, so head/tail on a graph path yields the same full body as cat.
 *
 * Hardened against (codex review):
 *  - arbitrary intermediate pipes: only a *single* trailing `| head|tail` after
 *    `cat` is accepted; `cat x | grep y | head` is NOT a graph read (it must
 *    reach real shell/grep semantics) → returns null.
 *  - leading flags: `cat -n /p`, `head -n 20 /p`, `head -20 /p` all resolve to
 *    `/p` (the flag and, for head/tail, its count are skipped).
 *  - quoted paths: `cat "/p"` → `/p`.
 */
export function parseReadTargetPath(rewrittenCommand: string): string | null {
  const cmd = rewrittenCommand.replace(/\s+2>\S+/g, "").trim();

  // Permit at most one pipe, and only `cat <...> | head|tail` (no further pipe,
  // no grep/sed/etc in between). Anything else falls through to the caller.
  const pipeIdx = cmd.indexOf("|");
  let readPart = cmd;
  if (pipeIdx >= 0) {
    readPart = cmd.slice(0, pipeIdx).trim();
    const after = cmd.slice(pipeIdx + 1).trim();
    if (after.includes("|")) return null;          // multiple pipes
    if (!/^(?:head|tail)\b/.test(after)) return null; // pipe target isn't head/tail
    if (!/^cat\b/.test(readPart)) return null;      // only `cat` may pipe into head/tail
  }

  const tokens = tokenize(readPart);
  if (tokens.length === 0) return null;
  const verb = tokens[0];
  if (verb !== "cat" && verb !== "head" && verb !== "tail") return null;

  // Collect non-flag operands. We require EXACTLY ONE: a multi-file read like
  // `cat /graph/index.md /tmp/other` must fall through to real shell semantics
  // rather than be answered as a single graph read with the 2nd operand
  // silently dropped (codex review round 2).
  const operands: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.startsWith("-")) {
      // head/tail `-n N` consumes the next token as its count; `cat -n` and the
      // attached forms (`-20`, `-n20`) consume nothing extra.
      if ((verb === "head" || verb === "tail") && (tok === "-n" || tok === "--lines")) i++;
      continue;
    }
    operands.push(tok);
    if (operands.length > 1) return null; // multi-file read → not a graph read
  }
  return operands.length === 1 ? stripQuotes(operands[0]!) : null;
}

/** True when a virtual path tries to escape the graph subtree via a `..` segment. */
export function hasTraversal(virtualPath: string): boolean {
  return virtualPath.split("/").includes("..");
}

/**
 * If `rewrittenCommand` reads a `/graph/*` virtual path (or lists `/graph`),
 * synthesize the graph VFS body for it; otherwise return null so the caller
 * falls through to its other handlers (e.g. the BM25 grep fast-path).
 *
 * Never throws: handleGraphVfs is best-effort and returns a no-graph/not-found
 * result rather than raising, and we render those inline so the agent stays
 * unblocked.
 */
export function tryGraphRead(rewrittenCommand: string, cwd: string): string | null {
  // `ls /graph` (and trailing-slash variants) → directory listing.
  const ls = rewrittenCommand.replace(/\s+2>\S+/g, "").trim().match(/^ls\s+(?:-\S+\s+)*(\S+)\s*$/);
  if (ls) {
    const dir = stripQuotes(ls[1]!).replace(/\/+$/, "") || "/";
    if (dir === GRAPH_ROOT) return "index.md\nfind/\nquery/\nshow/\nimpact/\nneighborhood/\nlayers\ntour\npath/\n";
    return null;
  }

  const virtualPath = parseReadTargetPath(rewrittenCommand);
  if (virtualPath === null) return null;

  // Refuse path-traversal: `/graph/../secret` starts with /graph/ but escapes
  // the subtree. Don't dispatch it — let the caller treat it as a normal read.
  if (hasTraversal(virtualPath)) return null;

  const normalized = virtualPath.replace(/\/+$/, "") || "/";
  if (normalized === GRAPH_ROOT) return "index.md\nfind/\nquery/\nshow/\nimpact/\nneighborhood/\nlayers\ntour\npath/\n";
  if (!virtualPath.startsWith(GRAPH_PREFIX)) return null;

  const subpath = virtualPath.slice(GRAPH_PREFIX.length);
  const result = handleGraphVfs(subpath, cwd);
  return result.kind === "ok" ? result.body : `(${result.kind}) ${result.message}`;
}
