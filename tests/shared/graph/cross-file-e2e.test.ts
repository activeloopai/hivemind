import { describe, it, expect } from "vitest";

import { extractTypeScript } from "../../../src/graph/extract/typescript.js";
import { extractJavaScript } from "../../../src/graph/extract/javascript.js";
import { buildSnapshot } from "../../../src/graph/snapshot.js";
import type { GraphMetadata, GraphObservation } from "../../../src/graph/types.js";

function meta(): GraphMetadata {
  return { schema_version: 1, generator: "hivemind-graph", commit_sha: "c", repo_key: "k" };
}
function obs(): GraphObservation {
  return {
    ts: "2026-06-03T00:00:00Z", branch: "main", worktree_path: "/t", repo_project: "t",
    generator_version: "0.0.0-test", source_files_extracted: 0, source_files_skipped: 0,
  };
}

/**
 * End-to-end: run the REAL tree-sitter extractor over two source strings, build
 * the snapshot, and confirm the cross-file `calls` edge is resolved. This is the
 * test that would have caught any drift between what the extractor emits
 * (raw_calls + import_bindings) and what the resolver consumes.
 */
describe("cross-file calls — extractor → snapshot", () => {
  function callsEdges(snap: { links: { source: string; target: string; relation: string }[] }) {
    return snap.links.filter((e) => e.relation === "calls");
  }

  it("named import: caller in a.ts → exported function in b.ts", () => {
    const a = extractTypeScript(
      `import { greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(
      `export function greet() { return "hi"; }\n`,
      "src/b.ts",
    );
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:greet:function",
    );
    expect(cross).toBeDefined();
  });

  it("named import: JavaScript caller → exported function in another JavaScript file", () => {
    const a = extractJavaScript(
      `import { greet } from "./b.js";\nexport function run() { return greet(); }\n`,
      "src/a.js",
    );
    const b = extractJavaScript(
      `export function greet() { return 1; }\n`,
      "src/b.js",
    );
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.js:run:function" && e.target === "src/b.js:greet:function",
    );
    expect(cross).toBeDefined();
  });

  it.each([
    ["parameter", `export function run(greet) { return greet(); }`],
    ["destructured parameter", `export function run({ greet }) { return greet(); }`],
    ["function-scoped var", `export function run() { if (ready) { var greet = local; } return greet(); }`],
    ["function-scoped for-of var", `export function run() { for (var greet of values) {} return greet(); }`],
    ["hoisted for-of var", `export function run() { greet(); for (var greet of values) {} }`],
    ["function-scoped for-in var", `export function run() { for (var greet in values) {} return greet(); }`],
    ["destructured for-of var", `export function run() { for (var { greet } of values) {} return greet(); }`],
    ["block-scoped local", `export function run() { { const greet = local; return greet(); } }`],
    ["destructured local", `export function run() { const { greet } = local; return greet(); }`],
    ["block function", `export function run() { { function greet() {} return greet(); } }`],
    ["for-of destructuring", `export function run() { for (const { greet } of values) { return greet(); } }`],
    ["commented for-of binding", `export function run() { for /* comment */ (const greet of values) { return greet(); } }`],
    ["destructured catch parameter", `export function run() { try {} catch ({ greet }) { return greet(); } }`],
    ["arrow parameter", `export const run = (greet) => greet();`],
    ["class method parameter", `export class Runner { run(greet) { return greet(); } }`],
  ])("JavaScript named import shadowed by %s does not produce a cross-file edge", (_label, body) => {
    const a = extractJavaScript(`import { greet } from "./b.js";\n${body}\n`, "src/a.js");
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some((e) => e.target === "src/b.js:greet:function")).toBe(false);
  });

  it("keeps real named-import calls in sibling scopes while dropping a shadowed nested scope", () => {
    const a = extractJavaScript(
      `import { greet } from "./b.js";\n` +
      `export function shadowed(greet) { return greet(); }\n` +
      `export function real() { return greet(); }\n`,
      "src/a.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:shadowed:function" && e.target === "src/b.js:greet:function",
    )).toBe(false);
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:real:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
  });

  it("keeps a real namespace-import call outside a block that shadows the receiver", () => {
    const a = extractJavaScript(
      `import * as util from "./b.js";\n` +
      `export function shadowed() { { const util = local; return util.greet(); } }\n` +
      `export function real() { return util.greet(); }\n`,
      "src/a.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:shadowed:function" && e.target === "src/b.js:greet:function",
    )).toBe(false);
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:real:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
  });

  it("preserves the supported JavaScript import-call contract", () => {
    const named = extractJavaScript(
      `import { greet as hello } from "./b.js";\nexport function named() { return hello(); }\n`,
      "src/named.js",
    );
    const namespace = extractJavaScript(
      `import * as util from "./b.js";\nexport function namespaced() { return util.greet(); }\n`,
      "src/namespace.js",
    );
    const unsupported = extractJavaScript(
      `import greet from "./b.js";\nconst util = require("./b.js");\n` +
      `export function unresolved() { greet(); return util.greet(); }\n`,
      "src/unsupported.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([named, namespace, unsupported, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/named.js:named:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
    expect(callsEdges(snap).some(
      (e) => e.source === "src/namespace.js:namespaced:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
    expect(callsEdges(snap).some((e) => e.source === "src/unsupported.js:unresolved:function")).toBe(false);
  });

  it("keeps imported calls visible from method bodies and default parameter initializers", () => {
    const methods = extractJavaScript(
      `import { greet } from "./b.js";\n` +
      `export class Runner { greet() { return greet(); } }\n` +
      `export function defaults(value = greet()) { var greet = local; return value; }\n`,
      "src/a.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([methods, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:Runner.greet:method" && e.target === "src/b.js:greet:function",
    )).toBe(true);
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:defaults:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
  });

  it.each([
    ["nested function", `export function outer() { function nested() { return greet(); } return nested; }`],
    ["nested arrow", `export function outer() { const nested = () => greet(); return nested; }`],
    ["returned arrow", `export function outer() { return () => greet(); }`],
    ["object method", `export function outer() { return { nested() { return greet(); } }; }`],
    ["same-name nested function", `export function outer() { function outer() { return greet(); } return outer; }`],
    ["same-name nested arrow", `export const outer = () => { const outer = () => greet(); return outer; };`],
  ])("does not attribute an unrepresented %s call to its enclosing function", (_label, body) => {
    const a = extractJavaScript(`import { greet } from "./b.js";\n${body}\n`, "src/a.js");
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:outer:function" && e.target === "src/b.js:greet:function",
    )).toBe(false);
  });

  it("keeps real imported calls from represented top-level arrows", () => {
    const a = extractJavaScript(
      `import { greet } from "./b.js";\nexport const run = () => greet();\n`,
      "src/a.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:run:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
  });

  it("keeps an import visible in a computed method name outside the method parameter scope", () => {
    const a = extractJavaScript(
      `import { greet } from "./b.js";\n` +
      `export function outer() { return class Runner { [greet()](greet) {} }; }\n`,
      "src/a.js",
    );
    const b = extractJavaScript(`export function greet() { return 1; }\n`, "src/b.js");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some(
      (e) => e.source === "src/a.js:outer:function" && e.target === "src/b.js:greet:function",
    )).toBe(true);
  });

  it("namespace import: caller in a.ts → ns.greet() in b.ts", () => {
    const a = extractTypeScript(
      `import * as util from "./util/index";\nexport function run() { return util.greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(
      `export function greet() { return 1; }\n`,
      "src/util/index.ts",
    );
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/util/index.ts:greet:function",
    );
    expect(cross).toBeDefined();
  });

  it("does NOT invent an edge for an external (bare) import", () => {
    const a = extractTypeScript(
      `import { debounce } from "lodash";\nexport function run() { return debounce(); }\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    // No cross-file target exists; the only nodes are in a.ts. No calls edge to lodash.
    expect(callsEdges(snap).some((e) => e.target.includes("lodash"))).toBe(false);
  });

  it("does NOT resolve a type-only import (import type { Foo })", () => {
    // `import type` bindings are type-level only; a value call to that name must
    // not produce a cross-file edge (codex review).
    const a = extractTypeScript(
      `import type { greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:greet:function",
    );
    expect(cross).toBeUndefined();
  });

  it("does NOT resolve a per-specifier type import (import { type Foo })", () => {
    const a = extractTypeScript(
      `import { type greet } from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some((e) => e.target === "src/b.ts:greet:function")).toBe(false);
  });

  it("DOES resolve `import { type as value }` — a value import of a symbol named `type`", () => {
    // codex review P3: `type as value` is a VALUE import (named export `type`,
    // aliased to `value`), not a type-only import — it must still resolve.
    const a = extractTypeScript(
      `import { type as value } from "./b";\nexport function run() { return value(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function type() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const cross = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/b.ts:type:function",
    );
    expect(cross).toBeDefined();
  });

  it("does NOT resolve a default import (default export not tracked)", () => {
    const a = extractTypeScript(
      `import greet from "./b";\nexport function run() { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export default function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(callsEdges(snap).some((e) => e.target.includes("greet"))).toBe(false);
  });

  it("B2: a relative import edge points at the target file's module node", () => {
    const a = extractTypeScript(`import { greet } from "./b";\nexport function run() { return greet(); }\n`, "src/a.ts");
    const b = extractTypeScript(`export function greet() { return 1; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const importEdges = snap.links.filter((e) => e.relation === "imports");
    expect(importEdges.some((e) => e.source === "src/a.ts::module" && e.target === "src/b.ts::module")).toBe(true);
    // and no leftover external: placeholder for the resolved relative import
    expect(importEdges.some((e) => e.source === "src/a.ts::module" && e.target === "external:./b")).toBe(false);
  });

  it("B2: a bare (npm) import keeps its external: target", () => {
    const a = extractTypeScript(`import { debounce } from "lodash";\nexport function run() { return debounce(); }\n`, "src/a.ts");
    const snap = buildSnapshot([a], meta(), obs());
    expect(snap.links.some((e) => e.relation === "imports" && e.target === "external:lodash")).toBe(true);
  });

  it("B3: extends an imported base class → real cross-file node", () => {
    const a = extractTypeScript(
      `import { Base } from "./b";\nexport class Sub extends Base {}\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export class Base {}\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toBe("src/b.ts:Base:class");
  });

  it("B3: extends a SAME-FILE base class resolves (no longer unresolved)", () => {
    const a = extractTypeScript(
      `class Base {}\nexport class Sub extends Base {}\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toBe("src/a.ts:Base:class");
  });

  it("B3: implements an interface imported with `import type` still resolves", () => {
    const a = extractTypeScript(
      `import type { Shape } from "./b";\nexport class Impl implements Shape {}\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export interface Shape { x: number }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const impl = snap.links.find((e) => e.relation === "implements" && e.source === "src/a.ts:Impl:class");
    expect(impl?.target).toBe("src/b.ts:Shape:interface");
  });

  it("B3: a type-only import is still NOT a value call target", () => {
    const a = extractTypeScript(
      `import type { Shape } from "./b";\nexport function run(): Shape { return Shape(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export interface Shape { x: number }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    expect(snap.links.some((e) => e.relation === "calls" && e.target === "src/b.ts:Shape:interface")).toBe(false);
  });

  it("B3: extends an external base keeps the unresolved placeholder", () => {
    const a = extractTypeScript(
      `import { Component } from "react";\nexport class Sub extends Component {}\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "src/a.ts:Sub:class");
    expect(ext?.target).toContain("unresolved:");
  });

  it("B4: nodes carry a signature, and fan_in/out + is_entrypoint are derived", () => {
    const a = extractTypeScript(
      `import { greet } from "./b";\nexport function run(x: number): string { return greet(); }\n`,
      "src/a.ts",
    );
    const b = extractTypeScript(`export function greet() { return "hi"; }\n`, "src/b.ts");
    const snap = buildSnapshot([a, b], meta(), obs());
    const run = snap.nodes.find((n) => n.id === "src/a.ts:run:function")!;
    const greet = snap.nodes.find((n) => n.id === "src/b.ts:greet:function")!;
    // signature is the inner declaration (the `export` keyword is unwrapped).
    expect(run.signature).toBe("function run(x: number): string");
    // run is exported and nothing calls it -> entrypoint; greet is called by run.
    expect(run.is_entrypoint).toBe(true);
    expect(run.fan_out).toBeGreaterThanOrEqual(1); // calls greet
    expect(greet.fan_in).toBeGreaterThanOrEqual(1); // called cross-file by run
    expect(greet.is_entrypoint).toBe(false);
  });

  it("B4: const/type signatures keep their right-hand side (kind-aware brace cut)", () => {
    const a = extractTypeScript(
      `export type Pair = { a: string };\nexport const limit = 5;\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const pair = snap.nodes.find((n) => n.id === "src/a.ts:Pair:type_alias")!;
    const limit = snap.nodes.find((n) => n.id === "src/a.ts:limit:const")!;
    expect(pair.signature).toBe("type Pair = { a: string };");
    expect(limit.signature).toBe("limit = 5"); // declarator node; the `;` belongs to the lexical_declaration
  });

  it("B4: a function with an object-literal RETURN TYPE keeps the full signature", () => {
    // codex review: cutting at the first `{` would truncate `make(): { a: number }`
    // to `make():`; cutting at the body node keeps the return type.
    const a = extractTypeScript(
      `export function make(): { a: number } { return { a: 1 }; }\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const make = snap.nodes.find((n) => n.id === "src/a.ts:make:function")!;
    expect(make.signature).toBe("function make(): { a: number }");
  });

  it("still emits intra-file calls (no regression)", () => {
    const a = extractTypeScript(
      `function helper() { return 1; }\nexport function run() { return helper(); }\n`,
      "src/a.ts",
    );
    const snap = buildSnapshot([a], meta(), obs());
    const intra = callsEdges(snap).find(
      (e) => e.source === "src/a.ts:run:function" && e.target === "src/a.ts:helper:function",
    );
    expect(intra).toBeDefined();
  });
});
