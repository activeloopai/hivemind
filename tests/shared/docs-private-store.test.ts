import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readPrivateDoc,
  writePrivateDoc,
  listPrivateDocs,
  deletePrivateDoc,
  privateStoreRoot,
  type PrivateDoc,
} from "../../src/docs/private-store.js";

const doc = (over: Partial<PrivateDoc> = {}): PrivateDoc => ({
  doc_id: "wiki/pkg/core", path: "/docs/p/wiki/pkg/core.md", content: "# core\n\nbody",
  source_fp: `{"pkg/core/a.ts":"SHA"}`, tier: "slow", updated_at: "t0", ...over,
});

describe("private-store", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "priv-store-"));
    process.env.HIVEMIND_DOCS_PRIVATE_DIR = dir;
  });
  afterEach(() => {
    delete process.env.HIVEMIND_DOCS_PRIVATE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a private doc per (project, scope, doc_id)", () => {
    expect(readPrivateDoc("p", "b:feat", "wiki/pkg/core")).toBeNull();
    writePrivateDoc("p", "b:feat", doc({ content: "PRIVATE" }));
    expect(readPrivateDoc("p", "b:feat", "wiki/pkg/core")?.content).toBe("PRIVATE");
    expect(privateStoreRoot()).toBe(dir);
  });

  it("isolates by project and by scope (no cross-branch/-project bleed)", () => {
    writePrivateDoc("p", "b:feat", doc({ content: "FEAT" }));
    expect(readPrivateDoc("p", "b:other", "wiki/pkg/core")).toBeNull(); // other branch
    expect(readPrivateDoc("q", "b:feat", "wiki/pkg/core")).toBeNull();  // other project
  });

  it("upserts (second write replaces) and lists", () => {
    writePrivateDoc("p", "b:feat", doc({ doc_id: "wiki/a", content: "A1" }));
    writePrivateDoc("p", "b:feat", doc({ doc_id: "wiki/a", content: "A2" }));
    writePrivateDoc("p", "b:feat", doc({ doc_id: "wiki/b", content: "B" }));
    expect(readPrivateDoc("p", "b:feat", "wiki/a")?.content).toBe("A2");
    expect(listPrivateDocs("p", "b:feat").map((d) => d.doc_id).sort()).toEqual(["wiki/a", "wiki/b"]);
  });

  it("deletes a doc (e.g. after promotion on push)", () => {
    writePrivateDoc("p", "b:feat", doc());
    deletePrivateDoc("p", "b:feat", "wiki/pkg/core");
    expect(readPrivateDoc("p", "b:feat", "wiki/pkg/core")).toBeNull();
  });

  it("a corrupt store file degrades to empty, never throws", () => {
    writePrivateDoc("p", "b:feat", doc());
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);
    writeFileSync(join(dir, files[0]), "{ not json");
    expect(readPrivateDoc("p", "b:feat", "wiki/pkg/core")).toBeNull();
    expect(listPrivateDocs("p", "b:feat")).toEqual([]);
  });

  it("distinct scopes with slug-colliding names do NOT share a file (injective)", () => {
    writePrivateDoc("p", "b:feat/x", doc({ content: "SLASH" }));
    writePrivateDoc("p", "b:feat_x", doc({ content: "UNDERSCORE" }));
    expect(readPrivateDoc("p", "b:feat/x", "wiki/pkg/core")?.content).toBe("SLASH");
    expect(readPrivateDoc("p", "b:feat_x", "wiki/pkg/core")?.content).toBe("UNDERSCORE");
  });
});
