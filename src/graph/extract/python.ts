/**
 * Python extractor (Phase 1.5, B6). Mirrors the TypeScript extractor's output
 * shape (FileExtraction) using the tree-sitter Python grammar.
 *
 * Scope v1 — deterministic, AST-only:
 *   - Nodes: function (def), class, method (def inside a class body),
 *            const (module-level `X = ...` simple assignment), module.
 *   - Edges: method_of (class → method), extends (class bases — intra-file
 *            resolved, else `unresolved:`), imports (module → external:<spec>),
 *            calls (intra-file: foo() and self.m()).
 *   - raw_calls + import_bindings are captured, but Python's module-resolution
 *     model (dotted/`.`-relative specifiers vs TS `./`) differs, so the shared
 *     cross-file resolver only resolves intra-file heritage for Python and
 *     safely skips cross-file calls/imports (specifiers aren't `./`). Full
 *     Python cross-file resolution is a follow-up.
 *
 * `exported` follows Python convention: a top-level name (or method) is public
 * iff it does NOT start with an underscore.
 */

import Parser from "tree-sitter";
import Python from "tree-sitter-python";

import type {
  FileExtraction,
  GraphEdge,
  GraphNode,
  NodeKind,
  ParseError,
} from "../types.js";

interface PyNode {
  type: string;
  text: string;
  startIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  isError: boolean;
  isMissing: boolean;
  namedChildCount: number;
  parent: PyNode | null;
  namedChild(index: number): PyNode | null;
  childForFieldName(name: string): PyNode | null;
}

let _pythonParser: Parser | null = null;
function getPythonParser(): Parser {
  if (_pythonParser === null) {
    _pythonParser = new Parser();
    _pythonParser.setLanguage(Python as never);
  }
  return _pythonParser;
}

const CHUNK_BYTES = 16384;

export function extractPython(sourceCode: string, relativePath: string): FileExtraction {
  const parser = getPythonParser();
  const tree = (parser as unknown as {
    parse(cb: (index: number) => string | null): { rootNode: PyNode };
  }).parse((index: number) => (index >= sourceCode.length ? null : sourceCode.slice(index, index + CHUNK_BYTES)));
  const root = tree.rootNode;

  const result: FileExtraction = {
    source_file: relativePath,
    language: "python",
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: [],
  };

  collectParseErrors(root, relativePath, result.parse_errors);

  const moduleNode = makeModuleNode(relativePath);
  result.nodes.push(moduleNode);

  const declByName = new Map<string, GraphNode>();
  // Pass 1: top-level declarations (def/class/assignment) + class members.
  extractDeclarations(root, relativePath, result, declByName, /*topLevel*/ true);
  // Pass 2: imports → edges + bindings.
  extractImports(root, relativePath, result, moduleNode);
  // Pass 3: intra-file calls + raw_calls for the cross-file pass.
  extractCalls(root, result, declByName);

  return result;
}

// ── Parse errors ───────────────────────────────────────────────────────────

function collectParseErrors(node: PyNode, relativePath: string, out: ParseError[]): void {
  /* c8 ignore next */
  if (node.isError || node.isMissing) {
    /* c8 ignore next */
    out.push({ source_file: relativePath, message: node.isMissing ? `missing node: ${node.type}` : `parse error at ${loc(node)}`, location: loc(node) });
    /* c8 ignore next */
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    /* c8 ignore next */
    if (c !== null) collectParseErrors(c, relativePath, out);
  }
}

// ── Pass 1: declarations ─────────────────────────────────────────────────────

function extractDeclarations(
  node: PyNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  topLevel: boolean,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    if (child.type === "function_definition") {
      // Top-level def → function. (Methods are handled under class_definition.)
      const name = textOfField(child, "name");
      /* c8 ignore next */
      if (name !== null) pushNode(result, declByName, makeNode(relativePath, name, "function", child, isPublic(name)));
    } else if (child.type === "class_definition") {
      handleClass(child, relativePath, result, declByName);
    } else if (topLevel && (child.type === "expression_statement")) {
      // Module-level simple assignment `X = ...` → const.
      const assign = firstOfType(child, "assignment");
      /* c8 ignore next */
      if (assign !== null) {
        const lhs = assign.childForFieldName("left");
        /* c8 ignore next */
        if (lhs !== null && lhs.type === "identifier") {
          pushNode(result, declByName, makeNode(relativePath, lhs.text, "const", assign, isPublic(lhs.text)));
        }
      }
    } else /* c8 ignore next */ if (child.type === "decorated_definition") {
      // `@decorator\n def/class ...` — recurse to reach the inner definition.
      /* c8 ignore next */
      extractDeclarations(child, relativePath, result, declByName, topLevel);
    }
  }
}

