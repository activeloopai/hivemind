import { describe, expect, it, vi } from "vitest";
import { changedFilesFromGit, expandToCandidateFiles } from "../../src/docs/candidates.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, source_file: string): GraphNode {
  return { id, label: id, kind: "function", source_file, source_location: "L1", language: "typescript", exported: true };
}
function snap(nodes: GraphNode[], links: Array<{ source: string; target: string; relation: string }> = []): GraphSnapshot {
  return { nodes, links } as unknown as GraphSnapshot;
}

describe("changedFilesFromGit", () => {
  it("unions working-tree changes with the last commit, deduped", async () => {
    const git = vi.fn((args: string[]) => {
      if (args.join(" ") === "diff --name-only HEAD") return "src/money.ts\nsrc/cart.ts\n";
      if (args.join(" ") === "diff --name-only HEAD~1 HEAD") return "src/cart.ts\nsrc/util.ts\n";
      return "";
    });
    const out = changedFilesFromGit("/x", git)!;
    expect(new Set(out)).toEqual(new Set(["src/money.ts", "src/cart.ts", "src/util.ts"]));
  });

  it("returns null when git is unavailable (→ caller does a full scan)", () => {
    const git = vi.fn(() => null); // not a repo / git missing
    expect(changedFilesFromGit("/x", git)).toBeNull();
  });

  it("returns [] when git works but nothing changed", () => {
    const git = vi.fn(() => "");
    expect(changedFilesFromGit("/x", git)).toEqual([]);
  });

  it("includes untracked (new, non-ignored) files — the new-file case", () => {
    const git = vi.fn((args: string[]) =>
      args.join(" ") === "ls-files --others --exclude-standard" ? "src/tax.ts\n" : "",
    );
    expect(changedFilesFromGit("/x", git)).toEqual(["src/tax.ts"]);
  });
});

describe("expandToCandidateFiles", () => {
  // cart.ts:total calls money.ts:addTax  → editing money.ts must pull cart.ts in.
  const s = snap(
    [node("src/money.ts:addTax:function", "src/money.ts"), node("src/cart.ts:total:function", "src/cart.ts"), node("src/other.ts:x:function", "src/other.ts")],
    [{ source: "src/cart.ts:total:function", target: "src/money.ts:addTax:function", relation: "calls" }],
  );

  it("includes the changed file AND its transitive callers", () => {
    const out = new Set(expandToCandidateFiles(s, ["src/money.ts"]));
    expect(out.has("src/money.ts")).toBe(true);  // the changed file
    expect(out.has("src/cart.ts")).toBe(true);   // caller of addTax
    expect(out.has("src/other.ts")).toBe(false); // unrelated → not loaded
  });

  it("returns just the changed files when they define no graph symbols", () => {
    expect(expandToCandidateFiles(s, ["README.md"])).toEqual(["README.md"]);
  });
});
