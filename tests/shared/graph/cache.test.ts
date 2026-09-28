import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CACHE_SCHEMA_VERSION,
  cacheDir,
  cachePath,
  fileContentHash,
  readCache,
  writeCache,
} from "../../../src/graph/cache.js";
import { extractTypeScript } from "../../../src/graph/extract/typescript.js";
import { buildSnapshot } from "../../../src/graph/snapshot.js";
import type { FileExtraction, GraphMetadata, GraphObservation } from "../../../src/graph/types.js";

function makeExtraction(sourceFile: string): FileExtraction {
  return {
    source_file: sourceFile,
    language: "typescript",
    nodes: [
      {
        id: `${sourceFile}::module`,
        label: sourceFile,
        kind: "module",
        source_file: sourceFile,
        source_location: "L1",
        language: "typescript",
        exported: false,
      },
      {
        id: `${sourceFile}:foo:function`,
        label: "foo",
        kind: "function",
        source_file: sourceFile,
        source_location: "L5",
        language: "typescript",
        exported: true,
      },
    ],
    edges: [
      {
        source: `${sourceFile}::module`,
        target: "external:./bar",
        relation: "imports",
        confidence: "EXTRACTED",
      },
      {
        source: `${sourceFile}:foo:function`,
        target: `unresolved:${sourceFile}:Base:class`,
        relation: "calls",
        confidence: "EXTRACTED",
      },
    ],
    parse_errors: [{ source_file: sourceFile, message: "test", location: "L1" }],
  };
}

