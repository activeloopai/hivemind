/**
 * JavaScript / JSX extractor (Phase 1.5).
 * Uses tree-sitter-javascript (handles both JS and JSX in one grammar).
 * AST shape is nearly identical to TypeScript so extraction logic is similar,
 * but the language field is "javascript" and no TS-specific syntax is emitted.
 */

import JavaScript from "tree-sitter-javascript";
import type { FileExtraction, GraphNode, RawCall } from "../types.js";
import {
  collectParseErrors,
  firstOfType,
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

const LANG = "javascript" as const;

export function extractJavaScript(
  sourceCode: string,
  relativePath: string,
): FileExtraction {
  const tree = parseWithChunks(getParser(JavaScript as object), sourceCode);
  const root = tree.rootNode;

  const result: FileExtraction = {
    source_file: relativePath,
    language: LANG,
    nodes: [],
    edges: [],
    parse_errors: [],
    raw_calls: [],
    import_bindings: [],
  };
  collectParseErrors(root, relativePath, result.parse_errors);

  const moduleNode = makeModuleNode(relativePath, LANG);
  result.nodes.push(moduleNode);

  const declByName = new Map<string, GraphNode>();
  collectDecls(root, relativePath, result, declByName, moduleNode);
  collectImports(root, relativePath, result, moduleNode);
  collectCalls(root, relativePath, result, declByName);

  return result;
}

// ─── Pass 1: declarations ───────────────────────────────────────────────────

function collectDecls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  moduleNode: GraphNode,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    /* c8 ignore next */
    if (child === null) continue;

    const { inner, exported } = unwrapExport(child);

    if (inner.type === "function_declaration" || inner.type === "generator_function_declaration") {
      const name = textOfField(inner, "name");
      /* c8 ignore next */
      if (name === null) continue;
      pushNode(result, declByName, makeNode(relativePath, name, "function", inner, exported, LANG));
    } else if (inner.type === "class_declaration") {
      const name = textOfField(inner, "name");
      /* c8 ignore next */
      if (name === null) continue;
      const classDecl = makeNode(relativePath, name, "class", inner, exported, LANG);
      pushNode(result, declByName, classDecl);
      const body = firstOfType(inner, ["class_body"]);
      /* c8 ignore next */
      if (body !== null) collectMethods(body, relativePath, result, declByName, name, exported);
    } else if (inner.type === "lexical_declaration" || inner.type === "variable_declaration") {
      // const/let foo = () => {} or function() {}
      for (let j = 0; j < inner.namedChildCount; j++) {
        const decl = inner.namedChild(j);
        /* c8 ignore next */
        if (decl === null || decl.type !== "variable_declarator") continue;
        const ident = decl.childForFieldName("name");
        /* c8 ignore next */
        if (ident === null || ident.type !== "identifier") continue;
        const val = decl.childForFieldName("value");
        if (val?.type === "arrow_function" || val?.type === "function_expression") {
          pushNode(result, declByName, makeNode(relativePath, ident.text, "function", decl, exported, LANG));
        }
      }
    }
  }
}

function collectMethods(
  body: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
  className: string,
  classExported: boolean,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    /* c8 ignore next */
    if (member === null || member.type !== "method_definition") continue;
    const methodName = textOfField(member, "name");
    /* c8 ignore next */
    if (methodName === null) continue;
    const key = `${className}.${methodName}`;
    const methodNode: GraphNode = {
      id: nodeId(relativePath, key, "method"),
      label: methodName,
      kind: "method",
      source_file: relativePath,
      source_location: locationStr(member),
      language: LANG,
      exported: classExported,
    };
    pushNode(result, declByName, methodNode, key);
    result.edges.push({
      source: nodeId(relativePath, className, "class"),
      target: methodNode.id,
      relation: "method_of",
      confidence: "EXTRACTED",
    });
  }
}

function unwrapExport(node: TSNode): { inner: TSNode; exported: boolean } {
  if (node.type === "export_statement") {
    const decl =
      node.childForFieldName("declaration") ??
      firstOfType(node, [
        "function_declaration",
        "generator_function_declaration",
        "class_declaration",
        "lexical_declaration",
        "variable_declaration",
      ]);
    /* c8 ignore next */
    if (decl !== null) return { inner: decl, exported: true };
  }
  return { inner: node, exported: false };
}

// ─── Pass 2: imports ────────────────────────────────────────────────────────

