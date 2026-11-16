/**
 * Rust extractor (Phase 1.5).
 * Extracts: fn items, struct/enum/trait items (mapped to class/interface),
 * impl block methods, mod items, use declarations, intra-file calls.
 */

import Rust from "tree-sitter-rust";
import type { FileExtraction, GraphNode } from "../types.js";
import {
  collectParseErrors,
  getParser,
  locationStr,
  makeModuleNode,
  makeNode,
  nodeId,
  parseWithChunks,
  pushNode,
  textOfField,
  type TSNode,
} from "./shared.js";

const LANG = "rust" as const;

export function extractRust(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Rust as object), sourceCode);
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
  const impls: ImplState = { fnByDecl: new Map(), ownerTypes: new Map(), pendingOwners: [] };
  collectDecls(root, relativePath, result, declByName, moduleNode, impls, "");
  linkImplOwners(result, impls);
  collectCalls(root, result, declByName, impls);

  return result;
}

/**
 * Impl bookkeeping shared by the declaration and call passes.
 * - fnByDecl: function_item start position → the node declared for it, so a
 *   caller resolves to its own declaration instead of a same-named function.
 * - ownerTypes: struct/enum declared in this file, keyed by inline-module
 *   scope + name, so an impl only links to a type in its own module.
 * - pendingOwners: method_of edges awaiting their owner's local type node,
 *   resolved after all decls so a type declared below its impl still links.
 */
interface ImplState {
  fnByDecl: Map<string, GraphNode>;
  ownerTypes: Map<string, string>;
  pendingOwners: { owner: string; method: string }[];
}

function declPos(node: TSNode): string {
  return `${node.startPosition.row}:${node.startPosition.column}`;
}

function scopedName(scope: string, name: string): string {
  return `${scope}::${name}`;
}

function pushFn(
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  impls: ImplState,
  decl: TSNode,
  node: GraphNode,
  lookupKey?: string,
): void {
  // On an id collision pushNode keeps the first node; attribute calls to it.
  const existing = result.nodes.find((n) => n.id === node.id);
  pushNode(result, declByName, node, lookupKey);
  impls.fnByDecl.set(declPos(decl), existing ?? node);
}

function pushOwnerType(
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  impls: ImplState,
  scope: string,
  node: GraphNode,
): void {
  pushNode(result, declByName, node);
  const key = scopedName(scope, node.label);
  if (!impls.ownerTypes.has(key)) impls.ownerTypes.set(key, node.id);
}

// ─── Pass 1 + 2 ────────────────────────────────────────────────────────────

function collectDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
  impls: ImplState,
  scope: string,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    if (child.type === "function_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const exported = isRustPub(child);
      pushFn(result, declByName, impls, child, makeNode(relativePath, name, "function", child, exported, LANG));
    } else if (child.type === "struct_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushOwnerType(result, declByName, impls, scope, makeNode(relativePath, name, "class", child, isRustPub(child), LANG));
    } else if (child.type === "enum_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushOwnerType(result, declByName, impls, scope, makeNode(relativePath, name, "enum", child, isRustPub(child), LANG));
    } else if (child.type === "trait_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "interface", child, isRustPub(child), LANG));
    } else if (child.type === "impl_item") {
      collectImplMethods(child, relativePath, result, declByName, impls, scope);
    } else if (child.type === "mod_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "module", child, isRustPub(child), LANG));
      // recurse into inline module body
      const body = child.childForFieldName("body");
      /* c8 ignore next */
      if (body !== null) {
        collectDecls(body, relativePath, result, declByName, moduleNode, impls, scopedName(scope, name));
      }
    } else if (child.type === "use_declaration") {
      collectUseDecl(child, result, moduleNode);
    } else /* c8 ignore next */ if (child.type === "const_item") {
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "const", child, isRustPub(child), LANG));
    }
  }
}

function isRustPub(node: TSNode): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && child.type === "visibility_modifier") return true;
  }
  return false;
}

/**
 * Method identity is the impl's own spelling: `Rect::area` for an inherent
 * impl, `Box<i32>::get` vs `Box<u32>::get` for specialized impls, and
 * `<A as Display>::fmt` vs `<A as Debug>::fmt` for trait impls so neither
 * definition is lost. Only the base type (`Wrapper<T>` → `Wrapper`) is used
 * to link method_of, and only to a struct/enum declared in the same inline
 * module of this file. Scoped, reference and other types get no owner.
 *
 * Known limitations (AST only, no name resolution): spelling is textual, so
 * `Self`, type aliases and differently-qualified paths to one type are not
 * unified; inline-module paths are not part of ids, so same-named items in
 * sibling `mod` blocks share one node (as free fns already do); an impl of a
 * type brought in with `use` is not linked to that type.
 */
