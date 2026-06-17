export type NodeKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type_alias"
  | "enum"
  | "const"
  | "module";

export type EdgeRelation = "imports" | "calls" | "extends" | "implements" | "method_of";

export type EdgeConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  source_file: string;
  source_location: string;
  language: string;
  exported: boolean;
  signature?: string;
  doc?: string;
  fan_in?: number;
  fan_out?: number;
  is_entrypoint?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence?: EdgeConfidence;
  ord?: number;
}

export interface GraphSnapshot {
  directed: true;
  multigraph: true;
  graph: {
    schema_version: number;
    generator: string;
    commit_sha: string | null;
    repo_key: string;
  };
  observation?: Record<string, unknown>;
  nodes: GraphNode[];
  links: GraphEdge[];
}
