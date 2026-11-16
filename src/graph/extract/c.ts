/**
 * C extractor (Phase 1.5).
 * Extracts: function definitions, struct/union/enum type declarations,
 * #include directives, intra-file calls.
 *
 * C function names are nested inside declarators:
 *   function_definition → declarator: function_declarator → declarator: identifier
 * Pointer-receiver variants add layers of pointer_declarator.
 */

import C from "tree-sitter-c";
import type { FileExtraction, GraphNode } from "../types.js";
import {
  collectParseErrors,
  getParser,
  locationStr,
  makeModuleNode,
  makeNode,
  parseWithChunks,
  pushNode,
  type TSNode,
} from "./shared.js";

const LANG = "c" as const;

export function extractC(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(C as object), sourceCode);
  const root = tree.rootNode;

  const result: FileExtraction = {
    source_file: relativePath,
    language: LANG,
    nodes: [],
    edges: [],
    parse_errors: [],
  };
  collectParseErrors(root, relativePath, result.parse_errors);

  const moduleNode = makeModuleNode(relativePath, LANG);
  result.nodes.push(moduleNode);

  const declByName = new Map<string, GraphNode>();
  collectDecls(root, relativePath, result, declByName, moduleNode);
  collectCalls(root, result, declByName);

  return result;
}

// ─── Pass 1 + 2 ────────────────────────────────────────────────────────────

// Function nodes that so far only come from a prototype. A later definition
// of the same function takes over the node's source_location so anchors hash
// the body rather than the one-line prototype.
const prototypeNodes = new WeakSet<GraphNode>();

export function collectDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null) continue;

    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      if (name === null) continue;
      const fnNode = makeNode(relativePath, name, "function", child, true, LANG);
      const proto = result.nodes.find((n) => n.id === fnNode.id);
      if (proto !== undefined && prototypeNodes.has(proto)) {
        // Same node object stays in declByName, so call edges are unaffected.
        proto.source_location = fnNode.source_location;
        prototypeNodes.delete(proto);
      } else {
        pushNode(result, declByName, fnNode);
      }
    } else if (child.type === "declaration") {
      // typedef struct / forward declarations for functions
      const name = extractDeclName(child);
      if (name !== null) {
        const protoNode = makeNode(relativePath, name, "function", child, true, LANG);
        pushNode(result, declByName, protoNode);
        if (result.nodes.includes(protoNode)) prototypeNodes.add(protoNode);
      }
    } else if (
      child.type === "struct_specifier" ||
      child.type === "union_specifier" ||
      child.type === "enum_specifier"
    ) {
      const name = child.childForFieldName("name")?.text ?? null;
      if (name !== null && name.length > 0) {
        pushNode(result, declByName, makeNode(relativePath, name, "class", child, true, LANG));
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED",
          });
        }
      }
    } else {
      // Recurse into preprocessor conditionals (#ifdef, #if, preproc_if*),
      // typedef wrappers, and other container nodes so nested declarations
      // and includes are not silently dropped.
      collectDecls(child, relativePath, result, declByName, moduleNode);
    }
  }
}

/** Drill through function_declarator / pointer_declarator to find the identifier. */
export function extractFunctionName(fnDef: TSNode): string | null {
  const topDecl = fnDef.childForFieldName("declarator");
  if (topDecl === null) return null;
  return drillToIdentifier(topDecl);
}

function drillToIdentifier(node: TSNode): string | null {
  if (node.type === "identifier") return node.text;
  if (
    node.type === "function_declarator" ||
    node.type === "pointer_declarator" ||
    node.type === "parenthesized_declarator"
  ) {
    const inner = node.childForFieldName("declarator");
    if (inner !== null) return drillToIdentifier(inner);
  }
  return null;
}

function extractDeclName(decl: TSNode): string | null {
  // Only emit if this declaration looks like a function prototype
  for (let i = 0; i < decl.namedChildCount; i++) {
    const child = decl.namedChild(i);
    if (child === null) continue;
    if (child.type === "function_declarator") {
      return drillToIdentifier(child);
    }
  }
  return null;
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

export function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn(node, declByName);
      if (target !== undefined && caller !== null) {
        result.edges.push({
          source: caller.id,
          target: target.id,
          relation: "calls",
          confidence: "EXTRACTED",
        });
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectCalls(child, result, declByName);
  }
}

export function findEnclosingFn(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_definition") {
      const name = extractFunctionName(cur);
      if (name !== null) {
        const found = declByName.get(name);
        if (found !== undefined) return found;
      }
    }
    cur = cur.parent;
  }
  return null;
}
