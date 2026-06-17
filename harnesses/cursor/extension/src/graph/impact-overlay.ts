import { execFileSync } from "node:child_process";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./types";

const IMPACT_CAP = 80;
const MAX_DEPTH = 25;

const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.py", "*.pyi", ":(exclude)*.d.ts"];

export interface ImpactNodeEntry {
  id: string;
  depth: number;
  via?: { rel: string; from: string };
}

export interface ImpactOverlayResult {
  changedFiles: string[];
  originNodeIds: string[];
  dependents: ImpactNodeEntry[];
  totalDependents: number;
  capped: boolean;
  caveat: string;
}

function listUnstagedSourceFiles(cwd: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", "--", ...SOURCE_GLOBS], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return [];
    return out.split(/\r?\n/).map((f) => f.replace(/\\/g, "/")).filter(Boolean);
  } catch {
    return [];
  }
}

function reverseBfsFromOrigins(
  snap: GraphSnapshot,
  originIds: string[],
): { dependents: ImpactNodeEntry[]; total: number; capped: boolean } {
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of snap.links) {
    if (!nodeIds.has(e.source)) continue;
    const list = incoming.get(e.target);
    if (list) list.push(e);
    else incoming.set(e.target, [e]);
  }

  const depthOf = new Map<string, number>();
  const viaOf = new Map<string, { rel: string; from: string }>();
  let frontier = [...new Set(originIds)].filter((id) => nodeIds.has(id));
  for (const id of frontier) depthOf.set(id, 0);

  let depth = 0;
  while (frontier.length > 0 && depth < MAX_DEPTH) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      const edges = (incoming.get(id) ?? []).slice().sort((a, b) =>
        a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation));
      for (const e of edges) {
        if (depthOf.has(e.source)) continue;
        depthOf.set(e.source, depth);
        viaOf.set(e.source, { rel: e.relation, from: id });
        next.push(e.source);
      }
    }
    next.sort();
    frontier = next;
  }

  const dependents: ImpactNodeEntry[] = [];
  for (const [id, d] of depthOf.entries()) {
    if (originIds.includes(id)) continue;
    dependents.push({ id, depth: d, via: viaOf.get(id) });
  }
  dependents.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  const total = dependents.length;
  const capped = total > IMPACT_CAP;
  return {
    dependents: dependents.slice(0, IMPACT_CAP),
    total,
    capped,
  };
}

/** Compute git-diff-based impact visualization data for the graph canvas. */
export function computeImpactOverlay(snapshot: GraphSnapshot, cwd: string): ImpactOverlayResult {
  const changedFiles = listUnstagedSourceFiles(cwd);
  const originNodeIds = snapshot.nodes
    .filter((n) => changedFiles.includes(n.source_file))
    .map((n) => n.id)
    .sort();

  const caveat =
    "Resolved graph edges only; real impact may be larger. Unstaged source changes mapped by file path.";

  if (changedFiles.length === 0) {
    return {
      changedFiles: [],
      originNodeIds: [],
      dependents: [],
      totalDependents: 0,
      capped: false,
      caveat,
    };
  }

  if (originNodeIds.length === 0) {
    return {
      changedFiles,
      originNodeIds: [],
      dependents: [],
      totalDependents: 0,
      capped: false,
      caveat: `${caveat} Changed files have no matching graph nodes (new file or rebuild needed).`,
    };
  }

  const { dependents, total, capped } = reverseBfsFromOrigins(snapshot, originNodeIds);
  return {
    changedFiles,
    originNodeIds,
    dependents,
    totalDependents: total,
    capped,
    caveat,
  };
}

export function nodesById(snapshot: GraphSnapshot): Map<string, GraphNode> {
  return new Map(snapshot.nodes.map((n) => [n.id, n]));
}
