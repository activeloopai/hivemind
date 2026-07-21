/**
 * impact/<pattern> — blast radius (B5).
 *
 * "If I change this symbol, what could be affected?" Answers with the
 * transitive set of DEPENDENTS: every node that reaches the target by
 * following edges in reverse (incoming `calls`/`imports`/`extends`/
 * `implements`/`method_of`), grouped by BFS depth. Deterministic, AST-only,
 * over the fully-resolved snapshot edges (so cross-file dependents count).
 *
 * Honest scope: only resolved edges are traversed — cross-file relationships
 * via bare/aliased/barrel/dynamic imports are not in the graph, so the impact
 * set is a LOWER BOUND, not a proof of total safety.
 */

import type { GraphSnapshot, GraphEdge } from "../types.js";

/** Max dependents listed before truncating (the true total is still reported). */
const IMPACT_CAP = 80;
/** Safety bound on BFS depth so a pathological graph can't run away. */
const MAX_DEPTH = 25;

/**
 * Reverse-edge BFS shared by `renderImpact` (single target, for display) and
 * `impactedNodes` (many seeds, for doc drift widening). Walks INCOMING
 * `calls`/`imports`/`extends`/`implements`/`method_of` edges from the seeds
 * to collect every transitive dependent. Deterministic: seeds and each level
 * are processed in id order so `viaOf` is stable.
 *
 * Returns `depthOf` (every reached node incl. seeds at depth 0) and `viaOf`
 * (the relation/source that first reached each non-seed node).
 */
/** Relations that express a code dependency; the reverse walk follows ONLY
 *  these (today EdgeRelation is a closed union of exactly these, so this is a
 *  no-op guard — it exists so a future non-dependency relation cannot silently
 *  widen the blast radius). */
const DEP_RELATIONS = new Set(["calls", "imports", "extends", "implements", "method_of"]);

function reverseBfs(
  snap: GraphSnapshot,
  seeds: Iterable<string>,
  maxDepth = MAX_DEPTH,
): { depthOf: Map<string, number>; viaOf: Map<string, { rel: string; from: string }> } {
  // Reverse adjacency: target -> [edges pointing at it]. Only edges whose
  // SOURCE is a real node are kept, so a dependent is always a graph node.
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of snap.links) {
    if (!DEP_RELATIONS.has(e.relation)) continue;
    if (!nodeIds.has(e.source)) continue;
    const list = incoming.get(e.target);
    if (list) list.push(e); else incoming.set(e.target, [e]);
  }

  const depthOf = new Map<string, number>();
  const viaOf = new Map<string, { rel: string; from: string }>();
  let frontier: string[] = [];
  for (const s of seeds) {
    if (!depthOf.has(s)) {
      depthOf.set(s, 0);
      frontier.push(s);
    }
  }
  frontier.sort();
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      const edges = (incoming.get(id) ?? []).slice().sort((a, b) =>
        a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation));
      for (const e of edges) {
        if (depthOf.has(e.source)) continue; // already reached at a shallower/equal depth
        depthOf.set(e.source, depth);
        viaOf.set(e.source, { rel: e.relation, from: id });
        next.push(e.source);
      }
    }
    next.sort();
    frontier = next;
  }
  return { depthOf, viaOf };
}

/**
 * The transitive dependent closure of `seeds` — every node that reaches a
 * seed by following edges in reverse, PLUS the seeds themselves. This is the
 * blast radius: "if these symbols change, which symbols could be affected?"
 * Used by the doc drift detector to widen staleness from changed symbols to
 * the docs of their callers.
 */
export function impactedNodes(
  snap: GraphSnapshot,
  seeds: Iterable<string>,
  opts?: { maxDepth?: number },
): Set<string> {
  return new Set(reverseBfs(snap, seeds, opts?.maxDepth).depthOf.keys());
}

export function renderImpact(snap: GraphSnapshot, pattern: string): string {
  const needle = pattern.toLowerCase();
  const matches = snap.nodes.filter((n) => n.id.toLowerCase().includes(needle));
  if (matches.length === 0) {
    return `No node matches "${pattern}". Try cat memory/graph/find/${pattern} to explore.`;
  }
  if (matches.length > 1) {
    const lines = [`"${pattern}" matches ${matches.length} nodes — be more specific:`, ""];
    for (const m of matches.slice(0, 20)) lines.push(`  ${m.id}`);
    if (matches.length > 20) lines.push(`  ... and ${matches.length - 20} more`);
    return lines.join("\n");
  }
  const target = matches[0]!;

  // Reverse-edge BFS from the single target (shared with impactedNodes).
  const { depthOf, viaOf } = reverseBfs(snap, [target.id]);

  // Collect dependents (everything except the target itself), by depth.
  const dependents = [...depthOf.entries()].filter(([id]) => id !== target.id);
  const total = dependents.length;

  const lines: string[] = [];
  lines.push(`Impact of ${target.id}`);
  if (target.signature) lines.push(`  ${target.signature}`);
  lines.push("");
  if (total === 0) {
    lines.push("No resolved dependents — nothing in the graph reaches this symbol.");
    lines.push("(Cross-file resolution is partial; this is a lower bound, not proof it's unused.)");
    return lines.join("\n");
  }

  lines.push(`${total} dependent${total === 1 ? "" : "s"} (transitive), by depth:`);
  lines.push("");

  // Group by depth, sorted; within a depth, sort by id.
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of dependents) {
    const list = byDepth.get(d) ?? [];
    list.push(id);
    byDepth.set(d, list);
  }
  let shown = 0;
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const ids = byDepth.get(d)!.sort();
    lines.push(`  depth ${d} (${ids.length}):`);
    for (const id of ids) {
      if (shown >= IMPACT_CAP) break;
      const via = viaOf.get(id);
      const tag = via ? `  [${via.rel} → ${via.from}]` : "";
      lines.push(`    ${id}${tag}`);
      shown++;
    }
    if (shown >= IMPACT_CAP) break;
  }
  if (total > shown) lines.push(`  ... and ${total - shown} more`);
  lines.push("");
  lines.push("Note: only RESOLVED edges are traversed (cross-file resolution is partial),");
  lines.push("so this is a lower bound on impact, not a completeness guarantee.");
  return lines.join("\n");
}
