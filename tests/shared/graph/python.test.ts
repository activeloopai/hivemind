import { describe, it, expect } from "vitest";

import { extractPython } from "../../../src/graph/extract/python.js";
import { extractFile, isPythonPath } from "../../../src/graph/extract/index.js";
import { buildSnapshot } from "../../../src/graph/snapshot.js";
import type { GraphMetadata, GraphObservation } from "../../../src/graph/types.js";

function meta(): GraphMetadata {
  return { schema_version: 1, generator: "hivemind-graph", commit_sha: "c", repo_key: "k" };
}
function obs(): GraphObservation {
  return { ts: "2026-06-03T00:00:00Z", branch: "m", worktree_path: "/t", repo_project: "t", generator_version: "0", source_files_extracted: 0, source_files_skipped: 0 };
}

describe("extractPython (B6)", () => {
  it("extracts functions, classes, methods and labels them python", () => {
    const ex = extractPython(
      "def run():\n    return helper()\n\ndef helper():\n    return 1\n\nclass Service:\n    def start(self):\n        return self.stop()\n    def stop(self):\n        return 0\n",
      "app/main.py",
    );
    expect(ex.language).toBe("python");
    const ids = ex.nodes.map((n) => n.id);
    expect(ids).toContain("app/main.py:run:function");
    expect(ids).toContain("app/main.py:helper:function");
    expect(ids).toContain("app/main.py:Service:class");
    expect(ids).toContain("app/main.py:Service.start:method");
    expect(ex.nodes.every((n) => n.language === "python")).toBe(true);
  });

  it("emits intra-file calls (run→helper) and self-method calls (start→stop)", () => {
    const ex = extractPython(
      "def run():\n    return helper()\n\ndef helper():\n    return 1\n\nclass Service:\n    def start(self):\n        return self.stop()\n    def stop(self):\n        return 0\n",
      "app/main.py",
    );
    expect(ex.edges.some((e) => e.relation === "calls" && e.source === "app/main.py:run:function" && e.target === "app/main.py:helper:function")).toBe(true);
    expect(ex.edges.some((e) => e.relation === "calls" && e.source === "app/main.py:Service.start:method" && e.target === "app/main.py:Service.stop:method")).toBe(true);
  });

  it("emits method_of edges from class to its methods", () => {
    const ex = extractPython("class A:\n    def m(self):\n        return 1\n", "a.py");
    expect(ex.edges.some((e) => e.relation === "method_of" && e.source === "a.py:A:class" && e.target === "a.py:A.m:method")).toBe(true);
  });

  it("emits extends edges for base classes", () => {
    const ex = extractPython("class Base:\n    pass\n\nclass Sub(Base):\n    pass\n", "a.py");
    expect(ex.edges.some((e) => e.relation === "extends" && e.source === "a.py:Sub:class")).toBe(true);
  });

  it("ignores keyword args in the base list and keeps a dotted base fully qualified (codex)", () => {
    const ex = extractPython("import abc\n\nclass C(abc.ABC, metaclass=Meta):\n    pass\n", "a.py");
    const extendsEdges = ex.edges.filter((e) => e.relation === "extends" && e.source === "a.py:C:class");
    // dotted base abc.ABC → "abc.ABC"; the metaclass=Meta keyword arg is NOT a base.
    expect(extendsEdges.map((e) => e.target)).toEqual(["unresolved:a.py:abc.ABC:class"]);
    expect(extendsEdges.some((e) => e.target.includes("metaclass"))).toBe(false);
    expect(extendsEdges).toHaveLength(1);
  });

  it("marks underscore-prefixed names as internal, others exported", () => {
    const ex = extractPython("def public_fn():\n    return 1\n\ndef _private_fn():\n    return 2\n", "a.py");
    const pub = ex.nodes.find((n) => n.label === "public_fn")!;
    const priv = ex.nodes.find((n) => n.label === "_private_fn")!;
    expect(pub.exported).toBe(true);
    expect(priv.exported).toBe(false);
  });

  it("records imports as external edges + bindings", () => {
    const ex = extractPython("import os\nfrom collections import OrderedDict\n", "a.py");
    expect(ex.edges.some((e) => e.relation === "imports" && e.target === "external:os")).toBe(true);
    expect(ex.edges.some((e) => e.relation === "imports" && e.target === "external:collections")).toBe(true);
    expect(ex.import_bindings!.some((b) => b.local_name === "OrderedDict" && b.imported_name === "OrderedDict")).toBe(true);
  });

  it("signature keeps params with annotations and the return type (no colon-cut bug)", () => {
    const ex = extractPython("def f(x: int, y: str) -> dict:\n    return {}\n", "a.py");
    const f = ex.nodes.find((n) => n.id === "a.py:f:function")!;
    // Must NOT truncate at the ':' inside `x: int`.
    expect(f.signature).toBe("def f(x: int, y: str) -> dict");
  });

  it("module-level assignment becomes a const node", () => {
    const ex = extractPython("LIMIT = 5\n", "a.py");
    expect(ex.nodes.some((n) => n.id === "a.py:LIMIT:const")).toBe(true);
  });

  it("dispatches .py to the python extractor via extractFile", () => {
    expect(isPythonPath("a.py")).toBe(true);
    expect(isPythonPath("a.ts")).toBe(false);
    const ex = extractFile("def f():\n    return 1\n", "a.py");
    expect(ex.language).toBe("python");
  });

  it("extracts decorated methods (@decorator before def)", () => {
    // Covers the decorated_definition branch in collectClassBody (line ~177)
    const ex = extractPython(
      "class Svc:\n    @staticmethod\n    def create():\n        return Svc()\n",
      "svc.py",
    );
    const method = ex.nodes.find(n => n.id === "svc.py:Svc.create:method");
    expect(method).toBeDefined();
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
  });

  it("extracts aliased import (import x as y)", () => {
    // Covers aliased_import branch in extractImports (import statement)
    const ex = extractPython("import numpy as np\ndef f(): pass\n", "a.py");
    expect(ex.edges.some(e => e.relation === "imports" && e.target === "external:numpy")).toBe(true);
    expect(ex.import_bindings!.some(b => b.local_name === "np" && b.kind === "namespace")).toBe(true);
  });

  it("extracts aliased from-import (from x import y as z)", () => {
    // Covers aliased_import branch in extractImports (from statement)
    const ex = extractPython("from collections import OrderedDict as OD\ndef f(): pass\n", "a.py");
    expect(ex.import_bindings!.some(b => b.local_name === "OD" && b.imported_name === "OrderedDict")).toBe(true);
  });

  it("records raw_calls for calls to unknown functions", () => {
    // Covers the raw_calls path in extractCalls when target not in declByName
    const ex = extractPython("def run():\n    external_lib.do_something()\n", "a.py");
    expect(ex.raw_calls).toBeDefined();
    // No crashes and run is still extracted
    expect(ex.nodes.some(n => n.id === "a.py:run:function")).toBe(true);
  });

  it("builds a snapshot with python nodes (intra-file heritage resolves)", () => {
    const ex = extractPython("class Base:\n    pass\n\nclass Sub(Base):\n    pass\n", "a.py");
    const snap = buildSnapshot([ex], meta(), obs());
    // same-file base → heritage resolved to the real node by the shared pass.
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "a.py:Sub:class");
    expect(ext?.target).toBe("a.py:Base:class");
  });
});

