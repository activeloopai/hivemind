/**
 * C++ extractor (Phase 1.5).
 * Builds on the C extractor and adds: class_specifier, namespace_definition,
 * template_declaration unwrapping, and qualified method names.
 */

import Cpp from "tree-sitter-cpp";
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
import {
  collectCalls as collectCCalls,
  collectDecls as collectCDecls,
  extractFunctionName,
  findEnclosingFn as findCEnclosingFn,
} from "./c.js";

const LANG = "cpp" as const;

export function extractCpp(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(Cpp as object), sourceCode);
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
  // function_definition start position → the node emitted for it, so callers
  // are identified by their exact declaration rather than a bare-name lookup.
  const fnDeclByPos = new Map<string, GraphNode>();
  collectCppDecls(root, relativePath, result, declByName, fnDeclByPos, moduleNode, null);
  collectCppCalls(root, result, declByName, fnDeclByPos, new Map());

  return result;
}

// ─── Pass 1 + 2 ────────────────────────────────────────────────────────────

function collectCppDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  fnDeclByPos: Map<string, GraphNode>,
  moduleNode: GraphNode,
  enclosingClass: string | null,
  enclosingNamespace: string | null = null,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    if (child.type === "function_definition") {
      const name = extractFunctionName(child);
      /* c8 ignore next */
      if (name === null) continue;
      const nsPrefix = enclosingNamespace !== null ? `${enclosingNamespace}::` : "";
      /* c8 ignore next */
      const key = enclosingClass !== null ? `${nsPrefix}${enclosingClass}::${name}` : `${nsPrefix}${name}`;
      /* c8 ignore next */
      const kind = enclosingClass !== null ? "method" : "function";
      const decl: GraphNode = {
        id: nodeId(relativePath, key, kind),
        label: name,
        kind,
        source_file: relativePath,
        source_location: locationStr(child),
        language: LANG,
        exported: true,
      };
      // pushNode dedups by id (e.g. overloads), so map to the node actually kept.
      const kept = result.nodes.find((n) => n.id === decl.id);
      pushNode(result, declByName, decl, key);
      fnDeclByPos.set(posKey(child), kept ?? decl);
      /* c8 ignore next */
      if (enclosingClass !== null) {
        result.edges.push({
          source: nodeId(relativePath, enclosingClass, "class"),
          target: decl.id,
          relation: "method_of",
          confidence: "EXTRACTED",
        });
      }
    } else if (child.type === "class_specifier" || child.type === "struct_specifier") {
      /* c8 ignore next */
      const name = child.childForFieldName("name")?.text ?? null;
      /* c8 ignore next */
      if (name !== null && name.length > 0) {
        const classDecl = makeNode(relativePath, name, "class", child, true, LANG);
        pushNode(result, declByName, classDecl);
        // recurse into class body
        const body = child.childForFieldName("body");
        /* c8 ignore next */
        if (body !== null) {
          collectCppDecls(body, relativePath, result, declByName, fnDeclByPos, moduleNode, name, enclosingNamespace);
        }
      }
    } else if (child.type === "namespace_definition") {
      // Anonymous namespaces have no name field and add no qualifier.
      const name = child.childForFieldName("name")?.text ?? "";
      let ns = enclosingNamespace;
      if (name.length > 0) {
        // Compose the full path (outer::inner, or the C++17 `A::B` spelling) so
        // A::detail and B::detail stay distinct. namespacePath() mirrors this.
        ns = enclosingNamespace !== null ? `${enclosingNamespace}::${name}` : name;
        pushNode(result, declByName, makeNode(relativePath, ns, "module", child, true, LANG));
      }
      const body = child.childForFieldName("body");
      /* c8 ignore next */
      if (body !== null) {
        // Declarations inside are keyed as `full::ns::symbol`, matching the
        // `scope::name` format used by collectCppCalls for qualified calls.
        collectCppDecls(body, relativePath, result, declByName, fnDeclByPos, moduleNode, enclosingClass, ns);
      }
    } else if (child.type === "template_declaration") {
      // Unwrap template to get the underlying declaration
      for (let j = 0; j < child.namedChildCount; j++) {
        const inner = child.namedChild(j);
        /* c8 ignore next */
        if (inner === null) continue;
        if (
          inner.type === "function_definition" ||
          inner.type === "class_specifier" ||
          inner.type === "struct_specifier"
        ) {
          // recurse treating it as a regular child
          const wrapper = {
            ...node,
            namedChildCount: 1,
            namedChild: (_: number) => inner,
            namedChildren: [inner],
          } as unknown as TSNode;
          collectCppDecls(wrapper, relativePath, result, declByName, fnDeclByPos, moduleNode, enclosingClass, enclosingNamespace);
        }
      }
    } else if (child.type === "preproc_include") {
      const path = child.childForFieldName("path");
      /* c8 ignore next */
      if (path !== null) {
        const raw = path.text.replace(/^["<]|[">]$/g, "");
        /* c8 ignore next */
        if (raw.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${raw}`,
            relation: "imports",
            confidence: "EXTRACTED",
          });
        }
      }
    } else /* c8 ignore next */ if (child.type === "using_declaration") {
      // using namespace std; or using std::vector;
      const name = child.text.replace(/^using\s+(namespace\s+)?/, "").replace(/;$/, "").trim();
      /* c8 ignore next */
      if (name.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${name}`,
          relation: "imports",
          confidence: "EXTRACTED",
        });
      }
    } else {
      // recurse into field_declaration_list, translation_unit, etc.
      collectCppDecls(child, relativePath, result, declByName, fnDeclByPos, moduleNode, enclosingClass, enclosingNamespace);
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCppCalls(
  node: TSNode,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  fnDeclByPos: Map<string, GraphNode>,
  bindingCache: Map<string, Set<string>>,
): void {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    /* c8 ignore next */
    if (fn !== null) {
      let key: string | null = null;
      // bare: unqualified name, subject to local shadowing.
      // scoped: looked up relative to the enclosing namespaces first.
      let bare = false;
      let scoped = false;
      if (fn.type === "identifier") {
        key = fn.text;
        bare = true;
        scoped = true;
      } else if (fn.type === "field_expression") {
        const field = fn.childForFieldName("field");
        const obj = fn.childForFieldName("argument");
        /* c8 ignore next */
        if (field !== null && (obj === null || obj.type === "this")) {
          const cn = findEnclosingClass(fn);
          /* c8 ignore next */
          key = cn !== null ? `${cn}::${field.text}` : field.text;
        }
      } else if (fn.type === "qualified_identifier") {
        // Foo::bar(), or ::bar() / ::Foo::bar() with no scope field.
        const scope = fn.childForFieldName("scope");
        const name = fn.childForFieldName("name");
        /* c8 ignore next */
        if (name !== null) {
          // A leading `::` names the global scope explicitly, so it is never
          // resolved relative to the enclosing namespace.
          key = scope !== null ? `${scope.text}::${name.text}` : name.text;
          scoped = scope !== null;
        }
      }
      if (key !== null) {
        const caller = findCaller(fn, fnDeclByPos);
        // A parameter or local of the same name shadows every outer function.
        if (caller !== null && !(bare && localBindings(caller.def, bindingCache).has(key))) {
          const target = scoped ? resolveScopedCallee(fn, key, declByName) : declByName.get(key);
          if (target !== undefined) {
            result.edges.push({
              source: caller.decl.id,
              target: target.id,
              relation: "calls",
              confidence: "EXTRACTED",
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child !== null) collectCppCalls(child, result, declByName, fnDeclByPos, bindingCache);
  }
}

function posKey(node: TSNode): string {
  return `${node.startPosition.row}:${node.startPosition.column}`;
}

/**
 * Full namespace path of a node, outermost first, composed exactly like the
 * keys built by collectCppDecls (anonymous namespaces add nothing; a C++17
 * `namespace A::B` contributes both `A` and `B`).
 */
function namespacePath(node: TSNode): string[] {
  const parts: string[] = [];
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "namespace_definition") {
      const ns = cur.childForFieldName("name")?.text ?? "";
      if (ns.length > 0) parts.unshift(...ns.split("::"));
    }
    cur = cur.parent;
  }
  return parts;
}

/**
 * Resolve a callee written without a leading `::` the way C++ lookup walks
 * scopes: innermost enclosing namespace first, then outer namespaces, then
 * the global key. This is name lookup only — no type or overload inference.
 */
function resolveScopedCallee(
  node: TSNode,
  key: string,
  declByName: Map<string, GraphNode>,
): GraphNode | undefined {
  const parts = namespacePath(node);
  for (let i = parts.length; i > 0; i--) {
    const found = declByName.get(`${parts.slice(0, i).join("::")}::${key}`);
    // Namespace-prefixed keys also name nested namespace (module) nodes.
    if (found !== undefined && (found.kind === "function" || found.kind === "method")) return found;
  }
  return declByName.get(key);
}

// Nodes whose declarator children introduce a local name: variables, the
// callable's own and catch/lambda parameters, and range-for variables.
const BINDING_TYPES = new Set([
  "declaration",
  "parameter_declaration",
  "optional_parameter_declaration",
  "for_range_loop",
]);

const DECLARATOR_WRAPPERS = new Set([
  "init_declarator",
  "pointer_declarator",
  "reference_declarator",
  "array_declarator",
  "function_declarator",
  "parenthesized_declarator",
]);

/** Collect names introduced by a declarator without traversing its initializer. */
function declaratorNames(node: TSNode | null | undefined, names: Set<string>): void {
  if (node == null) return;
  if (node.type === "identifier") {
    names.add(node.text);
    return;
  }
  if (node.type === "structured_binding_declarator") {
    for (const child of node.namedChildren) {
      if (child.type === "identifier") names.add(child.text);
    }
    return;
  }
  if (!DECLARATOR_WRAPPERS.has(node.type)) return;
  // Partial buffers may lack the inner declarator entirely.
  declaratorNames(node.childForFieldName("declarator") ?? node.namedChildren[node.namedChildCount - 1], names);
}

function collectBindings(node: TSNode, names: Set<string>): Set<string> {
  for (const child of node.namedChildren) {
    if (BINDING_TYPES.has(node.type)) {
      declaratorNames(child, names);
    }
    collectBindings(child, names);
  }
  return names;
}

/**
 * Every name a function definition binds locally, anywhere in its body.
 * Deliberately conservative: a same-named local in any block (or declared
 * after the call) suppresses the edge rather than risk inventing one.
 */
function localBindings(def: TSNode, cache: Map<string, Set<string>>): Set<string> {
  const key = posKey(def);
  let names = cache.get(key);
  if (names === undefined) {
    names = collectBindings(def, new Set());
    cache.set(key, names);
  }
  return names;
}

function findEnclosingClass(node: TSNode): string | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "class_specifier" || cur.type === "struct_specifier") {
      /* c8 ignore next */
      return cur.childForFieldName("name")?.text ?? null;
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}

/**
 * The graph node for the callable whose body lexically contains `node`.
 * Only the innermost callable counts: a call inside a lambda or a skipped
 * definition (inline/local class methods, out-of-class `C::m`) belongs to that
 * unrepresented body, so it is dropped rather than credited to an outer function.
 */
function findCaller(
  node: TSNode,
  fnDeclByPos: Map<string, GraphNode>,
): { def: TSNode; decl: GraphNode } | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "lambda_expression") return null;
    if (cur.type === "function_definition") {
      const decl = fnDeclByPos.get(posKey(cur));
      return decl !== undefined ? { def: cur, decl } : null;
    }
    cur = cur.parent;
  }
  return null;
}
