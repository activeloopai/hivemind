/**
 * Doc drift detection — which docs are stale after a code change, and why.
 *
 * Two complementary signals:
 *
 *   1. DIRECT (hash): a doc's own anchored symbol changed. Re-read the
 *      symbol's source slice now, hash it, compare to the stored anchor hash.
 *      This catches MODIFIED bodies that `diffSnapshots` misses (a symbol
 *      whose id is unchanged but whose code changed is neither "added" nor
 *      "removed" in a node-id set diff).
 *
 *   2. RELATIONAL (blast radius): a doc whose anchored symbol is a transitive
 *      CALLER of a changed symbol. The caller's own source may be byte-for-byte
 *      identical (so the hash check passes), yet its doc can be wrong because
 *      the thing it calls changed shape. We widen from changed symbols to
 *      their dependents over the graph's reverse edges (`impactedNodes`).
 *
 * The orchestrator `computeImpactedDocs` unions both. It is the work-list
 * generator for the doc-refresh worker (Phase 1 step 5): "these docs, for
 * these reasons, need regenerating — and only these."
 */

import type { GraphSnapshot, GraphNode } from "../graph/types.js";
import type { SnapshotDiff } from "../graph/diff.js";
import { impactedNodes } from "../graph/render/impact.js";
import { computeSymbolHash } from "./anchors.js";
import type { DocRow } from "./read.js";

export type StaleReason =
  /** The doc's own anchored symbol's source changed since the anchor was taken. */
  | { kind: "code_changed"; symbol_id: string }
  /** The doc's anchored symbol no longer exists in the graph (removed/renamed). */
  | { kind: "symbol_missing"; symbol_id: string }
  /** The anchored symbol is a transitive caller of a symbol that changed. */
  | { kind: "caller_changed"; symbol_id: string };

export interface ImpactedDoc {
  doc_id: string;
  reasons: StaleReason[];
}

/**
 * DIRECT staleness — docs whose own anchored code changed or whose symbol
 * vanished. Pure over (snapshot, working tree): does not need a previous
 * snapshot, because the anchor hash already encodes "the code as it was".
 */
export function computeStaleDocs(args: {
  snap: GraphSnapshot;
  docs: DocRow[];
  repoRoot: string;
}): ImpactedDoc[] {
  const nodeById = new Map<string, GraphNode>(args.snap.nodes.map((n) => [n.id, n]));
  const out: ImpactedDoc[] = [];
  for (const doc of args.docs) {
    const reasons: StaleReason[] = [];
    for (const anchor of doc.anchors) {
      const node = nodeById.get(anchor.symbol_id);
      if (!node) {
        reasons.push({ kind: "symbol_missing", symbol_id: anchor.symbol_id });
        continue;
      }
      const current = computeSymbolHash(node, args.repoRoot);
      if (current === null) {
        // Source unreadable at the recorded location — treat as missing so the
        // worker re-anchors rather than silently trusting a stale hash.
        reasons.push({ kind: "symbol_missing", symbol_id: anchor.symbol_id });
        continue;
      }
      if (current !== anchor.content_hash) {
        reasons.push({ kind: "code_changed", symbol_id: anchor.symbol_id });
      }
    }
    if (reasons.length > 0) out.push({ doc_id: doc.doc_id, reasons });
  }
  return out;
}

/**
 * RELATIONAL widening — docs whose anchored symbol is a transitive caller of
 * one of `changedSymbolIds`. Excludes the changed symbols themselves (those
 * are already reported by `computeStaleDocs`'s direct hash check), so the two
 * passes don't double-attribute the same cause.
 */
export function widenByBlastRadius(args: {
  snap: GraphSnapshot;
  changedSymbolIds: Iterable<string>;
  docs: DocRow[];
}): ImpactedDoc[] {
  const changed = new Set(args.changedSymbolIds);
  if (changed.size === 0) return [];
  const closure = impactedNodes(args.snap, changed); // dependents + seeds
  const out: ImpactedDoc[] = [];
  for (const doc of args.docs) {
    const reasons: StaleReason[] = [];
    for (const anchor of doc.anchors) {
      if (closure.has(anchor.symbol_id) && !changed.has(anchor.symbol_id)) {
        reasons.push({ kind: "caller_changed", symbol_id: anchor.symbol_id });
      }
    }
    if (reasons.length > 0) out.push({ doc_id: doc.doc_id, reasons });
  }
  return out;
}

/**
 * Full impacted set for a commit delta = DIRECT ∪ RELATIONAL.
 *
 * The blast-radius is seeded by the union of:
 *   - structural changes from `diff` (added/removed node ids), if provided,
 *   - anchored symbols the direct pass found `code_changed`.
 *
 * Reasons for the same doc_id are merged. The result is deduped by doc_id.
 */
export function computeImpactedDocs(args: {
  snap: GraphSnapshot;
  docs: DocRow[];
  repoRoot: string;
  /** Optional structural diff to seed relational widening with non-anchored changes. */
  diff?: SnapshotDiff | null;
}): ImpactedDoc[] {
  const merged = new Map<string, StaleReason[]>();
  const add = (d: ImpactedDoc): void => {
    const cur = merged.get(d.doc_id);
    if (cur) cur.push(...d.reasons);
    else merged.set(d.doc_id, [...d.reasons]);
  };

  // 1. Direct hash staleness.
  const direct = computeStaleDocs({ snap: args.snap, docs: args.docs, repoRoot: args.repoRoot });
  for (const d of direct) add(d);

  // 2. Seed the blast radius: structural diff + directly-changed anchored symbols.
  const seeds = new Set<string>();
  if (args.diff) {
    for (const n of args.diff.nodes.added) seeds.add(n.id);
    for (const n of args.diff.nodes.removed) seeds.add(n.id);
  }
  for (const d of direct) {
    for (const r of d.reasons) {
      if (r.kind === "code_changed") seeds.add(r.symbol_id);
    }
  }

  // 3. Relational widening.
  for (const d of widenByBlastRadius({ snap: args.snap, changedSymbolIds: seeds, docs: args.docs })) {
    add(d);
  }

  return [...merged.entries()].map(([doc_id, reasons]) => ({ doc_id, reasons }));
}