describe("extractPython — qualified names survive into the snapshot", () => {
  function extendsTargets(src: string, file: string, source: string): string[] {
    const snap = buildSnapshot([extractPython(src, file)], meta(), obs());
    return snap.links.filter((e) => e.relation === "extends" && e.source === source).map((e) => e.target);
  }

  it("does NOT self-link `class Session(requests.Session)` to the local Session", () => {
    const targets = extendsTargets(
      "import requests\n\nclass Session(requests.Session):\n    pass\n",
      "client.py",
      "client.py:Session:class",
    );
    expect(targets).toEqual(["unresolved:client.py:requests.Session:class"]);
  });

  it("does NOT link a dotted base to a DIFFERENT same-named local class", () => {
    const targets = extendsTargets(
      "import base\n\nclass Model:\n    pass\n\nclass User(base.Model):\n    pass\n",
      "models.py",
      "models.py:User:class",
    );
    expect(targets).toEqual(["unresolved:models.py:base.Model:class"]);
  });

  it("keeps a multi-segment dotted base fully qualified and unresolved", () => {
    const targets = extendsTargets(
      "import a.b\n\nclass C:\n    pass\n\nclass D(a.b.C):\n    pass\n",
      "m.py",
      "m.py:D:class",
    );
    expect(targets).toEqual(["unresolved:m.py:a.b.C:class"]);
  });

  it("skips a base whose attribute chain is not plain identifiers (no guessed name)", () => {
    const targets = extendsTargets(
      "class Base:\n    pass\n\nclass D(make().Base):\n    pass\n",
      "m.py",
      "m.py:D:class",
    );
    expect(targets).toEqual([]);
  });

  it("control: a bare local base still resolves alongside a dotted one", () => {
    const targets = extendsTargets(
      "import requests\n\nclass Mixin:\n    pass\n\nclass Session(Mixin, requests.Session):\n    pass\n",
      "client.py",
      "client.py:Session:class",
    );
    expect(targets.sort()).toEqual(["client.py:Mixin:class", "unresolved:client.py:requests.Session:class"]);
  });

  it("control: a named-imported bare base still resolves cross-file", () => {
    const base = extractPython("class Base:\n    pass\n", "pkg/base.py");
    const sub = extractPython("from pkg.base import Base\n\nclass Sub(Base):\n    pass\n", "app/sub.py");
    const snap = buildSnapshot([base, sub], meta(), obs());
    const ext = snap.links.find((e) => e.relation === "extends" && e.source === "app/sub.py:Sub:class");
    expect(ext?.target).toBe("pkg/base.py:Base:class");
  });
});

