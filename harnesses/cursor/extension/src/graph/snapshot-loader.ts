import type { DashboardDataEnvelope } from "../webview/data-bridge";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./types";

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isGraphSnapshotLike(raw: unknown): raw is GraphSnapshot {
  if (!isObject(raw)) return false;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.links)) return false;
  return raw.directed === true && raw.multigraph === true && isObject(raw.graph);
}

/** Load a typed graph snapshot from a dashboard data envelope. */
export function loadGraphSnapshotFromEnvelope(envelope: DashboardDataEnvelope): GraphSnapshot | null {
  if (!envelope.graph?.snapshot) return null;
  return parseGraphSnapshot(envelope.graph.snapshot);
}

/** Parse and validate a raw snapshot payload from disk or the webview bridge. */
export function parseGraphSnapshot(raw: unknown): GraphSnapshot | null {
  if (!isGraphSnapshotLike(raw)) return null;
  const nodes: GraphNode[] = [];
  for (const n of raw.nodes) {
    if (!isObject(n)) continue;
    const id = typeof n.id === "string" ? n.id : null;
    const label = typeof n.label === "string" ? n.label : null;
    const kind = typeof n.kind === "string" ? n.kind : null;
    const source_file = typeof n.source_file === "string" ? n.source_file : null;
    const source_location = typeof n.source_location === "string" ? n.source_location : null;
    const language = typeof n.language === "string" ? n.language : null;
    if (!id || !label || !kind || !source_file || !source_location || !language) continue;
    nodes.push({
      id,
      label,
      kind: kind as GraphNode["kind"],
      source_file,
      source_location,
      language: language as GraphNode["language"],
      exported: Boolean(n.exported),
      signature: typeof n.signature === "string" ? n.signature : undefined,
      doc: typeof n.doc === "string" ? n.doc : undefined,
      fan_in: typeof n.fan_in === "number" ? n.fan_in : undefined,
      fan_out: typeof n.fan_out === "number" ? n.fan_out : undefined,
      is_entrypoint: typeof n.is_entrypoint === "boolean" ? n.is_entrypoint : undefined,
    });
  }
  if (nodes.length === 0 && raw.nodes.length > 0) return null;

  const links: GraphEdge[] = [];
  for (const l of raw.links) {
    if (!isObject(l)) continue;
    const source = typeof l.source === "string" ? l.source : null;
    const target = typeof l.target === "string" ? l.target : null;
    const relation = typeof l.relation === "string" ? l.relation : null;
    if (!source || !target || !relation) continue;
    links.push({
      source,
      target,
      relation: relation as GraphEdge["relation"],
      confidence: typeof l.confidence === "string" ? (l.confidence as GraphEdge["confidence"]) : undefined,
      ord: typeof l.ord === "number" ? l.ord : undefined,
    });
  }

  const graph = raw.graph;
  return {
    directed: true,
    multigraph: true,
    graph: {
      schema_version: 1,
      generator: "hivemind-graph",
      commit_sha: typeof graph.commit_sha === "string" || graph.commit_sha === null ? graph.commit_sha : null,
      repo_key: typeof graph.repo_key === "string" ? graph.repo_key : "",
    },
    observation: isObject(raw.observation)
      ? (raw.observation as GraphSnapshot["observation"])
      : {
          ts: new Date().toISOString(),
          branch: null,
          worktree_path: "",
          repo_project: "",
          generator_version: "unknown",
          source_files_extracted: 0,
          source_files_skipped: 0,
        },
    nodes,
    links,
  };
}
