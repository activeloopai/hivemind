import { describe, it, expect } from "vitest";
import { extractGo } from "../../../src/graph/extract/go.js";

describe("Go extraction", () => {
  it("extracts a top-level function and labels it 'function'", () => {
    const ex = extractGo(`package main\nfunc Hello() string { return "hi" }\n`, "pkg/hello.go");
    expect(ex.language).toBe("go");
    const fn = ex.nodes.find(n => n.id === "pkg/hello.go:Hello:function");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.label).toBe("Hello");
    expect(fn!.exported).toBe(true); // uppercase = exported
  });

  it("extracts lowercase function (Go convention: unexported, but extractor marks exported=true)", () => {
    const ex = extractGo(`package main\nfunc helper() {}\n`, "pkg/a.go");
    const fn = ex.nodes.find(n => n.label === "helper");
    expect(fn).toBeDefined();
    // Go methods check uppercase; top-level functions are marked exported=true by the extractor
    expect(fn!.exported).toBe(true);
  });

  it("extracts a struct as 'class'", () => {
    const ex = extractGo(`package main\ntype User struct { Name string }\n`, "pkg/user.go");
    const cls = ex.nodes.find(n => n.id === "pkg/user.go:User:class");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
    expect(cls!.exported).toBe(true);
  });

  it("extracts an interface as 'interface'", () => {
    const ex = extractGo(`package main\ntype Reader interface { Read(p []byte) (int, error) }\n`, "pkg/reader.go");
    const iface = ex.nodes.find(n => n.id === "pkg/reader.go:Reader:interface");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  it("extracts a method with method_of edge", () => {
    const ex = extractGo(
      `package main\ntype User struct{}\nfunc (u User) Greet() string { return u.Name }\n`,
      "pkg/user.go",
    );
    const method = ex.nodes.find(n => n.id === "pkg/user.go:User.Greet:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    expect(method!.label).toBe("Greet");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
    expect(edge!.source).toBe("pkg/user.go:User:class");
  });

  it("extracts a method on a pointer receiver", () => {
    const ex = extractGo(
      `package main\ntype Repo struct{}\nfunc (r *Repo) Save() error { return nil }\n`,
      "pkg/repo.go",
    );
    const method = ex.nodes.find(n => n.label === "Save");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
  });

  it("extracts import as an imports edge", () => {
    const ex = extractGo(`package main\nimport "fmt"\nfunc f() { fmt.Println() }\n`, "pkg/a.go");
    const imp = ex.edges.find(e => e.relation === "imports" && e.target === "external:fmt");
    expect(imp).toBeDefined();
  });

  it("extracts grouped imports", () => {
    const ex = extractGo(
      `package main\nimport (\n  "fmt"\n  "os"\n)\n`,
      "pkg/a.go",
    );
    expect(ex.edges.some(e => e.target === "external:fmt")).toBe(true);
    expect(ex.edges.some(e => e.target === "external:os")).toBe(true);
  });

  it("const_spec produces kind 'const' and var_spec produces kind 'variable'", () => {
    const ex = extractGo(
      `package main\nconst MaxSize = 100\nvar counter int\n`,
      "pkg/a.go",
    );
    const c = ex.nodes.find(n => n.label === "MaxSize");
    expect(c).toBeDefined();
    expect(c!.kind).toBe("const");
    const v = ex.nodes.find(n => n.label === "counter");
    expect(v).toBeDefined();
    expect(v!.kind).toBe("variable");
  });

  it("extracts intra-file calls", () => {
    const ex = extractGo(
      `package main\nfunc Run() { helper() }\nfunc helper() {}\n`,
      "pkg/a.go",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "pkg/a.go:Run:function"
        && e.target === "pkg/a.go:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts a method on a pointer receiver (*Foo) and resolves the receiver type", () => {
    // Covers the pointer_type branch in extractReceiverType
    const ex = extractGo(
      `package main\ntype Stack struct{}\nfunc (s *Stack) Push(v int) {}\n`,
      "pkg/stack.go",
    );
    const method = ex.nodes.find(n => n.label === "Push" && n.kind === "method");
    expect(method).toBeDefined();
    const edge = ex.edges.find(e => e.relation === "method_of" && e.source === "pkg/stack.go:Stack:class");
    expect(edge).toBeDefined();
  });

  it("resolves call from a method to a free function (triggers method_declaration branch in findEnclosingFn)", () => {
    // Covers lines 232-243: when collectCalls finds an identifier call inside a
    // method body, findEnclosingFn walks up to a method_declaration to find the caller.
    const ex = extractGo(
      `package main\nfunc setup() {}\ntype Svc struct{}\nfunc (s *Svc) Run() { setup() }\n`,
      "pkg/svc.go",
    );
    const run = ex.nodes.find(n => n.id === "pkg/svc.go:Svc.Run:method");
    const setup = ex.nodes.find(n => n.id === "pkg/svc.go:setup:function");
    expect(run).toBeDefined();
    expect(setup).toBeDefined();
    const call = ex.edges.find(e => e.relation === "calls" && e.source === run!.id && e.target === setup!.id);
    expect(call).toBeDefined();
  });

  describe("generic method receivers", () => {
    const src = [
      "package main",
      "type Box[T any] struct { v T }",
      "type Pair[K comparable, V any] struct { k K; v V }",
      "type Plain struct{}",
      "func boxHelper() {}",
      "func pairHelper() {}",
      "func (b Box[T]) Get() T { boxHelper(); return b.v }",
      "func (b *Box[T]) Set(v T) { b.v = v }",
      "func (p Pair[K, V]) Get() V { pairHelper(); return p.v }",
      "func (p *Pair[K, V]) Set(v V) { p.v = v }",
      "func (p Plain) Get() int { return 0 }",
      "func (p *Plain) Set(v int) {}",
      "",
    ].join("\n");
    const ex = extractGo(src, "pkg/gen.go");
    const methodOf = (id: string) =>
      ex.edges.filter(e => e.relation === "method_of" && e.target === id).map(e => e.source);

    it("parses generic declarations without errors", () => {
      expect(ex.parse_errors).toHaveLength(0);
      expect(ex.nodes.some(n => n.id === "pkg/gen.go:Box:class")).toBe(true);
      expect(ex.nodes.some(n => n.id === "pkg/gen.go:Pair:class")).toBe(true);
    });

    it("keys same-named methods on different generic types by their base type", () => {
      const ids = ex.nodes.filter(n => n.kind === "method").map(n => n.id).sort();
      expect(ids).toEqual([
        "pkg/gen.go:Box.Get:method",
        "pkg/gen.go:Box.Set:method",
        "pkg/gen.go:Pair.Get:method",
        "pkg/gen.go:Pair.Set:method",
        "pkg/gen.go:Plain.Get:method",
        "pkg/gen.go:Plain.Set:method",
      ]);
      expect(ex.nodes.some(n => n.id === "pkg/gen.go:Get:method")).toBe(false);
      expect(ex.nodes.some(n => n.id === "pkg/gen.go:Set:method")).toBe(false);
    });

    it("emits method_of from the base type for value and pointer generic receivers", () => {
      expect(methodOf("pkg/gen.go:Box.Get:method")).toEqual(["pkg/gen.go:Box:class"]);
      expect(methodOf("pkg/gen.go:Box.Set:method")).toEqual(["pkg/gen.go:Box:class"]);
      expect(methodOf("pkg/gen.go:Pair.Get:method")).toEqual(["pkg/gen.go:Pair:class"]);
      expect(methodOf("pkg/gen.go:Pair.Set:method")).toEqual(["pkg/gen.go:Pair:class"]);
    });

    it("still resolves ordinary value and pointer receivers alongside generics", () => {
      expect(methodOf("pkg/gen.go:Plain.Get:method")).toEqual(["pkg/gen.go:Plain:class"]);
      expect(methodOf("pkg/gen.go:Plain.Set:method")).toEqual(["pkg/gen.go:Plain:class"]);
    });

    it("attributes calls inside generic methods to the owning method", () => {
      const calls = ex.edges
        .filter(e => e.relation === "calls")
        .map(e => `${e.source} -> ${e.target}`)
        .sort();
      expect(calls).toEqual([
        "pkg/gen.go:Box.Get:method -> pkg/gen.go:boxHelper:function",
        "pkg/gen.go:Pair.Get:method -> pkg/gen.go:pairHelper:function",
      ]);
    });
  });

  it("leaves a parenthesized receiver type unresolved (no method_of edge)", () => {
    const ex = extractGo(
      `package main\ntype Box[T any] struct{}\nfunc (b (Box[T])) Odd() {}\n`,
      "pkg/odd.go",
    );
    const odd = ex.nodes.find(n => n.label === "Odd" && n.kind === "method");
    expect(odd).toBeDefined();
    expect(ex.edges.some(e => e.relation === "method_of" && e.target === odd!.id)).toBe(false);
  });

  it("includes a module node for the file", () => {
    const ex = extractGo(`package main\n`, "pkg/a.go");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "pkg/a.go::module")).toBe(true);
  });

  it("produces no parse errors on valid Go", () => {
    const ex = extractGo(
      `package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }\n`,
      "main.go",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});
