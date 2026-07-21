/**
 * Snapshot diff (Phase 1.5).
 *
 * Loads two snapshots by commit SHA from a per-repo storage directory and
 * computes set differences on nodes and edges:
 *   - Nodes by `id`
 *   - Edges by canonical key `(source, target, relation, ord ?? 0)`
 *
 * Pure: no I/O outside the explicit load functions; safe to call from tests
 * with snapshots passed in as plain objects.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { GraphEdge, GraphNode, GraphSnapshot } from "./types.js";

/** A node present in both snapshots whose declared signature changed. */
export interface ModifiedNode {
  before: GraphNode;
  after: GraphNode;
}

export interface SnapshotDiff {
  nodes: {
    added: GraphNode[];
    removed: GraphNode[];
    /** Same id on both sides, different `signature` — the "public contract
     *  changed" signal the wiki refresh uses for escalation. Optional so
     *  hand-built diffs in existing callers/tests stay valid. */
    modified?: ModifiedNode[];
  };
  edges: {
    added: GraphEdge[];
    removed: GraphEdge[];
  };
  /** Convenience counts so callers don't re-walk arrays. */
  counts: {
    nodes_added: number;
    nodes_removed: number;
    /** Optional — see nodes.modified. */
    nodes_modified?: number;
    edges_added: number;
    edges_removed: number;
  };
}

/**
 * Canonical edge key. Matches the sort order in buildSnapshot so the same
 * edge in two snapshots always hashes to the same key — independent of
 * its position in the `links` array.
 */
function edgeKey(e: GraphEdge): string {
  return `${e.source}${e.target}${e.relation}${e.ord ?? 0}`;
}

/**
 * Compute the diff of `to` relative to `from`. The result lists what is in
 * `to` but not in `from` as "added", and what is in `from` but not in `to`
 * as "removed".
 */
export function diffSnapshots(from: GraphSnapshot, to: GraphSnapshot): SnapshotDiff {
  const fromById = new Map(from.nodes.map((n) => [n.id, n]));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));
  const nodesAdded = to.nodes.filter((n) => !fromById.has(n.id));
  const nodesRemoved = from.nodes.filter((n) => !toNodeIds.has(n.id));

  // Surviving nodes whose declared signature changed. `source_location` is
  // deliberately NOT compared — any unrelated line shift would flag it.
  const nodesModified: ModifiedNode[] = [];
  for (const after of to.nodes) {
    const before = fromById.get(after.id);
    if (before && (before.signature ?? "") !== (after.signature ?? "")) {
      nodesModified.push({ before, after });
    }
  }

  const fromEdgeKeys = new Set(from.links.map(edgeKey));
  const toEdgeKeys = new Set(to.links.map(edgeKey));
  const edgesAdded = to.links.filter((e) => !fromEdgeKeys.has(edgeKey(e)));
  const edgesRemoved = from.links.filter((e) => !toEdgeKeys.has(edgeKey(e)));

  return {
    nodes: { added: nodesAdded, removed: nodesRemoved, modified: nodesModified },
    edges: { added: edgesAdded, removed: edgesRemoved },
    counts: {
      nodes_added: nodesAdded.length,
      nodes_removed: nodesRemoved.length,
      nodes_modified: nodesModified.length,
      edges_added: edgesAdded.length,
      edges_removed: edgesRemoved.length,
    },
  };
}

/**
 * Load a snapshot by commit SHA from the per-repo storage directory.
 * Returns null if the file is missing, malformed, or unreadable — callers
 * surface a clear "snapshot not found" message instead of crashing.
 */
export function loadSnapshotByCommit(baseDir: string, commitSha: string): GraphSnapshot | null {
  // CodeRabbit P1: commitSha flows directly into a filesystem path. Without
  // validation a value like "../etc/passwd" escapes the snapshots dir.
  // Snapshots are always named by hex git SHAs (40 chars). Accept any
  // hex length 4-64 to tolerate short SHAs from CLI users (`graph diff
  // abc1234 def5678`) while still blocking traversal characters.
  if (!/^[0-9a-f]{4,64}$/i.test(commitSha)) return null;
  const path = join(baseDir, "snapshots", `${commitSha}.json`);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    // CodeRabbit P1: parseable JSON ≠ valid snapshot. Without this
    // structural check, diffSnapshots throws on a malformed payload
    // (truncated mid-write, Phase 1.5 file read by Phase 1 code, etc.).
    if (!isGraphSnapshotLike(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isGraphSnapshotLike(v: unknown): v is GraphSnapshot {
  if (v === null || typeof v !== "object") return false;
  const s = v as Partial<GraphSnapshot>;
  return Array.isArray(s.nodes) && Array.isArray(s.links);
}

/**
 * Pretty-print the diff to stdout. Caller decides whether to use this or
 * print the full SnapshotDiff via JSON (e.g., `--json` flag).
 *
 * Format:
 *   "Nodes: +N -M   Edges: +K -L"
 *   followed by up to `sampleSize` of each added/removed (sorted by id/key)
 */
export function printDiffHuman(diff: SnapshotDiff, sampleSize = 10): void {
  const { counts } = diff;
  console.log(
    `Nodes: +${counts.nodes_added} -${counts.nodes_removed}   Edges: +${counts.edges_added} -${counts.edges_removed}`,
  );

  const showNodes = (label: string, ns: GraphNode[]): void => {
    if (ns.length === 0) return;
    console.log("");
    console.log(`${label} (${ns.length}, showing up to ${sampleSize}):`);
    const sorted = [...ns].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const n of sorted.slice(0, sampleSize)) {
      console.log(`  ${n.id} [${n.kind}]${n.exported ? " (exported)" : ""}  ${n.source_file}:${n.source_location}`);
    }
    if (sorted.length > sampleSize) console.log(`  … and ${sorted.length - sampleSize} more`);
  };

  const showEdges = (label: string, es: GraphEdge[]): void => {
    if (es.length === 0) return;
    console.log("");
    console.log(`${label} (${es.length}, showing up to ${sampleSize}):`);
    const sorted = [...es].sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0));
    for (const e of sorted.slice(0, sampleSize)) {
      console.log(`  ${e.source} --${e.relation}--> ${e.target}${e.ord !== undefined ? ` (ord=${e.ord})` : ""}`);
    }
    if (sorted.length > sampleSize) console.log(`  … and ${sorted.length - sampleSize} more`);
  };

  showNodes("Nodes added", diff.nodes.added);
  showNodes("Nodes removed", diff.nodes.removed);
  showEdges("Edges added", diff.edges.added);
  showEdges("Edges removed", diff.edges.removed);
}
