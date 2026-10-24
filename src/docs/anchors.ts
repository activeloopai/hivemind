/**
 * Anchors — the join between a doc and the code it describes.
 *
 * An anchor is `{ symbol_id, content_hash }`: the graph-node id of a symbol
 * plus a sha256 fingerprint of that symbol's *source slice* at the moment the
 * doc was written. Drift detection is then a pure comparison — re-read the
 * symbol's source now, hash it, and if it differs from the stored hash the
 * doc is stale.
 *
 * Why hash the SOURCE SLICE and not the line LOCATION: inserting an import
 * above a function shifts its line numbers but not its body. Hashing the
 * content (lines start..end joined) is robust to that movement and only
 * fires on a real edit to the symbol itself. Line-ending normalization is
 * the only normalization applied — we deliberately do NOT strip whitespace
 * (indentation is semantic in Python and over-normalizing hides real edits).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode, GraphSnapshot } from "../graph/types.js";
import type { DocAnchor } from "./read.js";

/** Parse a node's `source_location` (`L10`, `L10-20`, or `L10-L20`) → 1-indexed line range. */
export function parseSourceLocation(loc: string): { startLine: number; endLine: number } | null {
  const m = loc.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!m) return null;
  const startLine = Number(m[1]);
  const endLine = m[2] ? Number(m[2]) : startLine;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;
  if (startLine < 1 || endLine < startLine) return null;
  return { startLine, endLine };
}

/**
 * Read the source slice for a symbol from the working tree. Returns null if
 * the location is unparseable, the file is unreadable, or the line range no
 * longer fits the file (a stale location — the symbol moved or shrank).
 */
export function readSymbolSource(node: GraphNode, repoRoot: string): string | null {
  const loc = parseSourceLocation(node.source_location);
  if (!loc) return null;
  let text: string;
  try {
    text = readFileSync(join(repoRoot, node.source_file), "utf-8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  if (loc.endLine > lines.length) return null;
  return lines.slice(loc.startLine - 1, loc.endLine).join("\n");
}

/**
 * Normalize a source slice before hashing: CRLF → LF, nothing else.
 *
 * Comments, indentation, blank lines and trailing whitespace are all
 * PRESERVED. Regex comment stripping cannot tell a comment from string
 * contents — `"**\/*.ts"` … `"dist/**\/x"` looks like a block comment and
 * swallowed the real code between the two literals, and whitespace inside
 * multiline strings / Python indentation is semantic too. Without a real
 * per-language lexer, the only safe policy is to hash the bytes.
 *
 * Tradeoff: a cosmetic edit (comment, reformat, blank line) now changes the
 * hash and may trigger a doc refresh. Anchors taken under the previous
 * comment/whitespace-stripping normalization will differ once for any
 * symbol whose slice contained comments, blank lines or trailing
 * whitespace — a one-time refresh of those docs.
 *
 * `language` is accepted for API compatibility and currently unused.
 */
export function normalizeForHash(src: string, _language?: string): string {
  return src.replace(/\r\n/g, "\n");
}

/**
 * sha256 of a source slice after CRLF → LF normalization only (see
 * `normalizeForHash`): comment and whitespace edits DO change the hash.
 */
export function hashSource(src: string, language?: string): string {
  return createHash("sha256").update(normalizeForHash(src, language)).digest("hex");
}

/** Compute the content hash for a symbol, or null if its source can't be read. */
export function computeSymbolHash(node: GraphNode, repoRoot: string): string | null {
  const src = readSymbolSource(node, repoRoot);
  return src === null ? null : hashSource(src, node.language);
}

/** Build an anchor for a symbol node, or null if its source can't be read. */
export function buildAnchor(node: GraphNode, repoRoot: string): DocAnchor | null {
  const hash = computeSymbolHash(node, repoRoot);
  return hash === null ? null : { symbol_id: node.id, content_hash: hash };
}

/** Status of one anchor checked against the current snapshot + working tree. */
export type AnchorStatus =
  | { state: "fresh" }
  /** The symbol no longer exists in the graph (removed or renamed). */
  | { state: "missing" }
  /** The symbol exists but its source slice can't be read (file/line moved). */
  | { state: "unreadable" }
  /** The symbol's source changed since the anchor was taken. */
  | { state: "changed"; from: string; to: string };

/**
 * Check a single anchor against the current snapshot + working tree.
 * `nodeById` is an optional prebuilt index (build once per snapshot when
 * checking many anchors — `computeStaleDocs` does this).
 */
export function anchorStatus(
  anchor: DocAnchor,
  snap: GraphSnapshot,
  repoRoot: string,
  nodeById?: Map<string, GraphNode>,
): AnchorStatus {
  const node = nodeById
    ? nodeById.get(anchor.symbol_id)
    : snap.nodes.find((n) => n.id === anchor.symbol_id);
  if (!node) return { state: "missing" };
  const current = computeSymbolHash(node, repoRoot);
  if (current === null) return { state: "unreadable" };
  if (current !== anchor.content_hash) {
    return { state: "changed", from: anchor.content_hash, to: current };
  }
  return { state: "fresh" };
}