function collectImplMethods(
  impl: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  impls: ImplState,
  scope: string,
): void {
  // impl_item → optional trait field, type field (the type being
  // implemented) + declaration_list body
  const typeNode = impl.childForFieldName("type");
  const body = impl.childForFieldName("body");
  /* c8 ignore next */
  if (typeNode === null || body === null) return;

  const typeText = implSpelling(typeNode);
  const traitNode = impl.childForFieldName("trait");
  const keyPrefix = traitNode === null ? typeText : `<${typeText} as ${implSpelling(traitNode)}>`;
  const ownerName = implBaseTypeName(typeNode);

  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (member?.type !== "function_item") continue;
    const name = textOfField(member, "name");
    /* c8 ignore next */
    if (name === null) continue;
    const key = `${keyPrefix}::${name}`;
    const methodNode: GraphNode = {
      id: nodeId(relativePath, key, "method"),
      label: name,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr(member),
      language: LANG,
      exported: isRustPub(member),
    };
    pushFn(result, declByName, impls, member, methodNode, key);
    if (ownerName !== null) {
      impls.pendingOwners.push({ owner: scopedName(scope, ownerName), method: methodNode.id });
    }
  }
}

/** Source spelling of an impl type/trait; preserve literal contents exactly. */
function implSpelling(node: TSNode): string {
  return node.text.trim();
}

function implBaseTypeName(typeNode: TSNode): string | null {
  const base = typeNode.type === "generic_type" ? typeNode.childForFieldName("type") : typeNode;
  return base?.type === "type_identifier" ? base.text : null;
}

/** Emit method_of only for owners declared as a struct or enum in the impl's module. */
function linkImplOwners(result: FileExtraction, impls: ImplState): void {
  const seen = new Set<string>();
  for (const { owner, method } of impls.pendingOwners) {
    const source = impls.ownerTypes.get(owner);
    if (source === undefined || seen.has(method)) continue;
    seen.add(method);
    result.edges.push({ source, target: method, relation: "method_of", confidence: "EXTRACTED" });
  }
}

function collectUseDecl(
  node: TSNode,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  // use std::io::Read → extract the path prefix
  const arg = node.childForFieldName("argument");
  /* c8 ignore next */
  if (arg === null) return;
  const path = extractUsePath(arg);
  /* c8 ignore next */
  if (path.length > 0) {
    result.edges.push({
      source: moduleNode.id,
      target: `external:${path}`,
      relation: "imports",
      confidence: "EXTRACTED",
    });
  }
}

function extractUsePath(node: TSNode): string {
  if (node.type === "scoped_identifier" || node.type === "scoped_use_list") {
    const path = node.childForFieldName("path");
    const name = node.childForFieldName("name");
    /* c8 ignore next */
    const pathStr = path !== null ? extractUsePath(path) : "";
    const nameStr = name !== null ? name.text : "";
    return pathStr.length > 0 && nameStr.length > 0
      ? `${pathStr}::${nameStr}`
      /* c8 ignore next */
      : pathStr || nameStr;
  }
  /* c8 ignore next */
  if (node.type === "identifier" || node.type === "self") return node.text;
  /* c8 ignore next */
  return "";
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  impls: ImplState,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    /* c8 ignore next */
    if (fn !== null && fn.type === "identifier") {
      const target = declByName.get(fn.text);
      const caller = findEnclosingFn(node, impls);
      /* c8 ignore next */
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
    /* c8 ignore next */
    if (child !== null) collectCalls(child, result, declByName, impls);
  }
}

function findEnclosingFn(
  node: TSNode,
  impls: ImplState,
): GraphNode | null {
  // The nearest enclosing callable owns the call, resolved by declaration
  // position, not name: `A::new`, `B::new` and a free `new` are distinct
  // callers. Nested fns, closures and trait default bodies have no node of
  // their own, so their calls are dropped rather than credited to an outer fn.
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_item") return impls.fnByDecl.get(declPos(cur)) ?? null;
    if (cur.type === "closure_expression") return null;
    cur = cur.parent;
  }
  return null;
}