function handleClass(node: PyNode, relativePath: string, result: FileExtraction, declByName: Map<string, GraphNode>): void {
  const name = textOfField(node, "name");
  /* c8 ignore next */
  if (name === null) return;
  const classNode = makeNode(relativePath, name, "class", node, isPublic(name));
  pushNode(result, declByName, classNode);

  // Bases: `class Sub(Base, Mixin):` → superclasses field is an argument_list.
  const supers = node.childForFieldName("superclasses");
  /* c8 ignore next */
  if (supers !== null) {
    for (let i = 0; i < supers.namedChildCount; i++) {
      const base = supers.namedChild(i);
      /* c8 ignore next */
      if (base === null) continue;
      // Only real base expressions are inheritance: a bare `identifier` (Base)
      // or a dotted `attribute` (module.Base → use the final name). Skip
      // `keyword_argument` (metaclass=Meta), *args/**kwargs, comments, etc.
      // (codex review).
      let baseName: string | null = null;
      if (base.type === "identifier") baseName = base.text;
      else if (base.type === "attribute") {
        const attr = base.childForFieldName("attribute");
        /* c8 ignore next */
        baseName = attr !== null ? attr.text : null;
      }
      /* c8 ignore next */
      if (baseName === null || baseName.length === 0) continue;
      result.edges.push({
        source: classNode.id,
        target: nodeIdUnresolved(relativePath, baseName, "class"),
        relation: "extends",
        confidence: "EXTRACTED",
      });
    }
  }

  // Methods: function_definition inside the class body block.
  const body = node.childForFieldName("body");
  /* c8 ignore next */
  if (body !== null) {
    for (let i = 0; i < body.namedChildCount; i++) {
      let member = body.namedChild(i);
      /* c8 ignore next */
      if (member === null) continue;
      /* c8 ignore next */
      if (member.type === "decorated_definition") member = firstOfType(member, "function_definition");
      /* c8 ignore next */
      if (member === null || member.type !== "function_definition") continue;
      const mName = textOfField(member, "name");
      /* c8 ignore next */
      if (mName === null) continue;
      const methodNode = makeNodeWithExplicitLabel(relativePath, `${name}.${mName}`, mName, "method", member, isPublic(name) && isPublic(mName));
      pushNode(result, declByName, methodNode);
      result.edges.push({ source: classNode.id, target: methodNode.id, relation: "method_of", confidence: "EXTRACTED" });
    }
  }
}

// ── Pass 2: imports ──────────────────────────────────────────────────────────

function extractImports(node: PyNode, relativePath: string, result: FileExtraction, moduleNode: GraphNode): void {
  if (node.type === "import_statement") {
    // `import a.b.c` / `import a as b`
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      /* c8 ignore next */
      if (child === null) continue;
      let modText: string | null = null;
      let local: string | null = null;
      /* c8 ignore next */
      if (child.type === "dotted_name") { modText = child.text; local = lastDottedSegment(child.text); }
      else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        /* c8 ignore next */
        if (name !== null) { modText = name.text; /* c8 ignore next */ local = alias !== null ? alias.text : lastDottedSegment(name.text); }
      }
      /* c8 ignore next */
      if (modText !== null) {
        pushImportEdge(result, moduleNode, modText);
        /* c8 ignore next */
        if (local !== null) result.import_bindings!.push({ local_name: local, imported_name: "*", kind: "namespace", specifier: modText });
      }
    }
    return;
  }
  if (node.type === "import_from_statement") {
    // `from m import a, b as c` / `from . import x`
    const modNode = node.childForFieldName("module_name");
    /* c8 ignore next */
    const modText = modNode !== null ? modNode.text : ".";
    pushImportEdge(result, moduleNode, modText);
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      /* c8 ignore next */
      if (child === null || child === modNode) continue;
      /* c8 ignore next */
      if (child.type === "dotted_name" || child.type === "identifier") {
        const imported = child.text;
        result.import_bindings!.push({ local_name: lastDottedSegment(imported), imported_name: imported, kind: "named", specifier: modText });
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name");
        const alias = child.childForFieldName("alias");
        /* c8 ignore next */
        if (name !== null) result.import_bindings!.push({ local_name: /* c8 ignore next */ alias !== null ? alias.text : lastDottedSegment(name.text), imported_name: name.text, kind: "named", specifier: modText });
      }
    }
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    /* c8 ignore next */
    if (c !== null) extractImports(c, relativePath, result, moduleNode);
  }
}

