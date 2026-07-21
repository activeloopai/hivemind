/**
 * Shared `cat /docs/*` dispatcher for the rewrite-capable agent hooks
 * (claude / codex / cursor / hermes). The docs analogue of
 * `tryGraphRead` (src/graph/graph-command.ts): parse a read command, and if it
 * targets the `/docs/` subtree, answer it from the docs table via handleDocsVfs.
 *
 * Reuses the graph command parser (`parseReadTargetPath`, `stripQuotes`,
 * `hasTraversal`) so every agent routes docs the exact same way it routes the
 * graph and sessions — no per-agent reinvention. Async because docs are
 * SQL-backed (graph reads a local snapshot synchronously).
 */

import { handleDocsVfs, type DocsVfsOptions } from "./vfs-handler.js";
import type { QueryFn } from "./read.js";
import { parseReadTargetPath, stripQuotes, hasTraversal } from "../graph/graph-command.js";

const DOCS_ROOT = "/docs";
const DOCS_PREFIX = "/docs/";

/**
 * If `rewrittenCommand` is a read (cat/head/tail/ls) targeting `/docs/*`, return
 * the rendered body; otherwise null (caller falls through to its normal read).
 */
export async function tryDocsRead(
  rewrittenCommand: string,
  query: QueryFn,
  docsTable: string,
  opts: DocsVfsOptions = {},
): Promise<string | null> {
  // `ls /docs` (+ trailing-slash/flag variants) → directory listing.
  const ls = rewrittenCommand.replace(/\s+2>\S+/g, "").trim().match(/^ls\s+(?:-\S+\s+)*(\S+)\s*$/);
  if (ls) {
    const dir = stripQuotes(ls[1]!).replace(/\/+$/, "") || "/";
    if (dir !== DOCS_ROOT) return null;
    // Same root view as the Claude hook: the rendered docs index, not a
    // hardcoded listing that drifts from it.
    const root = await handleDocsVfs("", query, docsTable, opts);
    return root.kind === "ok" ? root.body : `(${root.kind}) ${root.message}`;
  }

  const virtualPath = parseReadTargetPath(rewrittenCommand);
  if (virtualPath === null) return null;
  if (hasTraversal(virtualPath)) return null; // /docs/../secret escapes the subtree

  const normalized = virtualPath.replace(/\/+$/, "") || "/";
  if (normalized !== DOCS_ROOT && !virtualPath.startsWith(DOCS_PREFIX)) return null;

  const sub = normalized === DOCS_ROOT ? "" : virtualPath.slice(DOCS_PREFIX.length);
  const r = await handleDocsVfs(sub, query, docsTable, opts);
  return r.kind === "ok" ? r.body : `(${r.kind}) ${r.message}`;
}
