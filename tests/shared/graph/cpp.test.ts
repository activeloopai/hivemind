import { describe, it, expect } from "vitest";
import { extractCpp } from "../../../src/graph/extract/cpp.js";

describe("C++ extraction", () => {
  it("extracts a free function", () => {
    const ex = extractCpp(`int add(int a, int b) { return a + b; }\n`, "src/math.cpp");
    expect(ex.language).toBe("cpp");
    const fn_ = ex.nodes.find(n => n.id === "src/math.cpp:add:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
  });

  it("extracts a class node (methods inside class body are not extracted by this extractor version)", () => {
    // The C++ extractor extracts class declarations as 'class' nodes.
    // Inline method definitions inside class bodies in tree-sitter-cpp 0.23.x
    // are represented differently from top-level function_definition nodes,
    // so the extractor focuses on free functions, structs, and namespaces.
    const ex = extractCpp(
      `class Animal {\npublic:\n  void speak();\n};\n`,
      "src/animal.cpp",
    );
    const cls = ex.nodes.find(n => n.id === "src/animal.cpp:Animal:class");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
  });

  it("extracts methods defined via struct body", () => {
    // struct methods defined outside the body as qualified functions
    // are extracted as free functions; structs themselves are extracted as class
    const ex = extractCpp(
      `struct Vec2 { float x; float y; };\nvoid Vec2_init(Vec2* v, float x, float y) { v->x = x; v->y = y; }\n`,
      "src/vec2.cpp",
    );
    const s = ex.nodes.find(n => n.id === "src/vec2.cpp:Vec2:class");
    expect(s).toBeDefined();
    const fn = ex.nodes.find(n => n.label === "Vec2_init");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
  });

  it("extracts namespace as 'module' and qualifies declarations inside", () => {
    const ex = extractCpp(
      `namespace MyNS {\n  void helper() {}\n}\n`,
      "src/ns.cpp",
    );
    const ns = ex.nodes.find(n => n.label === "MyNS" && n.kind === "module");
    expect(ns).toBeDefined();
    const fn_ = ex.nodes.find(n => n.id === "src/ns.cpp:MyNS::helper:function");
    expect(fn_).toBeDefined();
  });

  it("resolves qualified calls (Ns::fn) to namespace-qualified declarations", () => {
    const ex = extractCpp(
      `namespace Math {\n  int square(int x) { return x * x; }\n}\nint run() { return Math::square(3); }\n`,
      "src/calc.cpp",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/calc.cpp:run:function"
        && e.target === "src/calc.cpp:Math::square:function",
    );
    expect(call).toBeDefined();
  });

  describe("calls inside namespaces", () => {
    const callsFrom = (ex: ReturnType<typeof extractCpp>, source: string) =>
      ex.edges.filter(e => e.relation === "calls" && e.source === source).map(e => e.target).sort();

    it("resolves bare N::a -> N::b", () => {
      const ex = extractCpp(
        `namespace N {\n  void b() {}\n  void a() { b(); }\n}\n`,
        "src/n.cpp",
      );
      expect(callsFrom(ex, "src/n.cpp:N::a:function")).toEqual(["src/n.cpp:N::b:function"]);
    });

    it("resolves bare calls to a namespace function declared later", () => {
      const ex = extractCpp(
        `namespace N {\n  void a() { b(); }\n  void b() {}\n}\n`,
        "src/n.cpp",
      );
      expect(callsFrom(ex, "src/n.cpp:N::a:function")).toEqual(["src/n.cpp:N::b:function"]);
    });

    it("resolves qualified N::b() from inside N::a", () => {
      const ex = extractCpp(
        `namespace N {\n  void b() {}\n  void a() { N::b(); }\n}\n`,
        "src/n.cpp",
      );
      expect(callsFrom(ex, "src/n.cpp:N::a:function")).toEqual(["src/n.cpp:N::b:function"]);
    });

    it("falls back to global functions from inside a namespace", () => {
      const ex = extractCpp(
        `void log() {}\nnamespace N {\n  void a() { log(); }\n}\n`,
        "src/n.cpp",
      );
      expect(callsFrom(ex, "src/n.cpp:N::a:function")).toEqual(["src/n.cpp:log:function"]);
    });

    it("keeps global-to-global calls unchanged", () => {
      const ex = extractCpp(
        `void helper() {}\nvoid run() { helper(); }\nnamespace N {\n  void helper() {}\n}\n`,
        "src/n.cpp",
      );
      expect(callsFrom(ex, "src/n.cpp:run:function")).toEqual(["src/n.cpp:helper:function"]);
    });

    it("does not cross-link same-named symbols in separate namespaces", () => {
      const ex = extractCpp(
        [
          "void helper() {}",
          "void run() { helper(); }",
          "namespace A {",
          "  void helper() {}",
          "  void run() { helper(); }",
          "}",
          "namespace B {",
          "  void helper() {}",
          "  void run() { helper(); }",
          "}",
          "",
        ].join("\n"),
        "src/s.cpp",
      );
      expect(callsFrom(ex, "src/s.cpp:run:function")).toEqual(["src/s.cpp:helper:function"]);
      expect(callsFrom(ex, "src/s.cpp:A::run:function")).toEqual(["src/s.cpp:A::helper:function"]);
      expect(callsFrom(ex, "src/s.cpp:B::run:function")).toEqual(["src/s.cpp:B::helper:function"]);
    });

    it("does not resolve a bare call to a function only in a sibling namespace", () => {
      const ex = extractCpp(
        `namespace A {\n  void only_a() {}\n}\nnamespace B {\n  void run() { only_a(); }\n}\n`,
        "src/s.cpp",
      );
      expect(ex.nodes.some(n => n.id === "src/s.cpp:B::run:function")).toBe(true);
      expect(ex.edges.filter(e => e.relation === "calls")).toEqual([]);
    });

    it("resolves through nested namespace blocks, innermost first", () => {
      const ex = extractCpp(
        [
          "namespace Outer {",
          "  void top() {}",
          "  void b() {}",
          "  namespace Inner {",
          "    void b() {}",
          "    void a() { b(); top(); }",
          "  }",
          "}",
          "",
        ].join("\n"),
        "src/nest.cpp",
      );
      // Nested members are keyed by their full namespace path.
      expect(ex.nodes.some(n => n.id === "src/nest.cpp:Inner::a:function")).toBe(false);
      expect(ex.nodes.some(n => n.id === "src/nest.cpp:Outer::Inner:module")).toBe(true);
      expect(callsFrom(ex, "src/nest.cpp:Outer::Inner::a:function")).toEqual([
        "src/nest.cpp:Outer::Inner::b:function",
        "src/nest.cpp:Outer::top:function",
      ]);
    });

    it("keeps same-named inner namespaces of distinct outer namespaces apart", () => {
      const ex = extractCpp(
        [
          "namespace A {",
          "  namespace detail {",
          "    void f() {}",
          "    void g() { f(); }",
          "  }",
          "  void run() { detail::f(); }",
          "}",
          "namespace B {",
          "  namespace detail {",
          "    void f() {}",
          "    void g() { f(); }",
          "  }",
          "  void run() { detail::f(); }",
          "}",
          "void top() { A::detail::f(); B::detail::f(); }",
          "",
        ].join("\n"),
        "src/sib.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      const ids = ex.nodes.map(n => n.id);
      expect(ids).toContain("src/sib.cpp:A::detail:module");
      expect(ids).toContain("src/sib.cpp:B::detail:module");
      expect(ids).toContain("src/sib.cpp:A::detail::f:function");
      expect(ids).toContain("src/sib.cpp:B::detail::f:function");
      // No member collapses onto the incomplete inner-only `detail` identity.
      expect(ids.filter(id => id.startsWith("src/sib.cpp:detail"))).toEqual([]);
      expect(ex.nodes.find(n => n.id === "src/sib.cpp:B::detail::f:function")!.source_location).toBe("L10");
      expect(callsFrom(ex, "src/sib.cpp:A::detail::g:function")).toEqual(["src/sib.cpp:A::detail::f:function"]);
      expect(callsFrom(ex, "src/sib.cpp:B::detail::g:function")).toEqual(["src/sib.cpp:B::detail::f:function"]);
      // Qualified calls are looked up relative to the enclosing namespace first.
      expect(callsFrom(ex, "src/sib.cpp:A::run:function")).toEqual(["src/sib.cpp:A::detail::f:function"]);
      expect(callsFrom(ex, "src/sib.cpp:B::run:function")).toEqual(["src/sib.cpp:B::detail::f:function"]);
      expect(callsFrom(ex, "src/sib.cpp:top:function")).toEqual([
        "src/sib.cpp:A::detail::f:function",
        "src/sib.cpp:B::detail::f:function",
      ]);
    });

    it("gives C++17 and ordinary nested spellings the same identity", () => {
      const ex = extractCpp(
        [
          "namespace A::B {",
          "  void h() {}",
          "}",
          "namespace A {",
          "  namespace B {",
          "    void f() { h(); }",
          "  }",
          "}",
          "namespace X {",
          "  namespace A::B {",
          "    void h() {}",
          "    void f() { h(); }",
          "  }",
          "}",
          "",
        ].join("\n"),
        "src/mix.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      expect(callsFrom(ex, "src/mix.cpp:A::B::f:function")).toEqual(["src/mix.cpp:A::B::h:function"]);
      expect(callsFrom(ex, "src/mix.cpp:X::A::B::f:function")).toEqual(["src/mix.cpp:X::A::B::h:function"]);
      expect(ex.nodes.some(n => n.id === "src/mix.cpp:X::A::B:module")).toBe(true);
    });

    it("qualifies anonymous-namespace members by the enclosing named namespace", () => {
      const ex = extractCpp(
        `namespace N {\n  namespace {\n    void b() {}\n  }\n  void a() { b(); }\n}\n`,
        "src/anon.cpp",
      );
      expect(callsFrom(ex, "src/anon.cpp:N::a:function")).toEqual(["src/anon.cpp:N::b:function"]);
    });

    it("never resolves a bare call to a nested namespace node", () => {
      const ex = extractCpp(
        `namespace A {\n  namespace detail {\n    void f() {}\n  }\n  void run() { detail(); }\n}\n`,
        "src/mod.cpp",
      );
      expect(ex.nodes.some(n => n.id === "src/mod.cpp:A::run:function")).toBe(true);
      expect(ex.edges.filter(e => e.relation === "calls")).toEqual([]);
    });

    it("honours explicit global qualification inside a namespace", () => {
      const ex = extractCpp(
        [
          "void helper() {}",
          "namespace A {",
          "  void f() {}",
          "}",
          "namespace N {",
          "  void helper() {}",
          "  namespace A {",
          "    void f() {}",
          "  }",
          "  void run() { ::helper(); helper(); }",
          "  void run2() { ::A::f(); A::f(); }",
          "}",
          "",
        ].join("\n"),
        "src/g.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      expect(callsFrom(ex, "src/g.cpp:N::run:function")).toEqual([
        "src/g.cpp:N::helper:function",
        "src/g.cpp:helper:function",
      ]);
      expect(callsFrom(ex, "src/g.cpp:N::run2:function")).toEqual([
        "src/g.cpp:A::f:function",
        "src/g.cpp:N::A::f:function",
      ]);
    });

    it("attributes every overload's calls to the single kept node", () => {
      const ex = extractCpp(
        `namespace N {\n  void h() {}\n  void f(int) { h(); }\n  void f(double) { h(); }\n}\n`,
        "src/ov.cpp",
      );
      expect(ex.nodes.filter(n => n.id === "src/ov.cpp:N::f:function")).toHaveLength(1);
      expect(callsFrom(ex, "src/ov.cpp:N::f:function")).toEqual([
        "src/ov.cpp:N::h:function",
        "src/ov.cpp:N::h:function",
      ]);
    });

    it("does not link a bare call whose name is a parameter or local", () => {
      const ex = extractCpp(
        [
          "void helper() {}",
          "void g(void (*helper)()) { helper(); }",
          "namespace N {",
          "  void helper() {}",
          "  void byPointer(void (*helper)()) { helper(); }",
          "  template<typename F>",
          "  void byRef(F&& helper) { helper(); }",
          "  void byLocal() { auto helper = [] {}; helper(); }",
          "  void byRange(Handlers hs) { for (auto helper : hs) helper(); }",
          "  void qualified(void (*helper)()) { N::helper(); ::helper(); helper(); }",
          "  void control(int other) { int x = 0; helper(); }",
          "}",
          "",
        ].join("\n"),
        "src/shadow.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      for (const fn of ["g", "N::byPointer", "N::byRef", "N::byLocal", "N::byRange"]) {
        expect(ex.nodes.some(n => n.id === `src/shadow.cpp:${fn}:function`)).toBe(true);
        expect(callsFrom(ex, `src/shadow.cpp:${fn}:function`)).toEqual([]);
      }
      // Qualified names bypass locals; the bare call alone is suppressed.
      expect(callsFrom(ex, "src/shadow.cpp:N::qualified:function")).toEqual([
        "src/shadow.cpp:N::helper:function",
        "src/shadow.cpp:helper:function",
      ]);
      expect(callsFrom(ex, "src/shadow.cpp:N::control:function")).toEqual(["src/shadow.cpp:N::helper:function"]);
    });

    it("does not credit calls in lambdas or local class methods to the outer function", () => {
      const ex = extractCpp(
        [
          "namespace N {",
          "  void helper() {}",
          "  void other() {}",
          "  void outer() {",
          "    auto cb = [] { other(); };",
          "    struct Local { void m() { other(); } };",
          "    helper();",
          "    cb();",
          "  }",
          "}",
          "",
        ].join("\n"),
        "src/nested.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      expect(callsFrom(ex, "src/nested.cpp:N::outer:function")).toEqual(["src/nested.cpp:N::helper:function"]);
      expect(ex.edges.filter(e => e.relation === "calls")).toHaveLength(1);
    });

    it("emits no call edge for calls outside any function body", () => {
      const ex = extractCpp(`int compute() { return 1; }\nint x = compute();\n`, "src/init.cpp");
      expect(ex.nodes.some(n => n.id === "src/init.cpp:compute:function")).toBe(true);
      expect(ex.edges.filter(e => e.relation === "calls")).toEqual([]);
    });

    it("resolves inside C++17 nested namespace definitions", () => {
      const ex = extractCpp(
        [
          "namespace A {",
          "  void g() {}",
          "}",
          "namespace A::B {",
          "  void h() {}",
          "  void f() { h(); g(); }",
          "}",
          "",
        ].join("\n"),
        "src/c17.cpp",
      );
      expect(ex.parse_errors).toHaveLength(0);
      expect(callsFrom(ex, "src/c17.cpp:A::B::f:function")).toEqual([
        "src/c17.cpp:A::B::h:function",
        "src/c17.cpp:A::g:function",
      ]);
    });

    it("attributes calls in namespaced template functions to the qualified node", () => {
      const ex = extractCpp(
        `namespace N {\n  void b() {}\n  template<typename T>\n  T a(T x) { b(); return x; }\n}\n`,
        "src/t.cpp",
      );
      expect(callsFrom(ex, "src/t.cpp:N::a:function")).toEqual(["src/t.cpp:N::b:function"]);
    });

    it("keeps anonymous-namespace members keyed and resolved unqualified", () => {
      const ex = extractCpp(
        `namespace {\n  void b() {}\n  void a() { b(); }\n}\n`,
        "src/anon.cpp",
      );
      expect(callsFrom(ex, "src/anon.cpp:a:function")).toEqual(["src/anon.cpp:b:function"]);
    });

    it("still emits no call edges from inline class methods (unsupported)", () => {
      const ex = extractCpp(
        `void helper() {}\nnamespace N {\n  class C {\n  public:\n    void m() { helper(); }\n  };\n}\n`,
        "src/c.cpp",
      );
      expect(ex.nodes.some(n => n.kind === "method")).toBe(false);
      expect(ex.edges.filter(e => e.relation === "calls")).toEqual([]);
    });
  });

  it("extracts #include as imports edge", () => {
    const ex = extractCpp(`#include <vector>\nvoid f() {}\n`, "src/a.cpp");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:vector");
    expect(imp).toBeDefined();
  });

  it("extracts struct as 'class'", () => {
    const ex = extractCpp(`struct Point { int x; int y; };\n`, "src/point.cpp");
    const s = ex.nodes.find(n => n.id === "src/point.cpp:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
  });

  it("extracts intra-file calls", () => {
    const ex = extractCpp(
      `void run() { helper(); }\nvoid helper() {}\n`,
      "src/a.cpp",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/a.cpp:run:function"
        && e.target === "src/a.cpp:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts template function", () => {
    const ex = extractCpp(
      `template<typename T>\nT max(T a, T b) { return a > b ? a : b; }\n`,
      "src/tmpl.cpp",
    );
    const fn_ = ex.nodes.find(n => n.label === "max" && n.kind === "function");
    expect(fn_).toBeDefined();
  });

  it("resolves calls via field_expression (this->method pattern)", () => {
    // Covers field_expression branch in collectCppCalls (lines 181-183)
    const ex = extractCpp(
      `void helper() {}\nvoid run() { auto p = nullptr; p->helper(); }\n`,
      "src/a.cpp",
    );
    // Mainly verifies no crash on field_expression; call resolution depends on enclosing class
    expect(ex.parse_errors).toHaveLength(0);
  });

  it("includes a module node for the file", () => {
    const ex = extractCpp(`void f() {}\n`, "src/a.cpp");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/a.cpp::module")).toBe(true);
  });

  it("produces no parse errors on valid C++", () => {
    const ex = extractCpp(
      `#include <string>\nclass Greeter {\npublic:\n  std::string greet(const std::string& name) { return "Hello " + name; }\n};\n`,
      "src/greeter.cpp",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});


describe("C++ namespace call binding controls", () => {
  it("structured bindings shadow namespace functions", () => {
    const ex = extractCpp(`namespace N {
void helper() {}
void run(Pair callbacks) { auto [helper, other] = callbacks; helper(); }
void control() { helper(); }
}`, "bindings.cpp");
    expect(ex.parse_errors).toEqual([]);
    expect(ex.edges.filter(e => e.relation === "calls" && e.source === "bindings.cpp:N::run:function")).toEqual([]);
    expect(ex.edges.some(e => e.relation === "calls" && e.source === "bindings.cpp:N::control:function" && e.target === "bindings.cpp:N::helper:function")).toBe(true);
  });

  it.each([
    "namespace N { void helper() {} void run() { auto & = helper(); } }",
    "namespace N { void helper() {} void run() { int (*); helper(); } }",
  ])("keeps partial declarators from terminating extraction: %s", (source) => {
    expect(() => extractCpp(source, "partial.cpp")).not.toThrow();
  });
});