function collectImports(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  moduleNode: GraphNode,
): void {
  if (node.type === "import_statement") {
    const src = firstOfType(node, ["string"]);
    /* c8 ignore next */
    if (src !== null) {
      const frag = firstOfType(src, ["string_fragment"]);
      /* c8 ignore next */
      const spec = (frag !== null ? frag.text : src.text).replace(/^['"]|['"]$/g, "");
      /* c8 ignore next */
      if (spec.length > 0) {
        result.edges.push({
          source: moduleNode.id,
          target: `external:${spec}`,
          relation: "imports",
          confidence: "EXTRACTED",
        });
        extractImportBindings(node, spec, result);
      }
    }
    return;
  }
  // require("...") calls
  if (
    node.type === "call_expression" &&
    node.childForFieldName("function")?.text === "require"
  ) {
    const args = node.childForFieldName("arguments");
    /* c8 ignore next */
    if (args !== null) {
      const str = firstOfType(args, ["string"]);
      /* c8 ignore next */
      if (str !== null) {
        const frag = firstOfType(str, ["string_fragment"]);
        /* c8 ignore next */
        const spec = (frag?.text ?? str.text).replace(/^['"]|['"]$/g, "");
        /* c8 ignore next */
        if (spec.length > 0) {
          result.edges.push({
            source: moduleNode.id,
            target: `external:${spec}`,
            relation: "imports",
            confidence: "EXTRACTED",
          });
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectImports(child, relativePath, result, moduleNode);
  }
}

/** Record the runtime bindings a cross-file call resolver needs. */
function extractImportBindings(
  importStmt: TSNode,
  specifier: string,
  result: FileExtraction,
): void {
  const clause = firstOfType(importStmt, ["import_clause"]);
  if (clause === null) return; // side-effect-only import

  const push = (local_name: string, imported_name: string, kind: "named" | "default" | "namespace") => {
    result.import_bindings!.push({ local_name, imported_name, kind, specifier });
  };

  for (let i = 0; i < clause.namedChildCount; i++) {
    const child = clause.namedChild(i);
    if (child === null) continue;
    if (child.type === "identifier") {
      push(child.text, "default", "default");
    } else if (child.type === "namespace_import") {
      const id = firstOfType(child, ["identifier"]);
      if (id !== null) push(id.text, "*", "namespace");
    } else if (child.type === "named_imports") {
      for (let j = 0; j < child.namedChildCount; j++) {
        const spec = child.namedChild(j);
        if (spec === null || spec.type !== "import_specifier") continue;
        const name = spec.childForFieldName("name");
        if (name === null) continue;
        const alias = spec.childForFieldName("alias");
        push(alias?.text ?? name.text, name.text, "named");
      }
    }
  }
}

// ─── Pass 3: intra-file calls ───────────────────────────────────────────────

function collectCalls(
  node: TSNode,
  relativePath: string,
  result: FileExtraction,
  declByName: Map<string, GraphNode>,
): void {
  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function");
    /* c8 ignore next */
    if (callee !== null) {
      let calleeKey: string | null = null;
      if (callee.type === "identifier") {
        calleeKey = callee.text;
      } else if (
        callee.type === "member_expression" &&
        callee.childForFieldName("object")?.type === "this"
      ) {
        const prop = callee.childForFieldName("property");
        /* c8 ignore next */
        if (prop !== null) {
          // find enclosing class name
          let cur: TSNode | null = callee.parent;
          while (cur !== null) {
            /* c8 ignore next */
            if (cur.type === "class_declaration") {
              const cn = textOfField(cur, "name");
              /* c8 ignore next */
              if (cn !== null) {
                calleeKey = `${cn}.${prop.text}`;
              }
              break;
            }
            cur = cur.parent;
          }
        }
      }
      const target = calleeKey === null ? undefined : declByName.get(calleeKey);
      const caller = findEnclosingFn(node, declByName);
      if (caller !== null) {
        if (target !== undefined) {
          result.edges.push({
            source: caller.id,
            target: target.id,
            relation: "calls",
            confidence: "EXTRACTED",
          });
        } else {
          const raw = rawCallFromCallee(callee, caller.id);
          if (raw !== null && !shadowsImportedBinding(node, callee, result)) {
            result.raw_calls!.push(raw);
          }
        }
      }
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) collectCalls(child, relativePath, result, declByName);
  }
}

/** Capture the simple call shapes supported by the cross-file resolver. */
function rawCallFromCallee(callee: TSNode, callerId: string): RawCall | null {
  if (callee.type === "identifier") {
    return { caller_id: callerId, callee_name: callee.text };
  }
  if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (object?.type === "identifier" && property?.type === "property_identifier") {
      return { caller_id: callerId, callee_name: property.text, receiver: object.text };
    }
  }
  return null;
}

/**
 * Return true when the identifier that would select an import binding is
 * rebound between this call site and the module scope. Import bindings live in
 * the program scope, so the nearest parameter/local/catch/loop/class binding
 * wins exactly as it does at runtime.
 */
function shadowsImportedBinding(
  call: TSNode,
  callee: TSNode,
  result: FileExtraction,
): boolean {
  let reference: TSNode | null = null;
  let bindingKind: "value" | "namespace" = "value";

  if (callee.type === "identifier") {
    reference = callee;
  } else if (callee.type === "member_expression") {
    const object = callee.childForFieldName("object");
    if (object?.type === "identifier") {
      reference = object;
      bindingKind = "namespace";
    }
  }
  if (reference === null) return false;

  const name = reference.text;
  const isImported = result.import_bindings!.some((binding) =>
    binding.local_name === name &&
    (bindingKind === "namespace" ? binding.kind === "namespace" : binding.kind !== "namespace")
  );
  if (!isImported) return false;

  let scope = call.parent;
  while (scope !== null && scope.type !== "program") {
    if (scopeBindsName(scope, name, call)) return true;
    scope = scope.parent;
  }
  return false;
}

function scopeBindsName(scope: TSNode, name: string, call: TSNode): boolean {
  if (isFunctionScope(scope)) {
    const parameters = scope.childForFieldName("parameters") ?? scope.childForFieldName("parameter");
    const body = scope.childForFieldName("body");
    const inParameters = parameters !== null && containsNode(parameters, call);
    const inBody = body !== null && containsNode(body, call);

    if ((inParameters || inBody) && scope.type !== "method_definition" &&
        scope.type !== "arrow_function") {
      const ownName = scope.childForFieldName("name");
      if (ownName?.type === "identifier" && ownName.text === name) return true;
    }

    if ((inParameters || inBody) && parameters !== null &&
        bindingPatternHasName(parameters, name)) return true;

    // Default-parameter expressions have their own environment. A `var` in
    // the function body is not visible there, so only consult body declarations
    // when the call itself is inside that body.
    return inBody && body !== null && subtreeHasVarBinding(body, name);
  }

  if (scope.type === "statement_block") {
    return blockHasLexicalBinding(scope, name);
  }

  if (scope.type === "switch_body") {
    return switchHasLexicalBinding(scope, name);
  }

  if (scope.type === "catch_clause") {
    const parameter = scope.childForFieldName("parameter");
    return parameter !== null && bindingPatternHasName(parameter, name);
  }

  if (scope.type === "for_statement") {
    const initializer = scope.childForFieldName("initializer");
    return initializer?.type === "lexical_declaration" && declarationHasName(initializer, name);
  }

  if (scope.type === "for_in_statement") {
    const left = scope.childForFieldName("left");
    const kind = scope.childForFieldName("kind")?.text;
    return left !== null && (kind === "const" || kind === "let") && bindingPatternHasName(left, name);
  }

  if (scope.type === "class_declaration" || scope.type === "class") {
    const className = scope.childForFieldName("name");
    return className?.type === "identifier" && className.text === name;
  }

  if (scope.type === "class_static_block") {
    const body = scope.childForFieldName("body");
    return body !== null && subtreeHasVarBinding(body, name);
  }

  return false;
}

function containsNode(container: TSNode, node: TSNode): boolean {
  const startsBefore = container.startPosition.row < node.startPosition.row ||
    (container.startPosition.row === node.startPosition.row &&
      container.startPosition.column <= node.startPosition.column);
  const endsAfter = container.endPosition.row > node.endPosition.row ||
    (container.endPosition.row === node.endPosition.row &&
      container.endPosition.column >= node.endPosition.column);
  return startsBefore && endsAfter;
}

function isFunctionScope(node: TSNode): boolean {
  return node.type === "function_declaration" ||
    node.type === "generator_function_declaration" ||
    node.type === "function_expression" ||
    node.type === "generator_function" ||
    node.type === "arrow_function" ||
    node.type === "method_definition";
}

function blockHasLexicalBinding(block: TSNode, name: string): boolean {
  return directChildrenHaveLexicalBinding(block, name);
}

function directChildrenHaveLexicalBinding(parent: TSNode, name: string): boolean {
  for (let i = 0; i < parent.namedChildCount; i++) {
    const child = parent.namedChild(i);
    if (child === null) continue;
    if (child.type === "lexical_declaration" && declarationHasName(child, name)) return true;
    if (
      child.type === "function_declaration" ||
      child.type === "generator_function_declaration" ||
      child.type === "class_declaration"
    ) {
      const declared = child.childForFieldName("name");
      if (declared?.type === "identifier" && declared.text === name) return true;
    }
  }
  return false;
}

function switchHasLexicalBinding(body: TSNode, name: string): boolean {
  for (let i = 0; i < body.namedChildCount; i++) {
    const switchCase = body.namedChild(i);
    if (switchCase === null) continue;
    if (directChildrenHaveLexicalBinding(switchCase, name)) return true;
  }
  return false;
}

function subtreeHasVarBinding(node: TSNode, name: string): boolean {
  if (node.type === "variable_declaration" && declarationHasName(node, name)) return true;

  // tree-sitter stores for-in/of declarations directly on the loop instead of
  // wrapping them in a variable_declaration. `var` still binds the function.
  if (node.type === "for_in_statement" && node.childForFieldName("kind")?.text === "var") {
    const pattern = node.childForFieldName("left");
    if (pattern !== null && bindingPatternHasName(pattern, name)) return true;
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null || isFunctionScope(child) || child.type === "class_declaration" ||
        child.type === "class" || child.type === "class_static_block") {
      continue;
    }
    if (subtreeHasVarBinding(child, name)) return true;
  }
  return false;
}

function declarationHasName(declaration: TSNode, name: string): boolean {
  for (let i = 0; i < declaration.namedChildCount; i++) {
    const declarator = declaration.namedChild(i);
    if (declarator?.type !== "variable_declarator") continue;
    const pattern = declarator.childForFieldName("name");
    if (pattern !== null && bindingPatternHasName(pattern, name)) return true;
  }
  return false;
}

function bindingPatternHasName(pattern: TSNode, name: string): boolean {
  if (pattern.type === "identifier" || pattern.type === "shorthand_property_identifier_pattern") {
    return pattern.text === name;
  }

  if (pattern.type === "pair_pattern") {
    const value = pattern.childForFieldName("value");
    return value !== null && bindingPatternHasName(value, name);
  }

  if (pattern.type === "assignment_pattern" || pattern.type === "object_assignment_pattern") {
    const left = pattern.childForFieldName("left");
    return left !== null && bindingPatternHasName(left, name);
  }

  if (pattern.type === "rest_pattern") {
    const argument = pattern.namedChild(0);
    return argument !== null && bindingPatternHasName(argument, name);
  }

  if (pattern.type === "formal_parameters" || pattern.type === "object_pattern" ||
      pattern.type === "array_pattern") {
    for (let i = 0; i < pattern.namedChildCount; i++) {
      const child = pattern.namedChild(i);
      if (child !== null && bindingPatternHasName(child, name)) return true;
    }
  }

  return false;
}

function findEnclosingFn(
  node: TSNode,
  declByName: Map<string, GraphNode>,
): GraphNode | null {
  let cur: TSNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === "function_declaration" || cur.type === "generator_function_declaration") {
      if (!isTopLevelDeclaration(cur)) return null;
      const name = textOfField(cur, "name");
      return name === null ? null : (declByName.get(name) ?? null);
    } else if (cur.type === "method_definition") {
      const parameters = cur.childForFieldName("parameters");
      const body = cur.childForFieldName("body");
      if ((parameters === null || !containsNode(parameters, node)) &&
          (body === null || !containsNode(body, node))) {
        cur = cur.parent;
        continue;
      }
      const methodName = textOfField(cur, "name");
      const classBody = cur.parent;
      const classDecl = classBody?.type === "class_body" ? classBody.parent : null;
      const className = classDecl?.type === "class_declaration"
        ? textOfField(classDecl, "name")
        : null;
      if (methodName === null || className === null || classDecl === null ||
          !isTopLevelDeclaration(classDecl)) return null;
      return declByName.get(`${className}.${methodName}`) ?? null;
    } else if (
      cur.type === "arrow_function" ||
      cur.type === "function_expression" ||
      cur.type === "generator_function"
    ) {
      const declarator = cur.parent?.type === "variable_declarator" ? cur.parent : null;
      const ident = declarator?.childForFieldName("name") ?? null;
      if (declarator !== null && isTopLevelDeclaration(declarator) && ident?.type === "identifier") {
        return declByName.get(ident.text) ?? null;
      }
      return null;
    } else if (cur.type === "class_static_block" || cur.type === "field_definition") {
      return null;
    }
    cur = cur.parent;
  }
  return null;
}

function isTopLevelDeclaration(node: TSNode): boolean {
  let declaration = node;
  if (node.type === "variable_declarator") {
    const statement = node.parent;
    if (statement === null ||
        (statement.type !== "lexical_declaration" && statement.type !== "variable_declaration")) {
      return false;
    }
    declaration = statement;
  }

  const parent = declaration.parent;
  return parent?.type === "program" ||
    (parent?.type === "export_statement" && parent.parent?.type === "program");
}