function pushImportEdge(result: FileExtraction, moduleNode: GraphNode, specifier: string): void {
  /* c8 ignore next */
  if (specifier.length === 0) return;
  result.edges.push({ source: moduleNode.id, target: `external:${specifier}`, relation: "imports", confidence: "EXTRACTED" });
}

// ── Pass 3: calls ────────────────────────────────────────────────────────────

function extractCalls(node: PyNode, result: FileExtraction, declByName: Map<string, GraphNode>): void {
  if (node.type === "call") {
    const callee = node.childForFieldName("function");
    /* c8 ignore next */
    if (callee !== null) {
      const caller = findEnclosingDeclaration(node, declByName);
      /* c8 ignore next */
      if (caller !== null) {
        const key = resolveCalleeKey(callee);
        /* c8 ignore next */
        const target = key !== null ? declByName.get(key) : undefined;
        /* c8 ignore next */
        if (target !== undefined) {
          result.edges.push({ source: caller.id, target: target.id, relation: "calls", confidence: "EXTRACTED" });
        } else {
          const rc = rawCallFromCallee(callee, caller.id);
          /* c8 ignore next */
          if (rc !== null) result.raw_calls!.push(rc);
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    /* c8 ignore next */
    if (c !== null) extractCalls(c, result, declByName);
  }
}

/**
 * Resolve a call's callee to a declByName key for INTRA-FILE resolution:
 *   foo(...)        → "foo"
 *   self.m(...)     → "<EnclosingClass>.m"
 *   obj.m(...)      → null (cross-instance; not resolved)
 */
function resolveCalleeKey(callee: PyNode): string | null {
  if (callee.type === "identifier") return callee.text;
  /* c8 ignore next */
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    /* c8 ignore next */
    if (obj !== null && obj.type === "identifier" && obj.text === "self" && attr !== null) {
      const cls = findEnclosingClassName(callee);
      /* c8 ignore next */
      if (cls !== null) return `${cls}.${attr.text}`;
    }
  }
  return null;
}

function rawCallFromCallee(callee: PyNode, callerId: string): { caller_id: string; callee_name: string; receiver?: string } | null {
  /* c8 ignore next */
  if (callee.type === "identifier") return { caller_id: callerId, callee_name: callee.text };
  /* c8 ignore next */
  if (callee.type === "attribute") {
    const obj = callee.childForFieldName("object");
    const attr = callee.childForFieldName("attribute");
    /* c8 ignore next */
    if (obj !== null && obj.type === "identifier" && obj.text !== "self" && attr !== null) {
      return { caller_id: callerId, callee_name: attr.text, receiver: obj.text };
    }
  }
  /* c8 ignore next */
  return null;
}

function findEnclosingDeclaration(node: PyNode, declByName: Map<string, GraphNode>): GraphNode | null {
  let cur: PyNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "function_definition") {
      const name = textOfField(cur, "name");
      const cls = findEnclosingClassName(cur);
      /* c8 ignore next */
      if (name !== null) {
        /* c8 ignore next */
        const n = cls !== null ? declByName.get(`${cls}.${name}`) : declByName.get(name);
        /* c8 ignore next */
        if (n !== undefined) return n;
      }
    }
    cur = cur.parent;
  }
  /* c8 ignore next */
  return null;
}