describe("extractPython — `import a.b` binds `a`, not `b`", () => {
  const util = () => extractPython("def helper():\n    return 1\n", "pkg/util.py");
  function callEdges(caller: ReturnType<typeof extractPython>): string[] {
    const snap = buildSnapshot([caller, util()], meta(), obs());
    return snap.links
      .filter((e) => e.relation === "calls" && e.source === "app/main.py:run:function")
      .map((e) => e.target);
  }

  it("emits no namespace binding for an unaliased dotted import, but keeps the import edge", () => {
    const ex = extractPython("import pkg.util\n", "app/main.py");
    expect(ex.import_bindings).toEqual([]);
    expect(ex.edges.some((e) => e.relation === "imports" && e.target === "external:pkg.util")).toBe(true);
  });

  it("does NOT emit a false call edge to the dotted-import leaf (`import pkg.util; util.helper()`)", () => {
    const caller = extractPython("import pkg.util\n\ndef run():\n    return util.helper()\n", "app/main.py");
    expect(callEdges(caller)).toEqual([]);
  });

  it("still repoints the dotted import edge to the real module", () => {
    const caller = extractPython("import pkg.util\n", "app/main.py");
    const snap = buildSnapshot([caller, util()], meta(), obs());
    expect(snap.links.some((e) => e.relation === "imports" && e.source === "app/main.py::module" && e.target === "pkg/util.py::module")).toBe(true);
  });

  it("control: an explicit alias (`import pkg.util as util`) still binds and resolves", () => {
    const caller = extractPython("import pkg.util as util\n\ndef run():\n    return util.helper()\n", "app/main.py");
    expect(caller.import_bindings).toEqual([{ local_name: "util", imported_name: "*", kind: "namespace", specifier: "pkg.util" }]);
    expect(callEdges(caller)).toEqual(["pkg/util.py:helper:function"]);
  });

  it("control: a simple `import util` still binds `util` as a namespace and resolves", () => {
    const helpers = extractPython("def helper():\n    return 1\n", "util.py");
    const caller = extractPython("import util\n\ndef run():\n    return util.helper()\n", "app/main.py");
    expect(caller.import_bindings).toEqual([{ local_name: "util", imported_name: "*", kind: "namespace", specifier: "util" }]);
    const snap = buildSnapshot([caller, helpers], meta(), obs());
    const targets = snap.links.filter((e) => e.relation === "calls" && e.source === "app/main.py:run:function").map((e) => e.target);
    expect(targets).toEqual(["util.py:helper:function"]);
  });
});
