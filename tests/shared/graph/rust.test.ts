import { describe, it, expect } from "vitest";
import { extractRust } from "../../../src/graph/extract/rust.js";

describe("Rust extraction", () => {
  it("extracts a pub fn as function, exported=true", () => {
    const ex = extractRust(`pub fn greet() -> &'static str { "hi" }\n`, "src/lib.rs");
    const fn_ = ex.nodes.find(n => n.id === "src/lib.rs:greet:function");
    expect(fn_).toBeDefined();
    expect(fn_!.kind).toBe("function");
    expect(fn_!.exported).toBe(true);
    expect(ex.language).toBe("rust");
  });

  it("private fn has exported=false", () => {
    const ex = extractRust(`fn internal() {}\n`, "src/lib.rs");
    const fn_ = ex.nodes.find(n => n.label === "internal");
    expect(fn_).toBeDefined();
    expect(fn_!.exported).toBe(false);
  });

  it("extracts struct as 'class'", () => {
    const ex = extractRust(`pub struct Point { x: f64, y: f64 }\n`, "src/point.rs");
    const s = ex.nodes.find(n => n.id === "src/point.rs:Point:class");
    expect(s).toBeDefined();
    expect(s!.kind).toBe("class");
    expect(s!.exported).toBe(true);
  });

  it("extracts enum as 'enum'", () => {
    const ex = extractRust(`pub enum Color { Red, Green, Blue }\n`, "src/color.rs");
    const e = ex.nodes.find(n => n.id === "src/color.rs:Color:enum");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("enum");
  });

  it("extracts trait as 'interface'", () => {
    const ex = extractRust(`pub trait Drawable { fn draw(&self); }\n`, "src/draw.rs");
    const t = ex.nodes.find(n => n.id === "src/draw.rs:Drawable:interface");
    expect(t).toBeDefined();
    expect(t!.kind).toBe("interface");
  });

  it("extracts impl methods with method_of edges and Type::method key", () => {
    const ex = extractRust(
      `pub struct Rect { w: f64, h: f64 }\nimpl Rect {\n  pub fn area(&self) -> f64 { self.w * self.h }\n}\n`,
      "src/rect.rs",
    );
    const method = ex.nodes.find(n => n.id === "src/rect.rs:Rect::area:method");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    expect(method!.label).toBe("area");
    const edge = ex.edges.find(e => e.relation === "method_of" && e.target === method!.id);
    expect(edge).toBeDefined();
    expect(edge!.source).toBe("src/rect.rs:Rect:class");
  });

  it("extracts mod as 'module'", () => {
    const ex = extractRust(`pub mod utils {}\n`, "src/lib.rs");
    const m = ex.nodes.find(n => n.id === "src/lib.rs:utils:module");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("module");
  });

  it("extracts inline mod declarations inside mod body", () => {
    const ex = extractRust(`pub mod inner { pub fn helper() {} }\n`, "src/lib.rs");
    expect(ex.nodes.some(n => n.label === "helper" && n.kind === "function")).toBe(true);
  });

  it("extracts const as 'const'", () => {
    const ex = extractRust(`pub const MAX: usize = 100;\n`, "src/lib.rs");
    const c = ex.nodes.find(n => n.id === "src/lib.rs:MAX:const");
    expect(c).toBeDefined();
    expect(c!.kind).toBe("const");
  });

  it("extracts use declaration as imports edge", () => {
    const ex = extractRust(`use std::io::Read;\nfn f() {}\n`, "src/lib.rs");
    expect(ex.edges.some(e => e.relation === "imports" && e.target.includes("std"))).toBe(true);
  });

  it("extracts intra-file calls", () => {
    const ex = extractRust(
      `fn run() { helper(); }\nfn helper() {}\n`,
      "src/lib.rs",
    );
    const call = ex.edges.find(
      e => e.relation === "calls"
        && e.source === "src/lib.rs:run:function"
        && e.target === "src/lib.rs:helper:function",
    );
    expect(call).toBeDefined();
  });

  it("extracts use with scoped path (std::io::Read)", () => {
    // Covers extractUsePath scoped_identifier / nested path branches
    const ex = extractRust(`use std::io::{Read, Write};\nfn f() {}\n`, "src/lib.rs");
    expect(ex.edges.some(e => e.relation === "imports" && e.target.startsWith("external:"))).toBe(true);
  });

  it("resolves call from an impl method to a free function", () => {
    const ex = extractRust(
      `fn setup() {}\nstruct Worker {}\nimpl Worker {\n  pub fn run(&self) { setup(); }\n}\n`,
      "src/worker.rs",
    );
    const run = ex.nodes.find(n => n.id === "src/worker.rs:Worker::run:method");
    const setup = ex.nodes.find(n => n.id === "src/worker.rs:setup:function");
    expect(run).toBeDefined();
    expect(setup).toBeDefined();
    const call = ex.edges.find(e => e.relation === "calls" && e.source === run!.id && e.target === setup!.id);
    expect(call).toBeDefined();
  });

  it("includes a module node for the file", () => {
    const ex = extractRust(`fn f() {}\n`, "src/lib.rs");
    expect(ex.nodes.some(n => n.kind === "module" && n.id === "src/lib.rs::module")).toBe(true);
  });

  it("produces no parse errors on valid Rust", () => {
    const ex = extractRust(
      `use std::fmt;\npub struct Point { x: i32, y: i32 }\nimpl Point {\n  pub fn new(x: i32, y: i32) -> Self { Point { x, y } }\n}\n`,
      "src/point.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
  });
});

describe("Rust impl method ownership", () => {
  const calls = (ex: ReturnType<typeof extractRust>) =>
    ex.edges.filter(e => e.relation === "calls").map(e => `${e.source} -> ${e.target}`).sort();
  const methodOf = (ex: ReturnType<typeof extractRust>) =>
    ex.edges.filter(e => e.relation === "method_of").map(e => `${e.source} -> ${e.target}`).sort();

  it("attributes calls from A::new, B::new and a free new to their own declarations", () => {
    const ex = extractRust(
      [
        "fn helper_a() {}",
        "fn helper_b() {}",
        "fn helper_free() {}",
        "fn new() { helper_free(); }",
        "struct A;",
        "impl A { fn new() -> A { helper_a(); A } }",
        "struct B;",
        "impl B { fn new() -> B { helper_b(); B } }",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.filter(n => n.label === "new").map(n => n.id).sort()).toEqual([
      "src/lib.rs:A::new:method",
      "src/lib.rs:B::new:method",
      "src/lib.rs:new:function",
    ]);
    expect(calls(ex)).toEqual([
      "src/lib.rs:A::new:method -> src/lib.rs:helper_a:function",
      "src/lib.rs:B::new:method -> src/lib.rs:helper_b:function",
      "src/lib.rs:new:function -> src/lib.rs:helper_free:function",
    ]);
  });

  it("does not misattribute same-named impl methods when there is no free fn", () => {
    const ex = extractRust(
      "fn helper() {}\nstruct A;\nstruct B;\nimpl A { fn run(&self) {} }\nimpl B { fn run(&self) { helper(); } }\n",
      "src/lib.rs",
    );
    expect(calls(ex)).toEqual(["src/lib.rs:B::run:method -> src/lib.rs:helper:function"]);
  });

  it("links enum impl methods to the enum node", () => {
    const ex = extractRust(
      "pub enum Color { Red, Green }\nimpl Color { pub fn is_red(&self) -> bool { true } }\n",
      "src/color.rs",
    );
    expect(methodOf(ex)).toEqual(["src/color.rs:Color:enum -> src/color.rs:Color::is_red:method"]);
  });

  it("links generic struct impl methods to the base struct node", () => {
    const ex = extractRust(
      "fn helper() {}\npub struct Wrapper<T> { v: T }\nimpl<T> Wrapper<T> { pub fn get(&self) -> &T { helper(); &self.v } }\n",
      "src/wrap.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.some(n => n.id === "src/wrap.rs:Wrapper<T>::get:method")).toBe(true);
    expect(methodOf(ex)).toEqual(["src/wrap.rs:Wrapper:class -> src/wrap.rs:Wrapper<T>::get:method"]);
    expect(calls(ex)).toEqual(["src/wrap.rs:Wrapper<T>::get:method -> src/wrap.rs:helper:function"]);
  });

  it("keeps specialized generic impls distinct while linking both to the base type", () => {
    const ex = extractRust(
      [
        "pub struct Box<T>(T);",
        "fn for_i32() {}",
        "fn for_u32() {}",
        "impl Box<i32> {",
        "  pub fn get(&self) { for_i32(); }",
        "}",
        "impl Box<u32> {",
        "  fn get(&self) {",
        "    for_u32();",
        "  }",
        "}",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    const gets = ex.nodes.filter(n => n.label === "get");
    expect(gets.map(n => [n.id, n.kind, n.source_location, n.exported])).toEqual([
      ["src/lib.rs:Box<i32>::get:method", "method", "L5", true],
      ["src/lib.rs:Box<u32>::get:method", "method", "L8-10", false],
    ]);
    expect(methodOf(ex)).toEqual([
      "src/lib.rs:Box:class -> src/lib.rs:Box<i32>::get:method",
      "src/lib.rs:Box:class -> src/lib.rs:Box<u32>::get:method",
    ]);
    expect(calls(ex)).toEqual([
      "src/lib.rs:Box<i32>::get:method -> src/lib.rs:for_i32:function",
      "src/lib.rs:Box<u32>::get:method -> src/lib.rs:for_u32:function",
    ]);
  });

  it("resolves owners declared after the impl block", () => {
    const ex = extractRust(
      "impl Late { fn a(&self) {} }\nimpl Shape { fn b(&self) {} }\nstruct Late;\nenum Shape { Sq }\n",
      "src/lib.rs",
    );
    expect(methodOf(ex)).toEqual([
      "src/lib.rs:Late:class -> src/lib.rs:Late::a:method",
      "src/lib.rs:Shape:enum -> src/lib.rs:Shape::b:method",
    ]);
  });

  it("resolves specialized and trait impl owners declared after the impl block", () => {
    const ex = extractRust(
      [
        "impl Tr for Late<u8> { fn a(&self) {} }",
        "impl Late<u16> { fn a(&self) {} }",
        "struct Late<T>(T);",
        "trait Tr { fn a(&self); }",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(methodOf(ex)).toEqual([
      "src/lib.rs:Late:class -> src/lib.rs:<Late<u8> as Tr>::a:method",
      "src/lib.rs:Late:class -> src/lib.rs:Late<u16>::a:method",
    ]);
  });

  it("emits no method_of edge for foreign or scoped impl types", () => {
    const ex = extractRust(
      "impl Foreign { fn a(&self) {} }\nimpl other::Scoped { fn b(&self) {} }\nimpl<'x> Local for &'x str { fn c(&self) {} }\nimpl other::Gen<u8> { fn d(&self) {} }\ntrait Local { fn c(&self); }\n",
      "src/lib.rs",
    );
    expect(ex.nodes.filter(n => n.kind === "method").map(n => n.id)).toEqual([
      "src/lib.rs:Foreign::a:method",
      "src/lib.rs:other::Scoped::b:method",
      "src/lib.rs:<&'x str as Local>::c:method",
      "src/lib.rs:other::Gen<u8>::d:method",
    ]);
    expect(methodOf(ex)).toEqual([]);
  });

  it("links owners only within the impl's own inline module", () => {
    const ex = extractRust(
      [
        "struct A;",
        "mod m {",
        "  struct B;",
        "  impl B { fn g(&self) {} }",
        "  impl A { fn f(&self) {} }",
        "  impl super::A { fn h(&self) {} }",
        "}",
        "impl B { fn top(&self) {} }",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.filter(n => n.kind === "method").map(n => n.id)).toEqual([
      "src/lib.rs:B::g:method",
      "src/lib.rs:A::f:method",
      "src/lib.rs:super::A::h:method",
      "src/lib.rs:B::top:method",
    ]);
    expect(methodOf(ex)).toEqual(["src/lib.rs:B:class -> src/lib.rs:B::g:method"]);
  });

  it("keeps same-named methods from distinct trait impls and the inherent impl on one type", () => {
    const ex = extractRust(
      [
        "fn h1() {}",
        "fn h2() {}",
        "fn h3() {}",
        "struct A;",
        "trait T1 { fn go(&self); }",
        "trait T2 { fn go(&self); }",
        "impl T1 for A { fn go(&self) { h1(); } }",
        "impl T2 for A {",
        "  fn go(&self) { h2(); }",
        "}",
        "impl A { pub fn go(&self) { h3(); } }",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.filter(n => n.kind === "method").map(n => [n.id, n.label, n.source_location])).toEqual([
      ["src/lib.rs:<A as T1>::go:method", "go", "L7"],
      ["src/lib.rs:<A as T2>::go:method", "go", "L9"],
      ["src/lib.rs:A::go:method", "go", "L11"],
    ]);
    expect(methodOf(ex)).toEqual([
      "src/lib.rs:A:class -> src/lib.rs:<A as T1>::go:method",
      "src/lib.rs:A:class -> src/lib.rs:<A as T2>::go:method",
      "src/lib.rs:A:class -> src/lib.rs:A::go:method",
    ]);
    expect(calls(ex)).toEqual([
      "src/lib.rs:<A as T1>::go:method -> src/lib.rs:h1:function",
      "src/lib.rs:<A as T2>::go:method -> src/lib.rs:h2:function",
      "src/lib.rs:A::go:method -> src/lib.rs:h3:function",
    ]);
  });

  it("keeps generic trait impls with different arguments distinct", () => {
    const ex = extractRust(
      [
        "struct N(i64);",
        "impl From<i32> for N { fn from(v: i32) -> Self { N(v as i64) } }",
        "impl From<u32> for N { fn from(v: u32) -> Self { N(v as i64) } }",
        "",
      ].join("\n"),
      "src/n.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(methodOf(ex)).toEqual([
      "src/n.rs:N:class -> src/n.rs:<N as From<i32>>::from:method",
      "src/n.rs:N:class -> src/n.rs:<N as From<u32>>::from:method",
    ]);
  });

  it("skips non-fn impl members", () => {
    const ex = extractRust(
      "struct A;\ntrait Tr { type Out; const N: u8; fn f(&self); }\nimpl Tr for A { type Out = u8; const N: u8 = 1; fn f(&self) {} }\n",
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.filter(n => n.kind === "method").map(n => n.id)).toEqual(["src/lib.rs:<A as Tr>::f:method"]);
  });

  it("merges cfg-duplicated declarations into the first node without losing calls", () => {
    const ex = extractRust(
      [
        "fn x() {}",
        "fn y() {}",
        "#[cfg(unix)]",
        "fn a() { x(); }",
        "#[cfg(not(unix))]",
        "fn a() { y(); }",
        "#[cfg(unix)]",
        "struct S;",
        "#[cfg(not(unix))]",
        "struct S;",
        "#[cfg(unix)]",
        "impl S { fn m(&self) { x(); } }",
        "#[cfg(not(unix))]",
        "impl S { fn m(&self) { y(); } }",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(ex.nodes.filter(n => n.label === "a").map(n => [n.id, n.source_location])).toEqual([
      ["src/lib.rs:a:function", "L4"],
    ]);
    expect(ex.nodes.filter(n => n.label === "m").map(n => [n.id, n.source_location])).toEqual([
      ["src/lib.rs:S::m:method", "L12"],
    ]);
    expect(methodOf(ex)).toEqual(["src/lib.rs:S:class -> src/lib.rs:S::m:method"]);
    expect(calls(ex)).toEqual([
      "src/lib.rs:S::m:method -> src/lib.rs:x:function",
      "src/lib.rs:S::m:method -> src/lib.rs:y:function",
      "src/lib.rs:a:function -> src/lib.rs:x:function",
      "src/lib.rs:a:function -> src/lib.rs:y:function",
    ]);
  });

  it("does not credit calls in nested fns, closures or trait default bodies to an outer fn", () => {
    const ex = extractRust(
      [
        "fn helper() {}",
        "fn outer() { fn inner() { helper(); } inner(); }",
        "fn with_closure() { let f = || helper(); f(); helper(); }",
        "trait Tr { fn d(&self) { helper(); } }",
        "struct W;",
        "impl W {",
        "  fn m(&self) {",
        "    fn nested() { helper(); }",
        "    let c = |v: u8| { helper(); v };",
        "  }",
        "}",
        "",
      ].join("\n"),
      "src/lib.rs",
    );
    expect(ex.parse_errors).toHaveLength(0);
    expect(calls(ex)).toEqual(["src/lib.rs:with_closure:function -> src/lib.rs:helper:function"]);
  });
});


describe("Rust impl identity literal preservation", () => {
  it("preserves literal bytes inside const-generic type expressions", () => {
    const source = `struct Width<const N: usize>;
impl Width<{ b"a  b".len() }> { fn get(&self) {} }
impl Width<{ b"a b".len() }> { fn get(&self) {} }
`;
    const result = extractRust(source, "width.rs");
    expect(result.parse_errors).toEqual([]);
    const methods = result.nodes.filter((node) => node.kind === "method");
    expect(methods).toHaveLength(2);
    expect(new Set(methods.map((node) => node.id)).size).toBe(2);
    expect(methods.some((node) => node.id.includes('b"a  b"'))).toBe(true);
    expect(methods.some((node) => node.id.includes('b"a b"'))).toBe(true);
  });
});