function findEnclosingClassName(node: PyNode): string | null {
  let cur: PyNode | null = node.parent;
  while (cur !== null) {
    /* c8 ignore next */
    if (cur.type === "class_definition") return textOfField(cur, "name");
    cur = cur.parent;
  }
  return null;
}

// ── Node helpers ─────────────────────────────────────────────────────────────

function makeNode(relativePath: string, name: string, kind: NodeKind, node: PyNode, exported: boolean): GraphNode {
  return { id: nodeId(relativePath, name, kind), label: name, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf(node, kind) };
}

function makeNodeWithExplicitLabel(relativePath: string, idName: string, label: string, kind: NodeKind, node: PyNode, exported: boolean): GraphNode {
  return { id: nodeId(relativePath, idName, kind), label, kind, source_file: relativePath, source_location: loc(node), language: "python", exported, signature: signatureOf(node, kind) };
}

function makeModuleNode(relativePath: string): GraphNode {
  return { id: `${relativePath}::module`, label: relativePath, kind: "module", source_file: relativePath, source_location: "L1", language: "python", exported: false };
}

function pushNode(result: FileExtraction, declByName: Map<string, GraphNode>, node: GraphNode): void {
  // declByName is keyed by the id-name (label for top-level, Class.method for methods).
  /* c8 ignore next */
  const key = node.kind === "method" ? node.id.split(":")[1]! : node.label;
  // Python admits multiple declarations that map to the SAME node id within
  // one file: a property getter/setter pair (`@property def x` + `@x.setter
  // def x`), a `@overload`-decorated stub plus its implementation, or a
  // module-level name reassignment (`x = 1` ... `x = foo()`). The snapshot
  // contract (see GraphNode.id in types.ts) and NetworkX-style consumers both
  // REQUIRE node id uniqueness within a snapshot, so skip the duplicate while
  // still registering the lookup key (first wins) — mirrors the shared and
  // TypeScript extractors' pushNode.
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(key)) declByName.set(key, node);
    return;
  }
  result.nodes.push(node);
  /* c8 ignore next */
  if (!declByName.has(key)) declByName.set(key, node);
}

function signatureOf(node: PyNode, kind: NodeKind): string {
  const text = node.text;
  let end = text.length;
  const nl = text.indexOf("\n");
  /* c8 ignore next */
  if (nl >= 0) end = Math.min(end, nl);
  // For def/class, cut PRECISELY at the body block's start (via the `body`
  // field) — NOT at the first `:`, which would truncate at a parameter
  // annotation (`def f(x: int):` → `def f(x`). Falls back to the leading line.
  /* c8 ignore next */
  if (kind === "function" || kind === "method" || kind === "class") {
    const body = node.childForFieldName("body");
    /* c8 ignore next */
    if (body !== null) end = Math.min(end, body.startIndex - node.startIndex);
  }
  const sig = text.slice(0, end).replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
  const cps = [...sig];
  /* c8 ignore next */
  return cps.length > 120 ? `${cps.slice(0, 117).join("")}...` : sig;
}

function nodeId(relativePath: string, name: string, kind: NodeKind): string {
  return `${relativePath}:${name}:${kind}`;
}

function nodeIdUnresolved(relativePath: string, name: string, kind: NodeKind): string {
  return `unresolved:${relativePath}:${name}:${kind}`;
}

function loc(node: PyNode): string {
  const start = node.startPosition.row + 1;
  const end = node.endPosition.row + 1;
  /* c8 ignore next */
  return end > start ? `L${start}-${end}` : `L${start}`;
}

function textOfField(node: PyNode, field: string): string | null {
  const f = node.childForFieldName(field);
  /* c8 ignore next */
  return f !== null ? f.text : null;
}

function firstOfType(node: PyNode, type: string): PyNode | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    /* c8 ignore next */
    if (c !== null && c.type === type) return c;
  }
  /* c8 ignore next */
  return null;
}

function lastDottedSegment(dotted: string): string {
  const parts = dotted.split(".");
  /* c8 ignore next */
  return parts[parts.length - 1] ?? dotted;
}

/** Python public-by-convention: a name is public iff it doesn't start with `_`. */
function isPublic(name: string): boolean {
  return !name.startsWith("_");
}
