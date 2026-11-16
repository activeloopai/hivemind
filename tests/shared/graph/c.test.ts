import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractC } from "../../../src/graph/extract/c.js";
import { buildAnchor } from "../../../src/docs/anchors.js";
import type { FileExtraction } from "../../../src/graph/types.js";

describe("C extraction", () => {
  it("extracts a function definition", () => {
    const ex = extractC(`int add(int a, int b) { return a + b; }\n`, "src/math.c");
    expect(ex.language).toBe("c");
    const fn_ = ex.nodes.find(n => n.id === "src/math.c:add:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
    expect(fn_!.exported).toBe(true);
  });

  it("extracts a struct as 'class'", () => {
    const ex = extractC(`struct Point { int x; int y; };\n`, "src/point.c");
    const s = ex.nodes.find(n => n.id === "src/point.c:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
  });

  it("extracts #include as imports edge", () => {
    const ex = extractC(`#include <stdio.h>\nint main() { return 0; }\n`, "src/main.c");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:stdio.h");
    expect(imp).toBeDefined();
  });

  it("extracts quoted #include as imports edge", () => {
    const ex = extractC(`#include "utils.h"\nvoid f() {}\n`, "src/main.c");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:utils.h");
    expect(imp).toBeDefined();
  });

  it("extracts a pointer-returning function", () => {
    const ex = extractC(`char* get_name() { return "Alice"; }\n`, "src/a.c");
    const fn_ = ex.nodes.find(n => n.label === "get_name");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
  });

  it("extracts intra-file calls", () => {
    const ex = extractC(
      `void run() { helper(); }\nvoid helper() {}\n`,
      "src/a.c",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/a.c:run:function"
        && e.target === "src/a.c:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractC(`int x = 1;\n`, "src/a.c");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/a.c::module")).toBe(true);
  });

  it("extracts functions declared inside #ifdef blocks", () => {
    // Covers the else { recurse } branch added to collectDecls for preproc conditionals
    const ex = extractC(
      `#ifdef DEBUG\nvoid debug_log(const char* msg) {}\n#endif\n`,
      "src/log.c",
    );
    const fn = ex.nodes.find(n => n.label === "debug_log");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("produces no parse errors on valid C", () => {
    const ex = extractC(
      `#include <stdlib.h>\ntypedef struct { int x; int y; } Point;\nPoint make_point(int x, int y) { Point p = {x, y}; return p; }\n`,
      "src/point.c",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});

describe("C prototypes vs definitions → anchors", () => {
  const REL = "src/helper.c";
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "c-proto-anchor-"));
    mkdirSync(join(root, "src"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function extractFile(src: string): FileExtraction {
    writeFileSync(join(root, REL), src);
    return extractC(readFileSync(join(root, REL), "utf-8"), REL);
  }
  const fnNodes = (ex: FileExtraction, label: string) =>
    ex.nodes.filter(n => n.kind === "function" && n.label === label);
  const calls = (ex: FileExtraction) =>
    ex.edges.filter(e => e.relation === "calls").map(e => `${e.source} -> ${e.target}`).sort();

  const PROTO_THEN_DEF = [
    "#include <stdio.h>",          // L1
    "static int helper(int x);",   // L2
    "void log_it(int v);",         // L3
    "int run(int v) {",            // L4
    "  return helper(v) + 1;",     // L5
    "}",                           // L6
    "static int helper(int x) {",  // L7
    "  log_it(x);",                // L8
    "  return x * 2;",             // L9
    "}",                           // L10
    "",
  ].join("\n");

  it("prototype followed by definition points the single node at the definition body", () => {
    const ex = extractFile(PROTO_THEN_DEF);
    const helpers = fnNodes(ex, "helper");
    expect(helpers).toHaveLength(1);
    expect(helpers[0].id).toBe(`${REL}:helper:function`);
    expect(helpers[0].source_location).toBe("L7-10");
    // Existing metadata contract: C functions (static included) are exported.
    expect(helpers[0].exported).toBe(true);
    expect(helpers[0].language).toBe("c");
    expect(ex.nodes.filter(n => n.id === helpers[0].id)).toHaveLength(1);

    const anchor = buildAnchor(helpers[0], root);
    expect(anchor).not.toBeNull();
    expect(anchor!.symbol_id).toBe(`${REL}:helper:function`);
  });

  it("a body edit after the prototype changes the anchor hash", () => {
    const before = buildAnchor(fnNodes(extractFile(PROTO_THEN_DEF), "helper")[0], root);
    const edited = PROTO_THEN_DEF.replace("return x * 2;", "return x * 3;");
    expect(edited).not.toBe(PROTO_THEN_DEF);
    const after = buildAnchor(fnNodes(extractFile(edited), "helper")[0], root);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.content_hash).not.toBe(before!.content_hash);
  });

  it("keeps call edges into and out of a prototyped-then-defined function", () => {
    const ex = extractFile(PROTO_THEN_DEF);
    expect(calls(ex)).toEqual([
      `${REL}:helper:function -> ${REL}:log_it:function`,
      `${REL}:run:function -> ${REL}:helper:function`,
    ]);
  });

  it("prototype-only function stays a node at the prototype line", () => {
    const ex = extractFile(PROTO_THEN_DEF);
    const logIt = fnNodes(ex, "log_it");
    expect(logIt).toHaveLength(1);
    expect(logIt[0].source_location).toBe("L3");
    expect(logIt[0].exported).toBe(true);
    expect(buildAnchor(logIt[0], root)).not.toBeNull();
  });

  it("definition before a later prototype keeps the definition span", () => {
    const src = [
      "int helper(int x) {",  // L1
      "  return x + 1;",      // L2
      "}",                    // L3
      "int helper(int x);",   // L4
      "int run(void) { return helper(1); }", // L5
      "",
    ].join("\n");
    const ex = extractFile(src);
    const helpers = fnNodes(ex, "helper");
    expect(helpers).toHaveLength(1);
    expect(helpers[0].source_location).toBe("L1-3");
    expect(calls(ex)).toEqual([`${REL}:run:function -> ${REL}:helper:function`]);

    const before = buildAnchor(helpers[0], root)!;
    const after = buildAnchor(
      fnNodes(extractFile(src.replace("x + 1", "x + 2")), "helper")[0],
      root,
    )!;
    expect(after.content_hash).not.toBe(before.content_hash);
  });

  it("prototype, definition, then a second prototype keeps the definition span", () => {
    const ex = extractFile([
      "int helper(void);",             // L1
      "int helper(void) { return 1; }", // L2
      "int helper(void);",             // L3
      "",
    ].join("\n"));
    const helpers = fnNodes(ex, "helper");
    expect(helpers).toHaveLength(1);
    expect(helpers[0].source_location).toBe("L2");
  });

  it("only the first definition after a prototype replaces it", () => {
    const ex = extractFile([
      "int pick(void);",               // L1
      "#ifdef FAST",                   // L2
      "int pick(void) { return 1; }",  // L3
      "#else",                         // L4
      "int pick(void) { return 2; }",  // L5
      "#endif",                        // L6
      "",
    ].join("\n"));
    const picks = fnNodes(ex, "pick");
    expect(picks).toHaveLength(1);
    expect(picks[0].source_location).toBe("L3");
  });
});
