import { describe, it, expect } from "vitest";
import { tokenize, uniqueTerms, bigrams } from "../../../src/recall/tokenize.js";
import { classifyFailure, failureKey, normalizeErrorText } from "../../../src/recall/error-normalize.js";

describe("tokenize", () => {
  it("keeps identifiers whole and adds their camel / snake parts", () => {
    const t = tokenize("TypeError in ensure_lookup_index");
    expect(t).toEqual(expect.arrayContaining(["typeerror", "type", "error", "ensure_lookup_index", "ensure", "lookup", "index"]));
  });

  it("drops stopwords, numbers, hex hashes and short tokens", () => {
    expect(tokenize("the 404 a deadbeef12 at x of")).toEqual([]);
  });

  it("folds simple plurals so errors ≈ error", () => {
    expect(tokenize("errors")).toEqual(["error"]);
    expect(tokenize("status class")).toEqual(["status", "class"]);
  });

  it("uniqueTerms dedupes in first-seen order", () => {
    expect(uniqueTerms("timeout timeout socket")).toEqual(["timeout", "socket"]);
  });

  it("bigrams skip stopwords and numbers so ids don't break a phrase", () => {
    const a = bigrams("table with oid 1234 not found");
    const b = bigrams("Error: table with oid 99 not found");
    expect([...a]).toEqual(["table oid", "oid found"]);
    for (const p of a) expect(b.has(p)).toBe(true);
  });

  it("bigrams do not span lines", () => {
    expect(bigrams("alpha\nbeta").size).toBe(0);
  });
});

describe("normalizeErrorText", () => {
  it("keeps error lines and strips paths, numbers, uuids, timestamps, hashes, ANSI", () => {
    const raw = [
      "Exit code 1",
      "\x1b[31mnpm run build\x1b[0m",
      "2026-11-04T05:34:50.143Z ERROR deploy 3f9a2b1c7d failed for 550e8400-e29b-41d4-a716-446655440000",
      "    at main (/home/alice/proj/src/index.js:10:3)",
      "Error: Cannot find module '/home/alice/proj/node_modules/foo/index.js'",
    ].join("\n");
    const out = normalizeErrorText(raw);
    expect(out).toBe("ERROR deploy failed for\nError: Cannot find module 'index.js'");
  });

  it("falls back to the last lines when nothing looks like an error", () => {
    expect(normalizeErrorText("one\ntwo\nthree\nfour")).toBe("two\nthree\nfour");
  });

  it("maps the same error from two machines to the same terms", () => {
    const a = classifyFailure({ tool_name: "Bash", error: "Exit code 2\npsql: FATAL: database \"app\" does not exist (pid 4412) at /home/a/x.sql:3" });
    const b = classifyFailure({ tool_name: "Bash", error: "Exit code 2\npsql: FATAL: database \"app\" does not exist (pid 18) at /Users/b/y/x.sql:9" });
    expect(a.worthy && b.worthy).toBe(true);
    if (a.worthy && b.worthy) expect(failureKey(a.terms)).toBe(failureKey(b.terms));
  });

  it("keeps digits inside identifiers (error codes stay matchable)", () => {
    const v = classifyFailure({ tool_name: "Bash", error: "error TS2345: Argument of type 'string' is not assignable" });
    expect(v.worthy && v.terms.includes("ts2345")).toBe(true);
  });
});

describe("classifyFailure", () => {
  const bash = (error: unknown) => classifyFailure({ tool_name: "Bash", error });

  it("accepts a real Bash error", () => {
    const v = bash("Exit code 1\nError: connect ECONNREFUSED 127.0.0.1:5432");
    expect(v.worthy).toBe(true);
    if (v.worthy) expect(v.terms).toEqual(expect.arrayContaining(["econnrefused", "connect"]));
  });

  it("accepts MCP tool errors", () => {
    expect(classifyFailure({ tool_name: "mcp__db__query", error: "relation \"users\" does not exist in schema" }).worthy).toBe(true);
  });

  it.each([
    [{ tool_name: "Edit", error: "String to replace not found in file." }, "tool"],
    [{ tool_name: "Read", error: "File does not exist." }, "tool"],
    [{ tool_name: "Bash", error: "Exit code 1" }, "vague"],
    [{ tool_name: "Bash", error: "" }, "empty"],
    [{ tool_name: "Bash", error: "The user doesn't want to proceed with this tool use." }, "interaction"],
    [{ tool_name: "Bash", error: "Exit code 1\nfoo failed", is_interrupt: true }, "interrupt"],
  ])("rejects %o as %s", (input, reason) => {
    const v = classifyFailure(input);
    expect(v.worthy).toBe(false);
    if (!v.worthy) expect(v.reason).toBe(reason);
  });

  it("reads the message out of an object-shaped error", () => {
    expect(classifyFailure({ tool_name: "Bash", error: { message: "fatal: unable to access remote: Could not resolve host" } }).worthy).toBe(true);
  });
});

describe("normalizeErrorText — scrubbing edge cases", () => {
  it("reduces URLs to their host", () => {
    expect(normalizeErrorText("Error: fetch failed https://api.example.com/v1/x?id=9")).toBe("Error: fetch failed api.example.com");
  });

  it("serializes object errors that carry no known message key", () => {
    const v = classifyFailure({ tool_name: "Bash", error: { code: "ECONNRESET", detail: "socket hang up while uploading" } });
    expect(v.worthy).toBe(true);
  });

  it("treats a non-string, non-object error as empty", () => {
    expect(classifyFailure({ tool_name: "Bash", error: 42 })).toEqual({ worthy: false, reason: "empty" });
  });
});

describe("ports and error-code anchors", () => {
  it("turns host:port into a port token on both the error and the summary side", async () => {
    const { markPorts, isAnchor } = await import("../../../src/recall/tokenize.js");
    expect(markPorts("connect ECONNREFUSED 127.0.0.1:5432")).toContain("port5432");
    expect(markPorts("dial tcp [::1]:6379: refused")).toContain("port6379");
    expect(markPorts("connect ECONNREFUSED ::1:6379")).toContain("port6379");
    expect(markPorts("listening on port 8080")).toContain("port8080");
    expect(markPorts("see src/a.ts:120:5")).not.toContain("port");
    expect(tokenize("127.0.0.1:5432")).toEqual(["port5432"]);
    for (const t of ["port5432", "ts2345", "e0382", "42p01", "ora00942"]) expect(isAnchor(t)).toBe(true);
    for (const t of ["v2", "utf8", "org_123", "econnrefused", "x86"]) expect(isAnchor(t)).toBe(false);
  });

  it("keeps the port through error normalization", () => {
    const v = classifyFailure({ tool_name: "Bash", error: "Exit code 1\nError: connect ECONNREFUSED 127.0.0.1:5433" });
    expect(v.worthy && v.terms).toEqual(expect.arrayContaining(["econnrefused", "port5433"]));
  });
});