describe("cache — content hash", () => {
  it("fileContentHash is deterministic and content-only", () => {
    const a = "export function foo() {}";
    const b = "export function foo() {}";
    const c = "export function bar() {}";
    expect(fileContentHash(a)).toBe(fileContentHash(b));
    expect(fileContentHash(a)).not.toBe(fileContentHash(c));
    expect(fileContentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("cache — paths", () => {
  it("cacheDir lives inside baseDir", () => {
    expect(cacheDir("/tmp/foo")).toBe(join("/tmp/foo", ".cache"));
  });
  it("cachePath composes dir + hash + .json", () => {
    expect(cachePath("/tmp/foo", "abc")).toBe(join("/tmp/foo", ".cache", "abc.json"));
  });
});

describe("cache — read/write roundtrip", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "graph-cache-"));
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("returns null on cache miss", () => {
    expect(readCache(baseDir, "nonexistent", "src/foo.ts")).toBeNull();
  });

  it("writeCache then readCache returns the same extraction", () => {
    const sha = "deadbeef";
    const ex = makeExtraction("src/foo.ts");
    writeCache(baseDir, sha, ex);
    const got = readCache(baseDir, sha, "src/foo.ts");
    expect(got).not.toBeNull();
    expect(got!.nodes).toEqual(ex.nodes);
    expect(got!.edges).toEqual(ex.edges);
    expect(got!.parse_errors).toEqual(ex.parse_errors);
  });

  it("rewrites source_file when relativePath differs from cached path", () => {
    const sha = "deadbeef";
    const original = makeExtraction("src/foo.ts");
    writeCache(baseDir, sha, original);
    const got = readCache(baseDir, sha, "src/renamed.ts");
    expect(got).not.toBeNull();
    expect(got!.source_file).toBe("src/renamed.ts");
    // Node IDs: source_file prefix must be rewritten on EVERY node
    for (const n of got!.nodes) {
      expect(n.source_file).toBe("src/renamed.ts");
      expect(n.id.startsWith("src/renamed.ts:") || n.id === "src/renamed.ts::module").toBe(true);
      expect(n.id).not.toMatch(/src\/foo\.ts/);
    }
    // Edge source + target rewritten too
    for (const e of got!.edges) {
      expect(e.source).not.toMatch(/src\/foo\.ts/);
      expect(e.target).not.toMatch(/^(src\/foo\.ts|unresolved:src\/foo\.ts)/);
    }
    // Unresolved targets (file-scoped per the earlier codex fix) get rewritten
    const unresolvedEdge = got!.edges.find((e) => e.target.startsWith("unresolved:"));
    expect(unresolvedEdge?.target).toBe("unresolved:src/renamed.ts:Base:class");
    // External targets are NOT path-prefixed, so they stay as-is
    const externalEdge = got!.edges.find((e) => e.target.startsWith("external:"));
    expect(externalEdge?.target).toBe("external:./bar");
    // parse_errors source_file rewritten
    expect(got!.parse_errors[0]!.source_file).toBe("src/renamed.ts");
  });

  it("returns null when schema version mismatches", () => {
    const sha = "deadbeef";
    const ex = makeExtraction("src/foo.ts");
    const path = cachePath(baseDir, sha);
    // Write directly with a wrong schema version
    writeCache(baseDir, sha, ex);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    raw.schema = CACHE_SCHEMA_VERSION + 999;
    writeFileSync(path, JSON.stringify(raw));
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("returns null when stored content_sha256 mismatches the lookup key", () => {
    const sha = "deadbeef";
    const ex = makeExtraction("src/foo.ts");
    writeCache(baseDir, sha, ex);
    const path = cachePath(baseDir, sha);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    raw.content_sha256 = "different";
    writeFileSync(path, JSON.stringify(raw));
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    const sha = "deadbeef";
    const path = cachePath(baseDir, sha);
    require("node:fs").mkdirSync(cacheDir(baseDir), { recursive: true });
    writeFileSync(path, "{ corrupt JSON, no close brace");
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("returns null when entry is missing required fields", () => {
    const sha = "deadbeef";
    const path = cachePath(baseDir, sha);
    require("node:fs").mkdirSync(cacheDir(baseDir), { recursive: true });
    writeFileSync(path, JSON.stringify({ schema: CACHE_SCHEMA_VERSION, content_sha256: sha }));
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("returns null when array items have non-string id/source/target (codex P1 fix)", () => {
    // The shape passes the array-typeof check but per-item fields are wrong
    // (numbers instead of strings). Without per-item validation, the
    // same-path early-return in rewriteSourceFile would let this through.
    const sha = "deadbeef";
    const path = cachePath(baseDir, sha);
    require("node:fs").mkdirSync(cacheDir(baseDir), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        schema: CACHE_SCHEMA_VERSION,
        content_sha256: sha,
        extraction: {
          source_file: "src/foo.ts",
          language: "typescript",
          nodes: [{ id: 1, source_file: "src/foo.ts" }],
          edges: [{ source: null, target: undefined }],
          parse_errors: [],
        },
      }),
    );
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("returns null when items have valid id/source but malformed secondary fields (codex P1 followup)", () => {
    // A subtler corruption: id is a string (passes the minimum check) but
    // label, kind, source_location, etc. are wrong types. On a same-path
    // call rewriteSourceFile would silently return this and downstream
    // consumers would crash on n.label.toLowerCase(), e.relation === "...", etc.
    const sha = "deadbeef";
    const path = cachePath(baseDir, sha);
    require("node:fs").mkdirSync(cacheDir(baseDir), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        schema: CACHE_SCHEMA_VERSION,
        content_sha256: sha,
        extraction: {
          source_file: "src/foo.ts",
          language: "typescript",
          // id + source_file are correct strings; everything else is wrong type
          nodes: [{
            id: "src/foo.ts:foo:function",
            label: 1,           // should be string
            kind: null,         // should be string
            source_file: "src/foo.ts",
            source_location: 2, // should be string
            language: "typescript",
            exported: "yes",    // should be boolean
          }],
          edges: [],
          parse_errors: [],
        },
      }),
    );
    expect(readCache(baseDir, sha, "src/foo.ts")).toBeNull();
  });

  it("writeCache uses atomic temp+rename (no leftover .tmp.* on success)", () => {
    const sha = "deadbeef";
    const ex = makeExtraction("src/foo.ts");
    writeCache(baseDir, sha, ex);
    const dir = cacheDir(baseDir);
    expect(existsSync(cachePath(baseDir, sha))).toBe(true);
    const leftovers = require("node:fs").readdirSync(dir).filter((f: string) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
  });

  it("rewriteSourceFile is a no-op when paths match", () => {
    const sha = "deadbeef";
    const ex = makeExtraction("src/foo.ts");
    writeCache(baseDir, sha, ex);
    const got = readCache(baseDir, sha, "src/foo.ts");
    expect(got).not.toBeNull();
    // Original arrays preserved (no mutation overhead path)
    expect(got!.nodes).toEqual(ex.nodes);
  });

  it("relocated hit preserves raw_calls (caller_id rewritten) and import_bindings verbatim", () => {
    const sha = "deadbeef";
    const ex: FileExtraction = {
      ...makeExtraction("src/foo.ts"),
      raw_calls: [
        { caller_id: "src/foo.ts:foo:function", callee_name: "greet" },
        { caller_id: "src/foo.ts::module", callee_name: "greet", receiver: "ns" },
      ],
      import_bindings: [
        { local_name: "greet", imported_name: "hello", kind: "named", specifier: "./bar" },
        { local_name: "ns", imported_name: "*", kind: "namespace", specifier: "../util" },
        { local_name: "Shape", imported_name: "Shape", kind: "named", specifier: "./bar", type_only: true },
      ],
    };
    writeCache(baseDir, sha, ex);
    const got = readCache(baseDir, sha, "lib/deep/renamed.ts");
    expect(got).not.toBeNull();
    expect(got!.raw_calls).toEqual([
      { caller_id: "lib/deep/renamed.ts:foo:function", callee_name: "greet" },
      { caller_id: "lib/deep/renamed.ts::module", callee_name: "greet", receiver: "ns" },
    ]);
    // Specifiers stay raw; the resolver interprets them relative to source_file.
    expect(got!.import_bindings).toEqual(ex.import_bindings);
  });

  it("relocated hit keeps optional cross-file fields absent when the entry omits them", () => {
    const sha = "deadbeef";
    writeCache(baseDir, sha, makeExtraction("src/foo.ts"));
    const got = readCache(baseDir, sha, "src/renamed.ts");
    expect(got).not.toBeNull();
    expect("raw_calls" in got!).toBe(false);
    expect("import_bindings" in got!).toBe(false);
  });
});

describe("cache — relocated content with real TypeScript extraction", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "graph-cache-reloc-"));
  });
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  function meta(): GraphMetadata {
    return { schema_version: 1, generator: "hivemind-graph", commit_sha: "c", repo_key: "k" };
  }
  function obs(): GraphObservation {
    return {
      ts: "2026-06-03T00:00:00Z", branch: "main", worktree_path: "/t", repo_project: "t",
      generator_version: "0.0.0-test", source_files_extracted: 0, source_files_skipped: 0,
    };
  }

  const CALLER_SRC =
    `import { greet } from "./b";\n` +
    `export function run() { return greet(); }\n` +
    `export class Runner { go() { return greet(); } }\n`;
  const CALLEE_SRC = `export function greet() { return "hi"; }\n`;

  it("extract → cache → read under new path → buildSnapshot resolves cross-file calls from the new path", () => {
    const sha = fileContentHash(CALLER_SRC);
    const original = extractTypeScript(CALLER_SRC, "src/a.ts");
    // Sanity: the real extractor emits the Phase 1.5 inputs this test relies on.
    expect(original.raw_calls!.length).toBeGreaterThan(0);
    expect(original.import_bindings!.length).toBeGreaterThan(0);
    writeCache(baseDir, sha, original);
    const entryBytes = readFileSync(cachePath(baseDir, sha), "utf8");

    const moved = readCache(baseDir, sha, "lib/a.ts");
    expect(moved).not.toBeNull();

    // Relocated hit must match a fresh extraction at the new path.
    const fresh = extractTypeScript(CALLER_SRC, "lib/a.ts");
    expect(moved!.raw_calls).toEqual(fresh.raw_calls);
    expect(moved!.import_bindings).toEqual(fresh.import_bindings);
    for (const rc of moved!.raw_calls!) {
      expect(rc.caller_id.startsWith("lib/a.ts:")).toBe(true);
    }

    // Both src/b.ts and lib/b.ts exist; "./b" must resolve relative to lib/a.ts.
    const srcB = extractTypeScript(CALLEE_SRC, "src/b.ts");
    const libB = extractTypeScript(CALLEE_SRC, "lib/b.ts");
    const snap = buildSnapshot([moved!, srcB, libB], meta(), obs());
    const calls = snap.links.filter((e) => e.relation === "calls");
    expect(calls.some((e) => e.source === "lib/a.ts:run:function" && e.target === "lib/b.ts:greet:function")).toBe(true);
    const methodCaller = fresh.raw_calls!.find((rc) => !rc.caller_id.endsWith(":run:function"))!.caller_id;
    expect(calls.some((e) => e.source === methodCaller && e.target === "lib/b.ts:greet:function")).toBe(true);
    expect(calls.some((e) => e.target === "src/b.ts:greet:function")).toBe(false);
    expect(snap.links.some((e) => e.source.startsWith("src/a.ts"))).toBe(false);

    // The cached-path snapshot is identical to one built from fresh extractions.
    const freshSnap = buildSnapshot([fresh, srcB, libB], meta(), obs());
    expect(snap.links).toEqual(freshSnap.links);
    expect(snap.nodes).toEqual(freshSnap.nodes);

    // The stored entry is untouched, and a read under the original path still
    // yields the original (non-relocated) extraction.
    expect(readFileSync(cachePath(baseDir, sha), "utf8")).toBe(entryBytes);
    const again = readCache(baseDir, sha, "src/a.ts");
    expect(again!.raw_calls).toEqual(original.raw_calls);
    expect(again!.import_bindings).toEqual(original.import_bindings);
    for (const rc of again!.raw_calls!) {
      expect(rc.caller_id.startsWith("src/a.ts:")).toBe(true);
    }
  });
});
